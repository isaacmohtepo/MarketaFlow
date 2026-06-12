import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { verifyToken, generateRecoveryCodes } from "@/lib/totp";
import { decryptMaybe } from "@/lib/encryption";
import { rateLimitAsync, rateLimitResponse } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

/**
 * POST /api/account/2fa/verify { token }
 *
 * Confirma el setup: verifica que el código TOTP matchea con el secret
 * guardado, y solo entonces marca totpEnabledAt + genera recovery codes.
 * Devuelve los recovery codes una sola vez para que el user los guarde.
 */
const schema = z.object({ token: z.string().regex(/^\d{6}$/) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rl = await rateLimitAsync(req, {
    key: "2fa-verify",
    limit: 8,
    windowMs: 15 * 60_000,
    extra: user.id,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Código inválido (debe ser 6 dígitos)" }, { status: 400 });
  }

  if (!user.totpSecret) {
    return NextResponse.json(
      { error: "Primero hay que iniciar setup con POST /api/account/2fa" },
      { status: 400 },
    );
  }

  const ok = verifyToken(await decryptMaybe(user.totpSecret), body.token);
  if (!ok) {
    return NextResponse.json(
      { error: "Código inválido. Asegurate que el reloj de tu teléfono esté sincronizado." },
      { status: 400 },
    );
  }

  const { codes, hashes } = await generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabledAt: new Date(),
      recoveryCodesHash: hashes,
    },
  });

  audit({
    category: "auth",
    action: "2fa.enabled",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: user.id,
    req,
  });

  return NextResponse.json({ ok: true, recoveryCodes: codes });
}
