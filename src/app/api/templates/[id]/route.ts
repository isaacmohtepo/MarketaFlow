import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  caption: z.string().max(5000).optional(),
  platform: z.string().max(40).optional(),
  postType: z.string().max(40).optional(),
});

async function getOwnedTemplate(userId: string, id: string) {
  const t = await prisma.postTemplate.findUnique({ where: { id } });
  if (!t) return null;
  const access = await getBrandAccess(userId, t.brandId);
  if (!access) return null;
  const ok = await hasPermission(userId, access.agencyId, "library.manage", t.brandId);
  if (!ok) return null;
  return t;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const t = await getOwnedTemplate(user.id, id);
  if (!t) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = updateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const template = await prisma.postTemplate.update({
    where: { id },
    data: body,
  });
  return NextResponse.json({ template });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const t = await getOwnedTemplate(user.id, id);
  if (!t) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  await prisma.postTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
