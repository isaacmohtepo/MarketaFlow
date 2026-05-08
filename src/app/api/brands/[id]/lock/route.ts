import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";
import { setBrandLock } from "@/lib/brand-lock";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/brands/[id]/lock
 *
 * Pausa o reactiva una marca específica. Útil cuando la agencia
 * excede el límite del plan y el owner quiere elegir manualmente
 * cuáles dejar activas.
 */
const schema = z.object({
  locked: z.boolean(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, id);
  if (!access) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  // Pausar/reactivar requiere permiso de gestionar billing (decision
  // estratégica) o de editar la marca. Usamos brands.edit como gate
  // razonable.
  const ok = await hasPermission(user.id, access.agencyId, "brands.edit", id);
  if (!ok) {
    return NextResponse.json(
      { error: "Sin permiso: brands.edit" },
      { status: 403 },
    );
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const result = await setBrandLock(access.agencyId, id, body.locked);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 402 });
  }

  audit({
    category: "billing",
    action: body.locked ? "brand.locked" : "brand.unlocked",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: id,
    metadata: { agencyId: access.agencyId },
    req,
  });

  return NextResponse.json({ ok: true });
}
