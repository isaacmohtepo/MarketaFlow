import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { verifyToken, verifyRecoveryCode } from "@/lib/totp";

const schema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1),
  // Código 2FA opcional. Acepta 6 dígitos TOTP O un recovery code
  // (ej. "abc12-de345"). Si user tiene 2FA y no manda esto, devolvemos
  // requires2fa=true y el frontend pide el código.
  totpToken: z.string().min(1).max(40).optional(),
});

export async function POST(req: Request) {
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Rate limit doble: por IP (5/min) y por email (5/15min) para prevenir
  // brute force tanto desde una IP como contra un email específico.
  const byIp = rateLimit(req, { key: "login:ip", limit: 5, windowMs: 60_000 });
  if (!byIp.ok) return rateLimitResponse(byIp);
  const byEmail = rateLimit(req, {
    key: "login:email",
    limit: 5,
    windowMs: 15 * 60_000,
    extra: body.email.toLowerCase(),
  });
  if (!byEmail.ok) {
    return rateLimitResponse(
      byEmail,
      "Demasiados intentos para esta cuenta. Probá en unos minutos.",
    );
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Hash dummy con el mismo cost que un user real — corremos bcrypt SIEMPRE
  // para evitar timing attack que revele si un email está registrado.
  // (bcrypt.compare con un hash inválido tarda ~100ms igual, en vez de skip
  // y devolver inmediato cuando user es null).
  const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8mKqNk1QeI6V8Qw0Ny0nnY7p8wJZqW";
  const validHash = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(body.password, validHash);
  if (!user || !passwordOk) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }
  // Bloqueo por admin: deshabilitamos login (mismo mensaje genérico que
  // credenciales para no filtrar el estado de la cuenta a un attacker).
  if (user.disabledAt) {
    return NextResponse.json(
      { error: "Esta cuenta fue deshabilitada. Contactá soporte." },
      { status: 403 },
    );
  }

  // Hard-block para admins sin 2FA después del grace period (default 7 días
  // desde signup). El layout muestra banner amarillo desde el día 1, banner
  // rojo en day 7. A partir del day 7+ bloqueamos login total para forzar
  // la activación. Configurable via env ADMIN_2FA_GRACE_DAYS.
  if (user.role === "admin" && !user.totpEnabledAt) {
    const graceDays = Number(process.env.ADMIN_2FA_GRACE_DAYS ?? "7");
    const elapsedDays =
      (Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    if (elapsedDays >= graceDays) {
      return NextResponse.json(
        {
          error:
            "Tu cuenta admin requiere 2FA activado. Contactá a otro admin para resetear esto si perdiste acceso.",
          requires2faSetup: true,
        },
        { status: 403 },
      );
    }
  }

  // 2FA enforcement: si el user tiene TOTP activado, exigimos el código.
  if (user.totpEnabledAt && user.totpSecret) {
    if (!body.totpToken) {
      return NextResponse.json(
        { requires2fa: true, message: "Ingresá tu código de 6 dígitos." },
        { status: 401 },
      );
    }
    // Intentar TOTP primero (formato 6 dígitos). Si no, probar recovery code.
    const isDigits = /^\d{6}$/.test(body.totpToken);
    let twoFaOk = false;
    if (isDigits) {
      twoFaOk = verifyToken(user.totpSecret, body.totpToken);
    }
    if (!twoFaOk) {
      // Fallback: recovery code. Si matchea, lo consumimos (one-time use).
      const codes = (user.recoveryCodesHash as string[] | null) ?? [];
      if (codes.length > 0) {
        const idx = await verifyRecoveryCode(codes, body.totpToken);
        if (idx >= 0) {
          twoFaOk = true;
          const remaining = codes.filter((_, i) => i !== idx);
          await prisma.user.update({
            where: { id: user.id },
            data: { recoveryCodesHash: remaining },
          });
        }
      }
    }
    if (!twoFaOk) {
      return NextResponse.json(
        { error: "Código 2FA incorrecto", requires2fa: true },
        { status: 401 },
      );
    }
  }

  await createSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return NextResponse.json({ ok: true });
}
