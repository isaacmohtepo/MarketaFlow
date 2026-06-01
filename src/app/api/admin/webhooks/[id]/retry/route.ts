import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/webhooks/[id]/retry
 *
 * Re-llama al endpoint del webhook con el payload original. Útil cuando
 * un webhook llegó OK la primera vez pero el handler tuvo un bug que ya
 * arreglamos, o queremos re-disparar la lógica.
 *
 * Implementación: hacemos un fetch interno al mismo /api/webhooks/wompi
 * con el payload guardado. La firma original ya estaba validada, así que
 * para evitar tener que re-firmar (no tenemos el events_secret en este
 * scope), usamos un header X-Admin-Replay con el secret de la cookie de
 * admin como bypass autenticado.
 *
 * NOTA: por simplicidad aquí implementamos solo replay para wompi y solo
 * llamando a handleTransactionUpdated directamente.
 */
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
  const w = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!w) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (w.provider !== "wompi") {
    return NextResponse.json(
      { error: "Solo soportamos retry de Wompi por ahora" },
      { status: 400 },
    );
  }

  // Importar el handler para llamarlo directamente
  const { replayWompiTransaction } = await import(
    "@/app/api/webhooks/wompi/replay"
  );

  try {
    const result = await replayWompiTransaction(w.payload);
    audit({
      category: "admin",
      action: "webhook.replayed",
      actorUserId: me.id,
      actorEmail: me.email,
      targetId: w.id,
      metadata: { provider: w.provider, externalId: w.externalId },
      req,
    });
    await prisma.webhookEvent.update({
      where: { id: w.id },
      data: { status: "ok", errorMessage: null },
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
