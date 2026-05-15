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

  // ─────────────────────────────────────────────────────────────────
  // FLUJO NEQUI: si la row tiene nequiTokenId pero no wompiSourceId,
  // estamos esperando que el user apruebe el push para el TOKEN. Cuando
  // el token pase a APPROVED, creamos el source recién ahí.
  // ─────────────────────────────────────────────────────────────────
  if (pm.nequiTokenId && !pm.wompiSourceId) {
    // 1. Chequear status del token
    let tokenStatus: string | null = null;
    try {
      const tRes = await fetch(
        `${apiBase}/tokens/nequi/${pm.nequiTokenId}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${cfg.privateKey}` },
          cache: "no-store",
        },
      );
      if (tRes.ok) {
        const j = (await tRes.json()) as { data?: { status?: string } };
        tokenStatus = j.data?.status ?? null;
      }
    } catch (err) {
      console.error("Wompi tokens/nequi check failed", err);
    }

    if (!tokenStatus) {
      return NextResponse.json(
        { error: "No pudimos consultar el token Nequi." },
        { status: 502 },
      );
    }

    // Token rechazado / expirado / con error → marcar source como DECLINED.
    if (tokenStatus === "DECLINED" || tokenStatus === "ERROR" || tokenStatus === "FAILED") {
      await prisma.paymentMethod.update({
        where: { id },
        data: {
          wompiStatus: "DECLINED",
          wompiStatusCheckedAt: new Date(),
        },
      });
      return NextResponse.json({
        ok: true,
        wompiStatus: "DECLINED",
        isFinal: true,
        isSuccess: false,
      });
    }

    // Token aún PENDING → seguir polleando
    if (tokenStatus !== "APPROVED") {
      await prisma.paymentMethod.update({
        where: { id },
        data: { wompiStatusCheckedAt: new Date() },
      });
      return NextResponse.json({
        ok: true,
        wompiStatus: "TOKEN_PENDING",
        isFinal: false,
        isSuccess: false,
      });
    }

    // Token APPROVED → crear el payment_source AHORA con el token
    // aprobado. También necesitamos un acceptance_token fresh.
    let acceptanceToken: string | null = null;
    let acceptancePersonalDataAuthToken: string | null = null;
    try {
      const mRes = await fetch(
        `${apiBase}/merchants/${encodeURIComponent(cfg.publicKey)}`,
        { cache: "no-store" },
      );
      if (mRes.ok) {
        const j = (await mRes.json()) as {
          data?: {
            presigned_acceptance?: { acceptance_token?: string };
            presigned_personal_data_auth?: { acceptance_token?: string };
          };
        };
        acceptanceToken = j.data?.presigned_acceptance?.acceptance_token ?? null;
        acceptancePersonalDataAuthToken =
          j.data?.presigned_personal_data_auth?.acceptance_token ?? null;
      }
    } catch {}
    if (!acceptanceToken || !acceptancePersonalDataAuthToken) {
      return NextResponse.json(
        { error: "Wompi no devolvió acceptance tokens." },
        { status: 502 },
      );
    }

    try {
      const sRes = await fetch(`${apiBase}/payment_sources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.privateKey}`,
        },
        body: JSON.stringify({
          type: "NEQUI",
          token: pm.nequiTokenId,
          customer_email:
            (await prisma.user.findUnique({ where: { id: user.id } }))?.email ??
            user.email,
          acceptance_token: acceptanceToken,
          accept_personal_auth: acceptancePersonalDataAuthToken,
        }),
      });
      const sJson = (await sRes.json()) as {
        data?: { id?: string | number; status?: string };
        error?: { reason?: string; messages?: Record<string, string[]> | string };
      };
      if (!sRes.ok || !sJson.data?.id) {
        console.warn("Wompi payment_source create after token approval failed", {
          status: sRes.status,
          error: sJson.error,
        });
        await prisma.paymentMethod.update({
          where: { id },
          data: {
            wompiStatus: "ERROR",
            wompiStatusCheckedAt: new Date(),
          },
        });
        return NextResponse.json({
          ok: true,
          wompiStatus: "ERROR",
          isFinal: true,
          isSuccess: false,
        });
      }
      const newSourceId = String(sJson.data.id);
      const newStatus = typeof sJson.data.status === "string" ? sJson.data.status : "AVAILABLE";

      await prisma.paymentMethod.update({
        where: { id },
        data: {
          wompiSourceId: newSourceId,
          wompiStatus: newStatus,
          wompiStatusCheckedAt: new Date(),
        },
      });
      return NextResponse.json({
        ok: true,
        wompiStatus: newStatus,
        isFinal: newStatus === "AVAILABLE",
        isSuccess: newStatus === "AVAILABLE",
      });
    } catch (err) {
      console.error("Wompi payment_source create after token failed", err);
      return NextResponse.json(
        { error: "No pudimos crear la fuente de pago." },
        { status: 502 },
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // FLUJO CARD (o NEQUI ya finalizado): solo pollear el source status.
  // ─────────────────────────────────────────────────────────────────
  if (!pm.wompiSourceId) {
    return NextResponse.json(
      { error: "El método no tiene source_id todavía." },
      { status: 400 },
    );
  }

  let wompiStatus: string | null = null;
  try {
    const res = await fetch(`${apiBase}/payment_sources/${pm.wompiSourceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.privateKey}`,
      },
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
