import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { getWompiConfig } from "@/lib/integrations";

/**
 * POST /api/billing/payment-methods/[id]/check
 *
 * Consulta el status actual del payment_source contra Wompi y actualiza
 * la fila en DB si cambió. Se usa para polling después de crear un
 * método NEQUI: nace en PENDING hasta que el user aprueba el push en
 * su app, y necesitamos saber cuándo pasa a AVAILABLE.
 *
 * También sirve para verificar manualmente si un método se quedó
 * trabado en PENDING (ej. user cerró el modal antes de aprobar).
 *
 * Cross-tenant: el método debe pertenecer a la subscription de la
 * agency del user que llama.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const pm = await prisma.paymentMethod.findUnique({
    where: { id },
    include: {
      subscription: { select: { agencyId: true } },
    },
  });
  if (!pm) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Cross-tenant: el user debe ser miembro de la agency dueña del método
  const member = await prisma.membership.findFirst({
    where: { userId: user.id, agencyId: pm.subscription.agencyId },
    select: { id: true },
  });
  if (!member) {
    // Devolvemos 404 (no 403) para no filtrar la existencia del recurso
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // Resolver env (debería ser el mismo que el del método, sino algo raro)
  const env = await resolveWompiEnvironment();
  if (!env) {
    return NextResponse.json(
      { error: "Wompi no configurado" },
      { status: 503 },
    );
  }
  const cfg = await getWompiConfig(env);
  const apiBase =
    env === "production"
      ? "https://production.wompi.co/v1"
      : "https://sandbox.wompi.co/v1";

  // Consultar Wompi
  let wompiStatus: string | null = null;
  try {
    const res = await fetch(`${apiBase}/payment_sources/${pm.wompiSourceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.privateKey}`,
      },
      // No cachear — queremos el status fresco siempre
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Wompi respondió ${res.status} al consultar el método.`,
        },
        { status: 502 },
      );
    }
    const json = (await res.json()) as {
      data?: { status?: string };
    };
    wompiStatus = json.data?.status ?? null;
  } catch (err) {
    console.error("Wompi payment_source check failed", err);
    return NextResponse.json(
      { error: "No pudimos contactar Wompi." },
      { status: 502 },
    );
  }

  // Actualizar DB si cambió o nunca habíamos chequeado
  if (wompiStatus && wompiStatus !== pm.wompiStatus) {
    await prisma.paymentMethod.update({
      where: { id },
      data: {
        wompiStatus,
        wompiStatusCheckedAt: new Date(),
      },
    });
  } else {
    // Mismo status, solo actualizamos checkedAt
    await prisma.paymentMethod.update({
      where: { id },
      data: { wompiStatusCheckedAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    wompiStatus,
    // Estados finales (no necesitan más polling):
    //  - AVAILABLE: listo para cobrar
    //  - DECLINED: el user rechazó o expiró el push
    //  - ERROR: algo falló del lado de Wompi
    isFinal:
      wompiStatus === "AVAILABLE" ||
      wompiStatus === "DECLINED" ||
      wompiStatus === "ERROR",
    isSuccess: wompiStatus === "AVAILABLE",
  });
}
