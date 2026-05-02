import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

const schema = z.object({
  brandId: z.string(),
  order: z.array(z.string()).min(1),
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

  const access = await getBrandAccess(user.id, body.brandId);
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const owned = await prisma.post.findMany({
    where: { id: { in: body.order }, brandId: body.brandId },
    select: { id: true },
  });
  if (owned.length !== body.order.length) {
    return NextResponse.json({ error: "Posts inválidos" }, { status: 400 });
  }

  await prisma.$transaction(
    body.order.map((id, idx) =>
      prisma.post.update({ where: { id }, data: { position: idx } }),
    ),
  );

  return NextResponse.json({ ok: true });
}
