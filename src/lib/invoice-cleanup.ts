/**
 * Limpieza de invoices `pending` que nunca se pagaron.
 *
 * Cuando un user clickea "Upgrade" y se arrepiente sin completar el
 * pago en Wompi, el invoice queda en `pending` para siempre. Mostrar
 * eso en el historial es confuso ("¿debo algo?") y ensucia las stats.
 *
 * Después de un tiempo razonable (60 min) sin payment confirmado,
 * marcamos el invoice como `canceled` con motivo "abandoned" — el user
 * lo ve como "Cancelada" en el historial y queda claro que no se cobró
 * nada.
 *
 * Si el user vuelve a Wompi y paga DESPUÉS de la expiración, el webhook
 * llega y revierte el estado a `paid` (porque la lógica del webhook
 * busca por wompiPaymentLinkId, no filtra por status).
 */
import { prisma } from "./db";

const STALE_MINUTES = 60;

export async function expireStalePendingInvoices(
  scope:
    | { subscriptionId: string }
    | { agencyId: string }
    | { all: true } = { all: true },
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

  const where: Record<string, unknown> = {
    status: "pending",
    createdAt: { lt: cutoff },
  };
  if ("subscriptionId" in scope) {
    where.subscriptionId = scope.subscriptionId;
  } else if ("agencyId" in scope) {
    where.subscription = { agencyId: scope.agencyId };
  }

  const result = await prisma.invoice.updateMany({
    where,
    data: {
      status: "canceled",
      failedAt: new Date(),
      failedReason: "Pago no completado dentro del plazo (60 min). Inicia un nuevo checkout si quieres intentar de nuevo.",
    },
  });
  return result.count;
}

/**
 * Cancela invoices pending de la misma subscription que NO sean el ref
 * recién creado. Llamar desde /api/checkout así no se acumulan.
 */
export async function cancelPriorPendingInvoices(
  subscriptionId: string,
  excludeReference: string,
): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: {
      subscriptionId,
      status: "pending",
      wompiReference: { not: excludeReference },
    },
    data: {
      status: "canceled",
      failedAt: new Date(),
      failedReason: "Reemplazado por un nuevo checkout.",
    },
  });
  return result.count;
}
