import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sendEmail, appUrl } from "@/lib/email";
import { canInviteTeamMember } from "@/lib/billing";
import { audit } from "@/lib/audit";

const inviteSchema = z.object({
  // Lowercase + trim para match con register/login (case-insensitive lookup).
  // Sin esto, invitar "Alice@x.com" cuando ella se registró como "alice@x.com"
  // crea invitación duplicada porque el findUnique por email no matchea.
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase().trim()),
  role: z.enum(["editor", "owner"]).default("editor"),
});

async function getOwnedAgency(userId: string) {
  const m = await prisma.membership.findFirst({
    where: { userId, role: "owner", brandId: null },
    include: { agency: true },
  });
  return m;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const owner = await getOwnedAgency(user.id);
  if (!owner) return NextResponse.json({ members: [], invitations: [] });

  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { agencyId: owner.agencyId, brandId: null, role: { in: ["owner", "editor"] } },
      include: { user: true },
      orderBy: { id: "asc" },
    }),
    prisma.teamInvitation.findMany({
      where: { agencyId: owner.agencyId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    agencyName: owner.agency.name,
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      isYou: m.userId === user.id,
    })),
    invitations: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt.toISOString(),
      url: appUrl(`/team/accept/${inv.token}`),
    })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const owner = await getOwnedAgency(user.id);
  if (!owner)
    return NextResponse.json({ error: "Solo el owner puede invitar" }, { status: 403 });

  let body;
  try {
    body = inviteSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Plan limits enforcement: chequea si la agency puede sumar otro miembro
  const check = await canInviteTeamMember(owner.agencyId);
  if (!check.ok) {
    return NextResponse.json(
      {
        error: check.reason,
        currentCount: check.currentCount,
        limit: check.limit,
        suggestedPlan: check.suggestedPlan,
      },
      { status: 402 },
    );
  }

  // ¿Ya está en el equipo?
  const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findFirst({
      where: { userId: existingUser.id, agencyId: owner.agencyId, brandId: null },
    });
    if (existingMembership) {
      return NextResponse.json(
        { error: "Esta persona ya es parte del equipo" },
        { status: 409 },
      );
    }
  }

  // ¿Ya invitada y vigente?
  const existingInv = await prisma.teamInvitation.findFirst({
    where: {
      agencyId: owner.agencyId,
      email: body.email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (existingInv) {
    return NextResponse.json(
      { error: "Ya hay una invitación vigente para este email" },
      { status: 409 },
    );
  }

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 días
  const inv = await prisma.teamInvitation.create({
    data: {
      agencyId: owner.agencyId,
      email: body.email,
      role: body.role,
      expiresAt,
    },
  });

  audit({
    category: "team",
    action: "invitation.sent",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: inv.id,
    metadata: {
      agencyId: owner.agencyId,
      invitedEmail: body.email,
      role: body.role,
    },
    req,
  });

  const acceptUrl = appUrl(`/team/accept/${inv.token}`);
  // Email de invitación. Escapamos los strings user-controlled para evitar
  // que un nombre con HTML rompa el template o inyecte phishing.
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const inviterName = escapeHtml(user.name ?? user.email);
  const agencyName = escapeHtml(owner.agency.name);
  sendEmail({
    to: body.email,
    subject: `${inviterName} te invita a unirte a ${agencyName}`,
    html: `
      <p style="font-family:system-ui,sans-serif;color:#1d1d1f;line-height:1.5">
        Hola,<br/><br/>
        <strong>${inviterName}</strong> te invitó a unirte como
        <strong>${body.role === "owner" ? "owner" : "editor"}</strong> a la agencia
        <strong>${agencyName}</strong> en MarketaFlow.<br/><br/>
        <a href="${acceptUrl}" style="background:linear-gradient(135deg,#3b5fff,#8a2be2,#ff4d8f,#ff2d55);color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:9999px;display:inline-block">
          Aceptar invitación
        </a><br/><br/>
        El link expira en 14 días.
      </p>
    `,
  }).catch((e) => console.error("invite email failed", e));

  return NextResponse.json({
    invitation: {
      id: inv.id,
      email: inv.email,
      role: inv.role,
      url: acceptUrl,
      expiresAt: inv.expiresAt.toISOString(),
    },
  });
}
