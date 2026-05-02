import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const access = await getBrandAccess(user.id, post.brandId);
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  await prisma.post.update({ where: { id }, data: { deletedAt: null } });
  await recordActivity({ postId: id, userId: user.id, type: "restored" });
  return NextResponse.json({ ok: true });
}
