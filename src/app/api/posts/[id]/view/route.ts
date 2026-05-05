import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getPostAccess(user.id, id);
  if (!access) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  await prisma.postView.upsert({
    where: { userId_postId: { userId: user.id, postId: id } },
    create: { userId: user.id, postId: id },
    update: { lastViewedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
