/**
 * Helpers para validar y aplicar cupones de descuento.
 *
 * Reglas de validación (validateCoupon):
 *  - El cupón existe y está `active`
 *  - `validFrom <= now <= validUntil` (validUntil null = sin tope)
 *  - No supera `maxRedemptions` (null = ilimitado)
 *  - Si `applicablePlans` tiene valores, el plan del checkout debe estar
 *  - Si `applicableCycles` tiene valores, el cycle debe estar
 *  - Si `oncePerAgency`, la agency no debe tener una redemption previa
 *  - Si `percentOff`, el descuento se calcula como amount * (percentOff/100)
 *  - Si `amountOffCents`, se descuenta hasta el monto del invoice (sin
 *    dejar el total negativo — clamp a 0 mínimo)
 *
 * Para CONSUMIR el cupón (cuando el webhook confirma el pago), usar
 * recordRedemption: incrementa redemptionCount + crea CouponRedemption.
 * No usar antes del pago — eso permitiría DoS de un cupón.
 */
import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma";

export type ValidateResult =
  | {
      valid: true;
      couponId: string;
      code: string;
      discountCents: number;
      finalCents: number;
      label: string;
    }
  | { valid: false; reason: string };

export async function validateCoupon(args: {
  code: string;
  agencyId: string;
  planId: string;
  cycle: string;
  amountCents: number;
}): Promise<ValidateResult> {
  const code = args.code.trim().toUpperCase();
  if (!code) return { valid: false, reason: "Ingresá un código." };

  const coupon = await prisma.coupon.findUnique({
    where: { code },
  });
  if (!coupon || !coupon.active) {
    return { valid: false, reason: "Código inválido o expirado." };
  }

  const now = new Date();
  if (coupon.validFrom > now) {
    return { valid: false, reason: "Este código todavía no es válido." };
  }
  if (coupon.validUntil && coupon.validUntil < now) {
    return { valid: false, reason: "Este código ya expiró." };
  }
  if (
    coupon.maxRedemptions != null &&
    coupon.redemptionCount >= coupon.maxRedemptions
  ) {
    return { valid: false, reason: "Este código ya alcanzó su límite de usos." };
  }
  if (
    coupon.applicablePlans.length > 0 &&
    !coupon.applicablePlans.includes(args.planId)
  ) {
    return {
      valid: false,
      reason: "Este código no aplica para tu plan elegido.",
    };
  }
  if (
    coupon.applicableCycles.length > 0 &&
    !coupon.applicableCycles.includes(args.cycle)
  ) {
    return {
      valid: false,
      reason: "Este código no aplica para tu ciclo de facturación.",
    };
  }
  if (coupon.oncePerAgency) {
    const prior = await prisma.couponRedemption.findFirst({
      where: { couponId: coupon.id, agencyId: args.agencyId },
      select: { id: true },
    });
    if (prior) {
      return {
        valid: false,
        reason: "Ya usaste este código antes.",
      };
    }
  }

  let discountCents = 0;
  let label = "";
  if (coupon.percentOff != null) {
    discountCents = Math.floor((args.amountCents * coupon.percentOff) / 100);
    label = `${coupon.percentOff}% off`;
  } else if (coupon.amountOffCents != null) {
    discountCents = Math.min(coupon.amountOffCents, args.amountCents);
    label = formatCop(coupon.amountOffCents) + " off";
  } else {
    return { valid: false, reason: "Cupón mal configurado (sin descuento)." };
  }

  const finalCents = Math.max(0, args.amountCents - discountCents);
  return {
    valid: true,
    couponId: coupon.id,
    code: coupon.code,
    discountCents,
    finalCents,
    label,
  };
}

/**
 * Llamar desde el webhook cuando el invoice se marca paid Y tiene
 * `couponCode` set. Incrementa el counter + crea redemption row.
 * Acepta un tx opcional para participar en la transacción del webhook.
 */
export async function recordRedemption(args: {
  code: string;
  agencyId: string;
  invoiceId: string;
  amountSavedCents: number;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const client = (args.tx ?? prisma) as Prisma.TransactionClient;
  const coupon = await client.coupon.findUnique({
    where: { code: args.code.toUpperCase() },
    select: { id: true },
  });
  if (!coupon) return;
  // Idempotencia: si ya existe redemption para este invoice, no hacer nada
  const existing = await client.couponRedemption.findUnique({
    where: { invoiceId: args.invoiceId },
    select: { id: true },
  });
  if (existing) return;
  await client.couponRedemption.create({
    data: {
      couponId: coupon.id,
      agencyId: args.agencyId,
      invoiceId: args.invoiceId,
      amountSavedCents: args.amountSavedCents,
    },
  });
  await client.coupon.update({
    where: { id: coupon.id },
    data: { redemptionCount: { increment: 1 } },
  });
}

function formatCop(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
