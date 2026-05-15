import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  getCurrentUser,
  hashPassword,
  verifyPassword,
  getCurrentSessionToken,
} from "@/lib/auth";
import { rateLimitAsync, rateLimitResponse } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

// Misma policy que en register: 8+, letras+números
const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(120)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
    message: "La contraseña debe combinar letras y números",
  });

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Rate limit: 5 intentos por hora por user — previene attempts contra
  // currentPassword si robaron la session pero no la pass.
  const rl = await rateLimitAsync(req, {
    key: "password-change",
    limit: 5,
    windowMs: 60 * 60_000,
    extra: user.id,
  });
  if (!rl.ok) return rateLimitResponse(rl);

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

  // Atomic: actualizar hash + invalidar TODAS las otras sesiones del user.
  // La sesión actual (la que está cambiando la pass) la mantenemos para que
  // no haga falta re-loguear. Cualquier otro device queda fuera.
  const currentToken = await getCurrentSessionToken();
  const [, sessionsDeleted] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    }),
    prisma.session.deleteMany({
      where: {
        userId: user.id,
        ...(currentToken ? { token: { not: currentToken } } : {}),
      },
    }),
  ]);

  audit({
    category: "auth",
    action: "password.changed",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: user.id,
    metadata: { otherSessionsRevoked: sessionsDeleted.count },
    req,
  });

  return NextResponse.json({ ok: true });
}
