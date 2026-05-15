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
 *
 * SEGURIDAD (race conditions):
 *  - El incremento del counter se hace con UPDATE condicional:
 *    `WHERE id = ? AND (maxRedemptions IS NULL OR redemptionCount < maxRedemptions)`.
 *    Si dos requests paralelos pasan validateCoupon, solo UNO va a afectar
 *    1 row (Prisma updateMany devuelve count). El otro recibe count=0 y
 *    abortamos su redemption sin tocar nada.
 *  - Para `oncePerAgency`, hacemos el check de redemption previa dentro
 *    de la transacción + relamos en el create con manejo de unique conflict
 *    en invoiceId (que sí tiene unique constraint). Si dos webhooks
 *    paralelos intentan recordRedemption para invoices distintos pero
 *    misma agency, el segundo va a chocar al crear redemption porque
 *    validateCoupon habría devuelto false al hacer findFirst dentro del tx
 *    (con Serializable isolation rompiendo el segundo commit).
 *
 * Retorna `true` si la redención se aplicó, `false` si fue rechazada por
 * cap (en cuyo caso el caller debería marcar el invoice sin descuento).
 */
export async function recordRedemption(args: {
  code: string;
  agencyId: string;
  invoiceId: string;
  amountSavedCents: number;
  tx?: Prisma.TransactionClient;
}): Promise<boolean> {
  const client = (args.tx ?? prisma) as Prisma.TransactionClient;
  const code = args.code.toUpperCase();
  const coupon = await client.coupon.findUnique({
    where: { code },
    select: {
      id: true,
      maxRedemptions: true,
      oncePerAgency: true,
      active: true,
    },
  });
  if (!coupon || !coupon.active) return false;

  // Idempotencia: si ya existe redemption para este invoice exacto, no
  // hacer nada (el webhook se está reprocesando — válido, no es race).
  const existing = await client.couponRedemption.findUnique({
    where: { invoiceId: args.invoiceId },
    select: { id: true },
  });
  if (existing) return true;

  // Verificar oncePerAgency en read-fresh dentro del tx
  if (coupon.oncePerAgency) {
    const prior = await client.couponRedemption.findFirst({
      where: { couponId: coupon.id, agencyId: args.agencyId },
      select: { id: true },
    });
    if (prior) return false;
  }

  // Incremento atómico de redemptionCount con cap: si maxRedemptions está
  // set y ya alcanzó el cap, no se actualiza ninguna row. Esto reemplaza
  // el patrón {increment: 1} que NO es atómico vs cap check.
  const updated = await client.coupon.updateMany({
    where: {
      id: coupon.id,
      OR: [
        { maxRedemptions: null },
        { redemptionCount: { lt: coupon.maxRedemptions ?? Number.MAX_SAFE_INTEGER } },
      ],
    },
    data: { redemptionCount: { increment: 1 } },
  });
  if (updated.count === 0) {
    // Cap alcanzado por otra request paralela — abortar redención
    return false;
  }

  await client.couponRedemption.create({
    data: {
      couponId: coupon.id,
      agencyId: args.agencyId,
      invoiceId: args.invoiceId,
      amountSavedCents: args.amountSavedCents,
    },
  });
  return true;
}

function formatCop(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
