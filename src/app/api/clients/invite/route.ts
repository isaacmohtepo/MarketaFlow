import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sendEmail, appUrl } from "@/lib/email";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { tplClientInvite } from "@/lib/email-templates";
import { getWhiteLabel } from "@/lib/white-label";

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

  // White-label: si la agency tiene WL activo y configurado, el email
  // se manda con el branding del cliente (logo, color, nombre) en vez
  // del MarketaFlow default. Si WL está off, getWhiteLabel devuelve
  // enabled=false → pasamos null al template y usa el shell default.
  const wlRaw = await getWhiteLabel(m.agencyId);
  const wl = wlRaw.enabled
    ? {
        brandName: wlRaw.brandName,
        logoUrl: wlRaw.logoUrl,
        accentColor: wlRaw.accentColor,
      }
    : null;
  const senderBrand = wl?.brandName ?? "MarketaFlow";
  const inviterName = user.name ?? user.email;

  sendEmail({
    to: body.email,
    subject: `${inviterName} te invitó a revisar contenido en ${senderBrand}`,
    html: tplClientInvite({
      inviterName,
      agencyName: m.agency.name,
      brandNames: brands.map((b) => b.name),
      acceptUrl,
      wl,
    }),
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
