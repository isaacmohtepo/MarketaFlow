import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canInviteTeamMember } from "@/lib/billing";

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

  // Serializable transaction: re-check del límite + create de membership +
  // mark invitation accepted, todo atómico. Cierra la TOCTOU donde dos
  // invitations aceptadas en paralelo podrían pasar ambas el check.
  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.membership.findFirst({
        where: { userId: user.id, agencyId: inv.agencyId, brandId: null },
      });
      if (!existing) {
        const check = await canInviteTeamMember(inv.agencyId, tx);
        if (!check.ok) return { ok: false as const };
        await tx.membership.create({
          data: { userId: user.id, agencyId: inv.agencyId, role: inv.role },
        });
      }
      await tx.teamInvitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      });
      return { ok: true as const };
    },
    { isolationLevel: "Serializable" },
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          "La agencia ya no tiene espacio en su plan para sumarte. Contactá al owner.",
      },
      { status: 402 },
    );
  }
  return NextResponse.json({ ok: true });
}
