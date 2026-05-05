import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(120),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const ok = await verifyPassword(body.currentPassword, full.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 400 });
  }

  if (body.newPassword === body.currentPassword) {
    return NextResponse.json(
      { error: "La nueva contraseña debe ser distinta" },
      { status: 400 },
    );
  }

  const newHash = await hashPassword(body.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  return NextResponse.json({ ok: true });
}
