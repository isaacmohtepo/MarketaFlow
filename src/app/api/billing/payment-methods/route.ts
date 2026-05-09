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

  return NextResponse.json({
    activeEnv,
    paymentMethods: sub.paymentMethods.map((pm) => ({
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
      // Calculado: ¿se puede usar para cobros con la config actual?
      usable: !activeEnv ? false : (pm.environment ?? "sandbox") === activeEnv,
      createdAt: pm.createdAt.toISOString(),
    })),
  });
}
