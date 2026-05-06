import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadFile } from "@/lib/storage";

/**
 * Allowlist de MIME types permitidos para upload. Bloqueamos:
 * - text/html, image/svg+xml → vector de XSS si se sirven desde nuestro dominio
 * - application/x-msdownload, .exe, .bat, .sh → ejecutables
 * - cualquier cosa que no esté explícitamente acá
 *
 * Para agregar un tipo, sumalo acá Y verificá que el preview UI lo soporte.
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

  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Máximo 25MB por archivo" }, { status: 413 });
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
    return NextResponse.json({ error: "Error al subir" }, { status: 500 });
  }
}
