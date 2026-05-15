import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getEffectiveLimits } from "@/lib/billing";
import { audit } from "@/lib/audit";

/**
 * GET  /api/account/white-label → estado actual del branding
 * PATCH /api/account/white-label { brandName?, logoUrl?, accentColor? }
 *
 * Permiso requerido: `agency.settings` (owner siempre lo tiene).
 *
 * Solo se aceptan cambios si el plan/add-on incluye white-label
 * (whiteLabelEnabled = true en getEffectiveLimits). Esto evita que un
 * user en Free configure branding que no se va a usar.
 */
const patchSchema = z.object({
  brandName: z.string().trim().min(2).max(50).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (ej. #ff4d8f)")
    .nullable()
    .optional(),
});

async function resolveAgencyId(userId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { userId, brandId: null },
    select: { agencyId: true },
  });
  return m?.agencyId ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agencyId = await resolveAgencyId(user.id);
  if (!agencyId) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  const [agency, limits] = await Promise.all([
    prisma.agency.findUnique({
      where: { id: agencyId },
      select: {
        name: true,
        wlBrandName: true,
        wlLogoUrl: true,
        wlAccentColor: true,
      },
    }),
    getEffectiveLimits(agencyId),
  ]);

  return NextResponse.json({
    enabled: limits.whiteLabelEnabled === true,
    agencyName: agency?.name,
    brandName: agency?.wlBrandName ?? null,
    logoUrl: agency?.wlLogoUrl ?? null,
    accentColor: agency?.wlAccentColor ?? null,
  });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agencyId = await resolveAgencyId(user.id);
  if (!agencyId) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, agencyId, "agency.settings"))) {
    return NextResponse.json(
      { error: "Sin permiso: agency.settings" },
      { status: 403 },
    );
  }

  const limits = await getEffectiveLimits(agencyId);
  if (!limits.whiteLabelEnabled) {
    return NextResponse.json(
      {
        error:
          "Tu plan no incluye white-label. Comprá el add-on White-label en /billing o subí a Agency.",
      },
      { status: 402 },
    );
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Datos inválidos" },
      { status: 400 },
    );
  }

  const updates: Record<string, string | null> = {};
  if (body.brandName !== undefined) updates.wlBrandName = body.brandName;
  if (body.logoUrl !== undefined) updates.wlLogoUrl = body.logoUrl;
  if (body.accentColor !== undefined) updates.wlAccentColor = body.accentColor;

  await prisma.agency.update({
    where: { id: agencyId },
    data: updates,
  });

  audit({
    category: "team",
    action: "white_label.updated",
    actorUserId: user.id,
    actorEmail: user.email,
    metadata: { agencyId, changes: body },
    req,
  });

  return NextResponse.json({ ok: true });
}
