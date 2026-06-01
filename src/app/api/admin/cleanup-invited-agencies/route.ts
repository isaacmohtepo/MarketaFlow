import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/cleanup-invited-agencies
 *
 * Limpieza one-shot e idempotente de las "agencias personales basura" que el
 * flujo viejo de invitación creaba: cuando un invitado se registraba, el
 * AcceptForm mandaba agencyName="(invited)" y se le creaba una agencia propia
 * vacía (con trial). Ahora el registro por invitación ya NO crea agencia
 * personal, pero quedan las viejas colgadas.
 *
 * Borra una agencia SOLO si es segura de borrar:
 *   - name === "(invited)"
 *   - sin marcas
 *   - su dueño tiene OTRA membership en otra agencia (no lo dejamos sin nada)
 *   - sin otros miembros aparte del owner
 *
 * El cascade de Prisma borra membership + subscription al borrar la agencia.
 * Solo admins.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos de admin" }, { status: 403 });
  }

  const candidates = await prisma.agency.findMany({
    where: { name: "(invited)" },
    select: {
      id: true,
      name: true,
      _count: { select: { brands: true } },
      members: { select: { userId: true, role: true, brandId: true } },
    },
  });

  const deleted: string[] = [];
  const skipped: { agencyId: string; reason: string }[] = [];

  for (const a of candidates) {
    if (a._count.brands > 0) {
      skipped.push({ agencyId: a.id, reason: "tiene marcas" });
      continue;
    }
    // Solo el owner como miembro
    if (a.members.length !== 1 || a.members[0].role !== "owner") {
      skipped.push({ agencyId: a.id, reason: "tiene otros miembros" });
      continue;
    }
    const ownerId = a.members[0].userId;
    // El owner debe tener otra agencia para no quedar huérfano
    const otherMembership = await prisma.membership.findFirst({
      where: { userId: ownerId, agencyId: { not: a.id } },
      select: { id: true },
    });
    if (!otherMembership) {
      skipped.push({ agencyId: a.id, reason: "owner sin otra agencia" });
      continue;
    }
    await prisma.agency.delete({ where: { id: a.id } });
    deleted.push(a.id);
  }

  audit({
    category: "admin",
    action: "agencies.cleanup_invited",
    actorUserId: me.id,
    actorEmail: me.email,
    metadata: { deleted: deleted.length, skipped: skipped.length },
    req,
  });

  return NextResponse.json({
    ok: true,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    skipped,
  });
}
