import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitAsync, rateLimitResponse } from "@/lib/rate-limit";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * POST /api/account/2fa/disable { password }
 *
 * Desactiva 2FA. Requiere re-autenticación con password (defense in depth
 * por si se filtró la sesión).
 */
const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Anti brute-force del password con una sesión robada.
  const rl = await rateLimitAsync(req, {
    key: "2fa-disable",
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

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      // null (no undefined): undefined hace que Prisma IGNORE el campo y los
      // códigos de recuperación sobrevivirían al desactivar 2FA.
      recoveryCodesHash: Prisma.DbNull,
    },
  });

  audit({
    category: "auth",
    action: "2fa.disabled",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: user.id,
    req,
  });

  return NextResponse.json({ ok: true });
}
