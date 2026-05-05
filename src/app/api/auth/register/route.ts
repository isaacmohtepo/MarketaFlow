import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";

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
  });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
