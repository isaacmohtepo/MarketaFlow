import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  // Normalizamos a lowercase para matchear emails que register guarda así.
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1),
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
  await createSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return NextResponse.json({ ok: true });
}
