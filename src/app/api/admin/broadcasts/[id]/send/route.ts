import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { dispatchBroadcast } from "@/lib/broadcast";

/**
 * POST /api/admin/broadcasts/[id]/send
 *
 * Dispara el envío del broadcast. Para audiencias chicas (< 50) lo hacemos
 * sincrónico. Para grandes lo correríamos en un cron job — por ahora
 * sincrónico siempre, con un timeout grande del runtime de Vercel.
 *
 * El cliente ve la respuesta cuando termina el envío. Si la audiencia es
 * grande podríamos volverlo async + polling, pero para un SaaS pequeño
 * con 100s de users no vale la pena complejizar.
 */
export const maxDuration = 300; // 5 min

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const b = await prisma.emailBroadcast.findUnique({ where: { id } });
  if (!b) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (b.status === "sending") {
    return NextResponse.json(
      { error: "Ya está en envío" },
      { status: 400 },
    );
  }
  if (b.status === "sent") {
    return NextResponse.json(
      { error: "Ya fue enviado" },
      { status: 400 },
    );
  }

  audit({
    category: "admin",
    action: "broadcast.sent",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { subject: b.subject, audience: b.audience },
    req,
  });

  await dispatchBroadcast(id);
  const updated = await prisma.emailBroadcast.findUnique({ where: { id } });
  return NextResponse.json({ broadcast: updated });
}
