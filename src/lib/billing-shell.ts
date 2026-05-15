/**
 * Helper que centraliza el guard + data común de las páginas /billing/*.
 *
 * Cada subruta (/billing, /billing/plan, /billing/productos,
 * /billing/payment-methods, /billing/invoices) necesita:
 *  - Estar logueado
 *  - Ser owner de al menos una agency
 *  - Resolver la agency primaria y su summary de billing
 *
 * Si algo de eso no se cumple, redirigimos o renderizamos un placeholder
 * común. Si todo OK, devolvemos los datos comunes para que la page los
 * use sin re-fetchear.
 *
 * PERFORMANCE: usamos `React.cache` para que múltiples llamadas dentro
 * del mismo render (ej. layout + page) se deduplique a una sola query
 * Prisma. Sin esto, cada navegación hacía 2× los fetches.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { prisma } from "./db";
import { getBillingSummary } from "./billing";

type BillingShellOk = {
  ok: true;
  user: { id: string; email: string; name: string | null };
  agency: { id: string; name: string };
  summary: Awaited<ReturnType<typeof getBillingSummary>>;
};

type BillingShellNoOwner = {
  ok: false;
  reason: "no_owner";
};

export type BillingShellResult = BillingShellOk | BillingShellNoOwner;

export const requireBillingShell = cache(
  async (): Promise<BillingShellResult> => {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    const ownership = await prisma.membership.findFirst({
      where: { userId: user.id, role: "owner", brandId: null },
      include: { agency: true },
      orderBy: { id: "asc" },
    });
    if (!ownership) {
      return { ok: false, reason: "no_owner" };
    }

    const summary = await getBillingSummary(ownership.agency.id);
    return {
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
      agency: { id: ownership.agency.id, name: ownership.agency.name },
      summary,
    };
  },
);
