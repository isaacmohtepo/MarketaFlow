import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";
import { canCreateBrand } from "@/lib/billing";

/**
 * POST /api/brands/[id]/duplicate
 *
 * Crea una nueva marca con el mismo color, bio, hashtag sets y plantillas
 * que la origen. NO copia: posts, comentarios, memberships, tokens públicos
 * (publicToken, widgetToken, inviteCode se regeneran). El usuario que duplica
 * queda como owner. Pensado para onboarding rápido de nuevos clientes con
 * setup similar.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, id);
  if (!access) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, access.agencyId, "brands.create");
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: brands.create" }, { status: 403 });
  }

  const source = await prisma.brand.findUnique({
    where: { id },
    include: {
      hashtagSets: true,
      templates: true,
    },
  });
  if (!source) return NextResponse.json({ error: "Marca no encontrada" }, { status: 404 });

  // Duplicar crea una marca nueva → cuenta para el límite del plan
  // (sino sería un bypass del check de POST /api/brands).
  const check = await canCreateBrand(source.agencyId);
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

  const newBrand = await prisma.$transaction(async (tx) => {
    const created = await tx.brand.create({
      data: {
        name: `${source.name} (copia)`,
        handle: null, // handle único, dejamos al usuario que lo defina
        agencyId: source.agencyId,
        color: source.color,
        bio: source.bio,
        logoUrl: source.logoUrl,
        // inviteCode se autogenera; publicToken/widgetToken quedan null
      },
    });

    // No creamos membership brand-level: el usuario ya tiene agency-level
    // (brandId: null) que le da acceso a todas las marcas de su agencia.

    // Copia de hashtag sets
    if (source.hashtagSets.length > 0) {
      await tx.hashtagSet.createMany({
        data: source.hashtagSets.map((s) => ({
          brandId: created.id,
          name: s.name,
          tags: s.tags,
        })),
      });
    }

    // Copia de plantillas
    if (source.templates.length > 0) {
      await tx.postTemplate.createMany({
        data: source.templates.map((t) => ({
          brandId: created.id,
          name: t.name,
          caption: t.caption,
          platform: t.platform,
          postType: t.postType,
        })),
      });
    }

    return created;
  });

  return NextResponse.json({ id: newBrand.id });
}
