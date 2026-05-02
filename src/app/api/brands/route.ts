import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1),
  handle: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const owner = await prisma.membership.findFirst({
    where: { userId: user.id, role: { in: ["owner", "editor"] }, brandId: null },
  });
  if (!owner) {
    return NextResponse.json({ error: "Solo agencias pueden crear marcas" }, { status: 403 });
  }

  const brand = await prisma.brand.create({
    data: {
      name: body.name,
      handle: body.handle || null,
      agencyId: owner.agencyId,
    },
  });
  return NextResponse.json({ id: brand.id });
}
