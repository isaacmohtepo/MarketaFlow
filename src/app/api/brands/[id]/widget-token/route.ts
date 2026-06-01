import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Genera (o regenera) un widget token para la marca.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandRef } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const access = await getBrandAccess(user.id, brandRef);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const brandId = access.brandId;
  const ok = await hasPermission(user.id, access.agencyId, "share.manage", brandId);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: share.manage" }, { status: 403 });
  }

  const token = `mf_${randomBytes(16).toString("hex")}`;
  const brand = await prisma.brand.update({
    where: { id: brandId },
    data: { widgetToken: token },
    select: { widgetToken: true },
  });

  return NextResponse.json({ widgetToken: brand.widgetToken });
}

// Revoca el widget token (deja la marca sin widget).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandRef } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const access = await getBrandAccess(user.id, brandRef);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const brandId = access.brandId;
  const ok = await hasPermission(user.id, access.agencyId, "share.manage", brandId);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: share.manage" }, { status: 403 });
  }

  await prisma.brand.update({
    where: { id: brandId },
    data: { widgetToken: null },
  });
  return NextResponse.json({ ok: true });
}
