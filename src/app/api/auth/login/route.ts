import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { rateLimitAsync, rateLimitResponse } from "@/lib/rate-limit";
import { decryptMaybe } from "@/lib/encryption";
import { verifyToken, verifyRecoveryCode } from "@/lib/totp";
import { getSystemSetting } from "@/lib/system-settings";

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
  // Usamos la versión async que prefiere Upstash sobre in-memory para que
  // el límite sea compartido entre instancias de Lambda en Vercel.
  const byIp = await rateLimitAsync(req, {
    key: "login:ip",
    limit: 5,
    windowMs: 60_000,
  });
  if (!byIp.ok) return rateLimitResponse(byIp);
  const byEmail = await rateLimitAsync(req, {
    key: "login:email",
    limit: 5,
    windowMs: 15 * 60_000,
    extra: body.email.toLowerCase(),
  });
  if (!byEmail.ok) {
    return rateLimitResponse(
      byEmail,
      "Demasiados intentos para esta cuenta. Prueba en unos minutos.",
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
      { error: "Esta cuenta fue deshabilitada. Contacta soporte." },
      { status: 403 },
    );
  }

  // Maintenance mode: admins pasan, nadie más entra.
  const maintenance = await getSystemSetting("maintenanceMode");
  if (maintenance && user.role !== "admin") {
    return NextResponse.json(
      {
        error:
          "MarketaFlow está en mantenimiento. Vuelve a intentar en unos minutos.",
        maintenance: true,
      },
      { status: 503 },
    );
  }

  // Hard-block para admins sin 2FA después del grace period.
  if (user.role === "admin" && !user.totpEnabledAt) {
    const graceDays = await getSystemSetting("admin2faGraceDays");
    const elapsedDays =
      (Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    if (elapsedDays >= graceDays) {
      return NextResponse.json(
        {
          error:
            "Tu cuenta admin requiere 2FA activado. Contacta a otro admin para resetear esto si perdiste acceso.",
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
        { requires2fa: true, message: "Ingresa tu código de 6 dígitos." },
        { status: 401 },
      );
    }
    // Rate limit específico de intentos 2FA. Sin esto, una vez que el
    // password fue válido, un atacante podía brute-forcear 6-dígitos (1M
    // combinaciones) o probar todos los 10 recovery codes sin límite. Los
    // rate limits de arriba (login:ip + login:email) cuentan TODO intento
    // de login, así que también ayudan, pero aquí agregamos un límite más
    // estricto: 8 intentos / 15 min por user-id.
    const twoFaRl = await rateLimitAsync(req, {
      key: "login:2fa",
      limit: 8,
      windowMs: 15 * 60_000,
      extra: user.id,
    });
    if (!twoFaRl.ok) return rateLimitResponse(twoFaRl);

    // Intentar TOTP primero (formato 6 dígitos). Si no, probar recovery code.
    const isDigits = /^\d{6}$/.test(body.totpToken);
    let twoFaOk = false;
    if (isDigits) {
      twoFaOk = verifyToken(await decryptMaybe(user.totpSecret), body.totpToken);
    }
    if (!twoFaOk) {
      // Fallback: recovery code. Si matchea, lo consumimos atómicamente
      // dentro de una transacción que re-lee los codes antes del update.
      // Sin esto, dos requests paralelos con el mismo recovery code
      // podrían ambos pasar (ambos leen codes, ambos quitan el mismo idx,
      // ambos update con la misma lista resultante).
      const initialCodes = (user.recoveryCodesHash as string[] | null) ?? [];
      if (initialCodes.length > 0) {
        const idx = await verifyRecoveryCode(initialCodes, body.totpToken);
        if (idx >= 0) {
          // Transacción Serializable: re-leer fresh + actualizar. Si la lista
          // cambió mientras tanto (otro request consumió el mismo code),
          // Prisma aborta y devolvemos 2FA failed.
          try {
            const consumed = await prisma.$transaction(
              async (tx) => {
                const fresh = await tx.user.findUnique({
                  where: { id: user.id },
                  select: { recoveryCodesHash: true },
                });
                const freshCodes =
                  (fresh?.recoveryCodesHash as string[] | null) ?? [];
                // Re-verificar contra los hashes frescos por si alguno fue
                // consumido en paralelo
                const freshIdx = await verifyRecoveryCode(
                  freshCodes,
                  body.totpToken!,
                );
                if (freshIdx === -1) return false;
                const remaining = freshCodes.filter((_, i) => i !== freshIdx);
                await tx.user.update({
                  where: { id: user.id },
                  data: { recoveryCodesHash: remaining },
                });
                return true;
              },
              { isolationLevel: "Serializable" },
            );
            twoFaOk = consumed;
          } catch (err) {
            // Conflict de transacción Serializable o error DB → no consumimos
            console.error("recovery code atomic consume failed", err);
            twoFaOk = false;
          }
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
