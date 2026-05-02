import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const inv = await prisma.teamInvitation.findUnique({ where: { token } });
  if (!inv) return NextResponse.json({ error: "Inválida" }, { status: 404 });
  if (inv.acceptedAt) return NextResponse.json({ error: "Ya usada" }, { status: 400 });
  if (inv.expiresAt < new Date())
    return NextResponse.json({ error: "Expirada" }, { status: 400 });
  if (user.email.toLowerCase() !== inv.email.toLowerCase()) {
    return NextResponse.json(
      { error: "El email de tu cuenta no coincide con la invitación" },
      { status: 403 },
    );
  }

  const existing = await prisma.membership.findFirst({
    where: { userId: user.id, agencyId: inv.agencyId, brandId: null },
  });
  if (!existing) {
    await prisma.membership.create({
      data: { userId: user.id, agencyId: inv.agencyId, role: inv.role },
    });
  }
  await prisma.teamInvitation.update({
    where: { id: inv.id },
    data: { acceptedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
