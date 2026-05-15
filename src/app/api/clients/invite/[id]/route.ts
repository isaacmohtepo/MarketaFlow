import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";

/**
 * DELETE /api/clients/invite/[id]
 *
 * Revoca una invitación pendiente. Solo se pueden borrar las que están sin
 * aceptar — las aceptadas dejan de ser invitations (ya hay memberships).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const inv = await prisma.teamInvitation.findUnique({ where: { id } });
  if (!inv) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  if (!(await hasPermission(user.id, inv.agencyId, "clients.invite"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  await prisma.teamInvitation.delete({ where: { id } });

  audit({
    category: "team",
    action: "client.invitation_revoked",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: id,
    metadata: { invitedEmail: inv.email, brandIds: inv.brandIds },
    req,
  });

  return NextResponse.json({ ok: true });
}
