import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/users/[id]/reset-password
 *   { newPassword?: string }
 *
 * Si se manda newPassword, se setea esa. Si no, se genera una aleatoria
 * y se devuelve UNA VEZ en la respuesta para que el admin se la pase al
 * usuario (típicamente por canal seguro). Tras el reset, todas las
 * sesiones del user se invalidan para forzar re-login.
 */

const schema = z.object({
  newPassword: z
    .string()
    .min(8)
    .max(120)
    .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p))
    .optional(),
});

function generateTempPassword(): string {
  // 16 chars: letras (mayus + minus) + dígitos. Evitamos chars confusos
  // (0/O, 1/l/I) para que sea más cómodo dictar/copiar.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const len = 16;
  let out = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) {
    out += alphabet[buf[i] % alphabet.length];
  }
  // Garantizar al menos una letra y un dígito (zod-style validation por las dudas)
  if (!/[A-Za-z]/.test(out)) out = "A" + out.slice(1);
  if (!/\d/.test(out)) out = out.slice(0, -1) + "9";
  return out;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  let body;
  try {
    body = schema.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const generated = !body.newPassword;
  const password = body.newPassword ?? generateTempPassword();
  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    // Forzar logout en todos los devices del target
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);

  audit({
    category: "admin",
    action: "user.password_reset",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { generated, sessionsRevoked: true },
    req,
  });

  // Solo devolvemos la pass si fue generada. Si el admin la mandó él mismo,
  // no la devolvemos en el response (la sabe).
  return NextResponse.json({
    ok: true,
    ...(generated ? { temporaryPassword: password } : {}),
  });
}
