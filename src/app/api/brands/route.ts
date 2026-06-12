import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, withSerializableRetry } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyMembership } from "@/lib/active-agency";
import { canCreateBrand } from "@/lib/billing";
import { assertAgencyNotSuspended } from "@/lib/suspension";
import { hasPermission } from "@/lib/permissions";
import { generateBrandSlug } from "@/lib/slugs";

const schema = z.object({
  // Cap defensivo: nombres muy largos rompen layout en emails, sidebar y
  // public pages. 80 chars cubre cualquier nombre real de marca.
  name: z.string().trim().min(1).max(80),
  handle: z.string().trim().max(40).optional().nullable(),
  // Color hex de la marca (acento visual). Formato #RRGGBB o #RGB.
  color: z
    .string()
    .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    .optional()
    .nullable(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const owner = await getActiveAgencyMembership(user.id);
  if (!owner) {
    return NextResponse.json({ error: "Sin agencia" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, owner.agencyId, "brands.create");
  if (!ok) {
    return NextResponse.json(
      { error: "Sin permiso: brands.create" },
      { status: 403 },
    );
  }
  const suspendGuard = await assertAgencyNotSuspended(owner.agencyId);
  if (!suspendGuard.ok) return suspendGuard.response;

  // Slug legible único para la URL (`/brands/<slug>`).
  const slug = await generateBrandSlug(body.name);

  // Plan limits enforcement con Serializable transaction para cerrar la
  // race condition (TOCTOU). Sin esto, dos POST paralelos pasarían ambos
  // el `count < limit` y crearían ambos. Postgres en Serializable detecta
  // el conflicto y aborta una de las dos con error de serialización.
  const result = await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const check = await canCreateBrand(owner.agencyId, tx);
        if (!check.ok) {
          return { ok: false as const, check };
        }
        const brand = await tx.brand.create({
          data: {
            name: body.name,
            slug,
            handle: body.handle || null,
            color: body.color || null,
            agencyId: owner.agencyId,
          },
          select: { id: true, slug: true, name: true, color: true, logoUrl: true },
        });
        return { ok: true as const, brand };
      },
      { isolationLevel: "Serializable" },
    ),
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.check.reason,
        currentCount: result.check.currentCount,
        limit: result.check.limit,
        suggestedPlan: result.check.suggestedPlan,
      },
      { status: 402 },
    );
  }
  return NextResponse.json({ brand: result.brand });
}
