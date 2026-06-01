import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadFile, isR2Configured } from "@/lib/storage";
import { validateMagicBytes } from "@/lib/magic-bytes";

/**
 * Allowlist de MIME types permitidos para upload. Bloqueamos:
 * - text/html, image/svg+xml → vector de XSS si se sirven desde nuestro dominio
 * - application/x-msdownload, .exe, .bat, .sh → ejecutables
 * - cualquier cosa que no esté explícitamente aquí
 *
 * Para agregar un tipo, sumalo aquí Y verifica que el preview UI lo soporte.
 */
const ALLOWED_MIME = new Set<string>([
  // Imágenes (no SVG por XSS)
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  // Videos
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // Docs
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

const BLOCKED_EXTENSIONS = new Set([
  "html",
  "htm",
  "svg",
  "exe",
  "bat",
  "sh",
  "cmd",
  "com",
  "pif",
  "scr",
  "msi",
  "js",
  "jsx",
  "vbs",
  "wsf",
  "ps1",
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  // Cap a 100MB. Para archivos > ~4MB el cliente debería usar
  // /api/upload/presign que hace PUT directo a R2, esquivando el límite
  // del request body de Vercel. Aquí igual aceptamos hasta 100MB para
  // dev local y para clientes sin presign disponible.
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json(
      {
        error: `Máximo 100MB por archivo (subiste ${(file.size / 1024 / 1024).toFixed(1)}MB). Para videos más grandes, comprimilos antes.`,
      },
      { status: 413 },
    );
  }

  // Validar MIME del navegador (no es 100% confiable porque viene del cliente,
  // pero filtra el 99% de uploads accidentales). Defense in depth.
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      {
        error: `Tipo de archivo no permitido (${mime || "desconocido"}). Permitidos: imágenes, videos, PDF, Office, texto.`,
      },
      { status: 415 },
    );
  }

  // Validación adicional por extensión: bloqueamos .html, .svg, .exe, etc.
  // aunque el MIME mienta. Cubre el caso "renombré file.exe a file.png".
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Extensión .${ext} bloqueada por seguridad.` },
      { status: 415 },
    );
  }

  // Validación por magic bytes: comparamos los primeros bytes del archivo
  // contra la firma conocida del MIME declarado. Esto cierra el vector
  // "subo un SVG con <script> declarando MIME image/jpeg" — la firma del
  // SVG NO coincide con JPEG y lo rechazamos antes de subir a R2.
  // Solo leemos los primeros 256 bytes (suficiente para todas las
  // signatures + sniff de texto disfrazado).
  try {
    const headBuf = Buffer.from(
      await file.slice(0, 256).arrayBuffer(),
    );
    const magicCheck = validateMagicBytes(headBuf, mime);
    if (!magicCheck.ok) {
      return NextResponse.json(
        { error: magicCheck.reason },
        { status: 415 },
      );
    }
  } catch (err) {
    console.error("magic-byte validation failed", err);
    return NextResponse.json(
      { error: "No se pudo validar el archivo." },
      { status: 400 },
    );
  }

  try {
    const { url } = await uploadFile(file);
    return NextResponse.json({
      url,
      name: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
    });
  } catch (err) {
    console.error("upload failed", err);
    // Diferenciar la causa para que el frontend pueda mostrar mensaje útil.
    if (!isR2Configured) {
      return NextResponse.json(
        {
          error:
            "Storage no configurado en este servidor. El admin tiene que setear las env vars de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL) en Vercel.",
          code: "storage_not_configured",
        },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      {
        error: `Error al subir: ${msg}`,
        code: "storage_error",
      },
      { status: 500 },
    );
  }
}
