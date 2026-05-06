import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCreateBrand } from "@/lib/billing";
import { assertAgencyNotSuspended } from "@/lib/suspension";
import { hasPermission } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1),
  handle: z.string().optional().nullable(),
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

  const owner = await prisma.membership.findFirst({
    where: { userId: user.id, brandId: null },
    select: { agencyId: true },
  });
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

  // Plan limits enforcement con Serializable transaction para cerrar la
  // race condition (TOCTOU). Sin esto, dos POST paralelos pasarían ambos
  // el `count < limit` y crearían ambos. Postgres en Serializable detecta
  // el conflicto y aborta una de las dos con error de serialización.
  const result = await prisma.$transaction(
    async (tx) => {
      const check = await canCreateBrand(owner.agencyId, tx);
      if (!check.ok) {
        return { ok: false as const, check };
      }
      const brand = await tx.brand.create({
        data: {
          name: body.name,
          handle: body.handle || null,
          agencyId: owner.agencyId,
        },
      });
      return { ok: true as const, brand };
    },
    { isolationLevel: "Serializable" },
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
  return NextResponse.json({ id: result.brand.id });
}
