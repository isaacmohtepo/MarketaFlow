import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { startTrialForAgency, canInviteClient } from "@/lib/billing";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  agencyName: z.string().min(1).optional(),
  inviteCode: z.string().optional(),
});

export async function POST(req: Request) {
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
