import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sendEmail, appUrl } from "@/lib/email";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";

/**
 * POST /api/clients/invite { email, brandIds[] }
 *
 * Invita a un cliente externo con acceso de solo lectura (rol "client")
 * a una o más marcas. Reusa la infraestructura de TeamInvitation con el
 * campo `brandIds` poblado — el accept handler crea memberships
 * brand-scoped (no agency-wide) cuando ve este campo.
 *
 * Permiso requerido: `clients.invite` en la agency (definido en
 * lib/permissions.ts). El owner siempre lo tiene; otros roles deben
 * tenerlo asignado explícitamente.
 *
 * GET /api/clients/invite → lista las invites pendientes (rol client)
 * de la agency.
 */

const schema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase().trim()),
  brandIds: z.array(z.string()).min(1).max(20),
});

async function getUserAgency(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, brandId: null },
    include: { agency: true },
    orderBy: { id: "asc" },
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const m = await getUserAgency(user.id);
  if (!m) return NextResponse.json({ invitations: [] });

  if (!(await hasPermission(user.id, m.agencyId, "clients.invite"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const invitations = await prisma.teamInvitation.findMany({
    where: {
      agencyId: m.agencyId,
      role: "client",
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invitations: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      brandIds: inv.brandIds,
      expiresAt: inv.expiresAt.toISOString(),
      url: appUrl(`/team/accept/${inv.token}`),
      createdAt: inv.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const m = await getUserAgency(user.id);
  if (!m) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, m.agencyId, "clients.invite"))) {
    return NextResponse.json(
      { error: "No tenés permiso para invitar clientes" },
      { status: 403 },
    );
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Validar que TODAS las brands pertenezcan a la agency del invitador
  const brands = await prisma.brand.findMany({
    where: { agencyId: m.agencyId, id: { in: body.brandIds } },
    select: { id: true, name: true },
  });
  if (brands.length !== body.brandIds.length) {
    return NextResponse.json(
      { error: "Una o más marcas no son de tu agencia." },
      { status: 400 },
    );
  }

  // Duplicado: ¿ya hay user con ese email + acceso a alguna de esas brands?
  const existingUser = await prisma.user.findUnique({
    where: { email: body.email },
  });
  if (existingUser) {
    const existing = await prisma.membership.findFirst({
      where: {
        userId: existingUser.id,
        agencyId: m.agencyId,
        brandId: { in: body.brandIds },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Esta persona ya tiene acceso a una de esas marcas." },
        { status: 409 },
      );
    }
  }

  // Invitación pendiente duplicada
  const existingInv = await prisma.teamInvitation.findFirst({
    where: {
      agencyId: m.agencyId,
      email: body.email,
      role: "client",
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (existingInv) {
    return NextResponse.json(
      { error: "Ya hay una invitación vigente para este email." },
      { status: 409 },
    );
  }

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const inv = await prisma.teamInvitation.create({
    data: {
      agencyId: m.agencyId,
      email: body.email,
      role: "client",
      brandIds: body.brandIds,
      expiresAt,
    },
  });

  audit({
    category: "team",
    action: "client.invitation_sent",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: inv.id,
    metadata: {
      agencyId: m.agencyId,
      invitedEmail: body.email,
      brandIds: body.brandIds,
    },
    req,
  });

  const acceptUrl = appUrl(`/team/accept/${inv.token}`);
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const inviterName = escapeHtml(user.name ?? user.email);
  const agencyName = escapeHtml(m.agency.name);
  const brandList = brands
    .map((b) => `<strong>${escapeHtml(b.name)}</strong>`)
    .join(", ");

  sendEmail({
    to: body.email,
    subject: `${inviterName} te invitó a revisar contenido en MarketaFlow`,
    html: `
      <p style="font-family:system-ui,sans-serif;color:#1d1d1f;line-height:1.6">
        Hola,<br/><br/>
        <strong>${inviterName}</strong> de <strong>${agencyName}</strong> te
        invitó a revisar y aprobar contenido para ${brandList}.<br/><br/>
        Como cliente vas a poder ver los posts programados, dejar comentarios
        y aprobar o pedir cambios. Solo eso — no podés crear ni editar
        contenido.<br/><br/>
        <a href="${acceptUrl}" style="background:linear-gradient(135deg,#3b5fff,#8a2be2,#ff4d8f,#ff2d55);color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:9999px;display:inline-block">
          Aceptar invitación
        </a><br/><br/>
        Si no tenés cuenta de MarketaFlow, vas a poder crearla rápidamente con
        este mismo email. El link expira en 14 días.
      </p>
    `,
  }).catch((e) => console.error("client invite email failed", e));

  return NextResponse.json({
    invitation: {
      id: inv.id,
      email: inv.email,
      brandIds: inv.brandIds,
      url: acceptUrl,
      expiresAt: inv.expiresAt.toISOString(),
    },
  });
}
