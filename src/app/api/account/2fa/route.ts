import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateSecret, buildOtpauthUrl, buildQrDataUrl } from "@/lib/totp";
import { encrypt } from "@/lib/encryption";
import { rateLimitAsync, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/account/2fa
 *
 * Inicia el setup de 2FA. Genera un secret nuevo (NO lo persiste todavía),
 * devuelve el QR code + secret en plain para mostrarlo en pantalla. El user
 * tiene que escanear el QR en su autenticador y confirmar con un código
 * vía POST /api/account/2fa/verify para que se persista.
 *
 * Si el user ya tenía 2FA activo, devuelve 400.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rl = await rateLimitAsync(req, {
    key: "2fa-setup",
    limit: 5,
    windowMs: 60 * 60_000,
    extra: user.id,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  if (user.totpEnabledAt) {
    return NextResponse.json(
      { error: "Ya tienes 2FA activado. Desactiva primero para regenerar." },
      { status: 400 },
    );
  }

  const secret = generateSecret();
  // Guardamos el secret en DB pero todavía sin totpEnabledAt — esto significa
  // "setup en progreso, falta verificar". Si nunca verifica, queda secret
  // huérfano pero el login no lo exige hasta que totpEnabledAt esté seteado.
  await prisma.user.update({
    where: { id: user.id },
    // Cifrado at-rest: un dump de la DB no expone los secretos TOTP.
    data: { totpSecret: await encrypt(secret), totpEnabledAt: null },
  });

  const otpauthUrl = buildOtpauthUrl({ email: user.email, secret });
  const qrDataUrl = await buildQrDataUrl(otpauthUrl);

  return NextResponse.json({
    secret,
    otpauthUrl,
    qrDataUrl,
  });
}
