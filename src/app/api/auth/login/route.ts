import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
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
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }
  await createSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return NextResponse.json({ ok: true });
}
