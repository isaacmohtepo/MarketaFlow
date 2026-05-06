import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { canInviteClient } from "@/lib/billing";

const schema = z.object({
  name: z.string().min(1).max(80),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const brand = await prisma.brand.findUnique({
    where: { publicToken: token },
    include: { agency: true },
  });
  if (!brand) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  // Plan limits enforcement: el plan free permite 1 cliente por marca.
  // Cada acceso por share link cuenta como un cliente.
  const check = await canInviteClient(brand.id);
  if (!check.ok) {
    return NextResponse.json(
      {
        error:
          "Esta marca no acepta más clientes en su plan actual. Contactá a la agencia.",
      },
      { status: 402 },
    );
  }

  const guestId = randomBytes(8).toString("hex");
  const email = `guest_${guestId}@guest.local`;
  const passwordHash = await hashPassword(randomBytes(16).toString("hex"));

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email,
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
