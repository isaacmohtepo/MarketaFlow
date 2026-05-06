import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { startTrialForAgency, canInviteClient } from "@/lib/billing";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Password policy: mínimo 8 caracteres + al menos 1 letra y 1 dígito.
 * No exigimos símbolos ni mayúsculas para no friccionar onboarding pero el
 * mínimo de 8 + complejidad básica protege contra rainbow tables y los
 * passwords más comunes (123456, password, qwerty, etc.).
 */
const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
    message: "La contraseña debe combinar letras y números",
  });

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  agencyName: z.string().min(1).optional(),
  inviteCode: z.string().optional(),
});

export async function POST(req: Request) {
  // Rate limit: 3 registros por IP por hora — evita scripts que crean miles de cuentas
  const rl = rateLimit(req, { key: "register", limit: 3, windowMs: 60 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl);

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: "Ese email ya está registrado" }, { status: 409 });
  }

  const passwordHash = await hashPassword(body.password);

  if (body.inviteCode) {
    const brand = await prisma.brand.findUnique({ where: { inviteCode: body.inviteCode } });
    if (!brand) {
      return NextResponse.json({ error: "Invitación inválida" }, { status: 400 });
    }
    // Plan limits enforcement: la agency dueña de la marca debe tener
    // espacio para sumar otro cliente.
    const check = await canInviteClient(brand.id);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.reason, suggestedPlan: check.suggestedPlan },
        { status: 402 },
      );
    }
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        role: "client",
        memberships: {
          create: {
            agencyId: brand.agencyId,
            brandId: brand.id,
            role: "client",
          },
        },
      },
    });
    await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    return NextResponse.json({ ok: true, brandId: brand.id });
  }

  if (!body.agencyName) {
    return NextResponse.json({ error: "Falta el nombre de la agencia" }, { status: 400 });
  }

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash,
      role: "agency",
      memberships: {
        create: {
          agency: { create: { name: body.agencyName } },
          role: "owner",
        },
      },
    },
    include: {
      memberships: { where: { role: "owner", brandId: null }, take: 1 },
    },
  });

  // Onboarding: arrancamos un trial de 14 días en plan Pro automático.
  // El user no necesita pagar para empezar; al fin del trial, si no agregó
  // tarjeta, baja a Free (lo hace el cron diario).
  const ownership = user.memberships[0];
  if (ownership) {
    await startTrialForAgency(ownership.agencyId);
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
