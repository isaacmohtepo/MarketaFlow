import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { resolveWompiEnvironment } from "@/lib/integrations";

/**
 * GET /api/billing/payment-methods
 *
 * Lista los métodos de pago guardados de la agency del user. No expone
 * el wompiSourceId (token sensible) — solo brand, last4, exp, etc.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const m = await prisma.membership.findFirst({
    where: { userId: user.id, brandId: null },
    select: { agencyId: true },
  });
  if (!m) return NextResponse.json({ paymentMethods: [] });

  const ok = await hasPermission(user.id, m.agencyId, "billing.view");
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: billing.view" }, { status: 403 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { agencyId: m.agencyId },
    include: {
      paymentMethods: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!sub) return NextResponse.json({ paymentMethods: [], activeEnv: null });

  // Env activo: el cron y los cobros recurrentes usan este. Lo
  // exponemos para que la UI pueda flagear métodos de otro env como
  // "no usables" sin tener que esperar al primer cobro fallido.
  const activeEnv = await resolveWompiEnvironment();

  const now = new Date();
  return NextResponse.json({
    activeEnv,
    paymentMethods: sub.paymentMethods.map((pm) => {
      const envOk = !activeEnv
        ? false
        : (pm.environment ?? "sandbox") === activeEnv;
      // Tarjeta expirada: primer día del mes SIGUIENTE como cutoff
      // (una tarjeta exp 05/2026 sigue válida todo mayo, vence el 1 de junio).
      const expired =
        pm.type === "CARD" && pm.expMonth != null && pm.expYear != null
          ? new Date(pm.expYear, pm.expMonth, 1) <= now
          : false;
      // Status Wompi: AVAILABLE = listo para cobrar, PENDING = esperando
      // confirmación del user (típico Nequi recién agregado), DECLINED/
      // ERROR = falló. Rows legacy sin status las tratamos como AVAILABLE
      // (estaban funcionando antes de este campo).
      const wompiStatus = pm.wompiStatus ?? "AVAILABLE";
      const pendingConfirmation = wompiStatus === "PENDING";
      return {
        id: pm.id,
        type: pm.type,
        brand: pm.brand,
        last4: pm.last4,
        expMonth: pm.expMonth,
        expYear: pm.expYear,
        holderName: pm.holderName,
        isDefault: pm.isDefault,
        // null en rows legacy → asumimos "sandbox" por compat
        environment: pm.environment ?? "sandbox",
        wompiStatus,
        pendingConfirmation,
        // Calculado: ¿se puede usar para cobros con la config actual?
        // Un método PENDING no se puede cobrar — Wompi rechaza.
        usable: envOk && !expired && !pendingConfirmation,
        expired,
        // ¿Soporta cobros recurrentes? Solo CARD y NEQUI.
        recurring: pm.type === "CARD" || pm.type === "NEQUI",
        createdAt: pm.createdAt.toISOString(),
      };
    }),
  });
}
