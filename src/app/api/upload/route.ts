import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadFile } from "@/lib/storage";

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
