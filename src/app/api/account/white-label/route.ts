import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyId } from "@/lib/active-agency";
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
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (ej. #ff4d8f)");

/**
 * Valida que la URL del logo apunte a nuestro storage (R2 o local).
 *
 * SEGURIDAD: sin esta validación un atacante con `agency.settings` podía
 * poner `logoUrl: "https://attacker.com/track.gif"` y como el logo se
 * muestra en emails que abre el cliente externo, el atacante ve cada
 * apertura del correo (IP, user agent, referer). Eso es tracking
 * silencioso + fingerprint del cliente.
 *
 * Permitidos:
 *  - URLs que empiezan con R2_PUBLIC_URL (storage propio)
 *  - URLs relativas /uploads/... (modo dev local sin R2)
 */
function isAllowedLogoUrl(url: string): boolean {
  // Relativa local (dev sin R2)
  if (url.startsWith("/uploads/") || url.startsWith("/")) return true;
  const r2Public = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (r2Public && url.startsWith(r2Public + "/")) return true;
  return false;
}

const patchSchema = z.object({
  brandName: z.string().trim().min(2).max(50).nullable().optional(),
  logoUrl: z
    .string()
    .url()
    .max(500)
    .refine(
      isAllowedLogoUrl,
      "El logo debe subirse desde el botón de arriba (no aceptamos URLs externas).",
    )
    .nullable()
    .optional(),
  accentColor: hexColor.nullable().optional(),
  gradientFrom: hexColor.nullable().optional(),
  gradientTo: hexColor.nullable().optional(),
  logoMode: z
    .enum(["logo_and_text", "logo_only", "text_only"])
    .nullable()
    .optional(),
  logoHeight: z.number().int().min(20).max(56).nullable().optional(),
  headerAlign: z.enum(["left", "center", "right"]).nullable().optional(),
});

async function resolveAgencyId(userId: string): Promise<string | null> {
  return getActiveAgencyId(userId);
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
        wlGradientFrom: true,
        wlGradientTo: true,
        wlLogoMode: true,
        wlLogoHeight: true,
        wlHeaderAlign: true,
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
    gradientFrom: agency?.wlGradientFrom ?? null,
    gradientTo: agency?.wlGradientTo ?? null,
    logoMode: agency?.wlLogoMode ?? "logo_and_text",
    logoHeight: agency?.wlLogoHeight ?? 32,
    headerAlign: agency?.wlHeaderAlign ?? null,
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
          "Tu plan no incluye white-label. Compra el add-on White-label en /billing o sube a Agency.",
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

  const updates: Record<string, string | number | null> = {};
  if (body.brandName !== undefined) updates.wlBrandName = body.brandName;
  if (body.logoUrl !== undefined) updates.wlLogoUrl = body.logoUrl;
  if (body.accentColor !== undefined) updates.wlAccentColor = body.accentColor;
  if (body.gradientFrom !== undefined) updates.wlGradientFrom = body.gradientFrom;
  if (body.gradientTo !== undefined) updates.wlGradientTo = body.gradientTo;
  if (body.logoMode !== undefined) updates.wlLogoMode = body.logoMode;
  if (body.logoHeight !== undefined) updates.wlLogoHeight = body.logoHeight;
  if (body.headerAlign !== undefined) updates.wlHeaderAlign = body.headerAlign;

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
