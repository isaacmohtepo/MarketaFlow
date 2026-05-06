import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, id);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, access.agencyId, "share.manage", id);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: share.manage" }, { status: 403 });
  }

  const token = randomBytes(20).toString("hex");
  const brand = await prisma.brand.update({
    where: { id },
    data: { publicToken: token },
  });

  return NextResponse.json({ publicToken: brand.publicToken });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, id);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, access.agencyId, "share.manage", id);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: share.manage" }, { status: 403 });
  }

  await prisma.brand.update({
    where: { id },
    data: { publicToken: null },
  });

  return NextResponse.json({ ok: true });
}
