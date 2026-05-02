import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Quitar miembro o cancelar invitación
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const owner = await prisma.membership.findFirst({
    where: { userId: user.id, role: "owner", brandId: null },
  });
  if (!owner) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  // ¿Es membership o invitación?
  const m = await prisma.membership.findUnique({ where: { id } });
  if (m) {
    if (m.agencyId !== owner.agencyId) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (m.userId === user.id) {
      return NextResponse.json(
        { error: "No puedes quitarte a ti mismo" },
        { status: 400 },
      );
    }
    await prisma.membership.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  const inv = await prisma.teamInvitation.findUnique({ where: { id } });
  if (inv) {
    if (inv.agencyId !== owner.agencyId) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    await prisma.teamInvitation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "No encontrado" }, { status: 404 });
}
