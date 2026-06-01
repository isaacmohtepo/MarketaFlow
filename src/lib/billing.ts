/**
 * Helpers de billing/enforcement. Todo endpoint que cree recursos limitados
 * por plan (marcas, posts, miembros, etc.) DEBE pasar por estos antes de
 * la mutation. Si retorna `{ ok: false }`, el endpoint devuelve 402 Payment
 * Required con el reason para que el cliente muestre el modal de upgrade.
 *
 * Convención: las funciones son async porque consultan DB. La consulta es
 * cacheable a nivel de request (en el mismo handler, llamar 2 veces es ok).
 */

import { prisma } from "./db";
import { PLANS, type PlanId, TRIAL_DAYS, TRIAL_PLAN } from "./plans";
import { getSystemSetting } from "./system-settings";
import type { Prisma } from "@/generated/prisma";

/**
 * Tipo del cliente Prisma que aceptan las check functions: el cliente normal
 * o el TransactionClient (cuando lo invocamos dentro de $transaction).
 *
 * Esto permite que un endpoint envuelva check + create en una transacción
 * Serializable para cerrar la race condition (TOCTOU): sin esto, dos POST
 * paralelos pasan ambos el `count < limit` y crean ambos, dejando la agency
 * por encima del límite.
 */
export type DbClient = typeof prisma | Prisma.TransactionClient;

export type LimitCheck = {
  ok: boolean;
  /** Mensaje legible para el cliente (mostrar en modal). */
  reason?: string;
  /** Cantidad usada actualmente (opcional, útil para UI). */
  currentCount?: number;
  /** Límite del plan (opcional). */
  limit?: number;
  /** Sugerir un plan superior cuando el actual no alcanza. */
  suggestedPlan?: PlanId;
};

/**
 * Devuelve la subscription de la agencia. Si no existe la crea como Free
 * activo. Esto evita branches "subscription is null" en todo el código.
 */
export async function getOrCreateSubscription(agencyId: string) {
  let sub = await prisma.subscription.findUnique({ where: { agencyId } });
  if (!sub) {
    sub = await prisma.subscription.create({
      data: { agencyId, plan: "free", status: "active" },
    });
  }
  return sub;
}

/**
 * Inicia un trial de 14 días en plan Pro para una agency recién creada.
 * Si la agency ya tiene subscription, no hace nada (idempotente).
 */
export async function startTrialForAgency(agencyId: string) {
  const existing = await prisma.subscription.findUnique({ where: { agencyId } });
  if (existing) return existing;
  // Trial duration: leer de admin settings (DB → env TRIAL_DAYS → default 14)
  const trialDays = await getSystemSetting("trialDays").catch(() => TRIAL_DAYS);
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  return prisma.subscription.create({
    data: {
      agencyId,
      plan: TRIAL_PLAN,
      status: "trialing",
      trialEndsAt,
    },
  });
}

/**
 * Determina el plan EFECTIVO de una agency en este momento, considerando:
 * - Si está en trialing y el trial no expiró → plan del trial
 * - Si está en canceled pero el período pago no terminó → mantiene plan
 * - Cualquier otro caso degradado → "free"
 */
export async function getEffectivePlanId(agencyId: string): Promise<PlanId> {
  const sub = await getOrCreateSubscription(agencyId);
  const now = new Date();

  if (sub.status === "trialing") {
    if (sub.trialEndsAt && sub.trialEndsAt > now) {
      return sub.plan as PlanId;
    }
    // Trial vencido pero el cron todavía no lo bajó. Tratamos como free.
    return "free";
  }

  if (sub.status === "canceled" && sub.cancelAtPeriodEnd) {
    // Canceló pero todavía está en período pago — mantiene su plan.
    if (sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
      return sub.plan as PlanId;
    }
    return "free";
  }

  if (sub.status === "expired") return "free";
  if (sub.status === "past_due") {
    // Plan vencido sin renovar: damos N días de gracia (setting
    // gracePeriodDays, default 5) con el plan funcionando + aviso diario.
    // El banner in-app y el dunning email avisan que renueve. El cron baja
    // a free al pasar la gracia; aquí replicamos el cálculo como fallback
    // por si el cron no corrió.
    // pastDueSinceAt es el ancla; updatedAt es fallback para subs viejas.
    const graceDays = await getSystemSetting("gracePeriodDays").catch(() => 5);
    const anchor = (sub.pastDueSinceAt ?? sub.updatedAt).getTime();
    const grace = anchor + graceDays * 24 * 60 * 60 * 1000;
    if (grace > now.getTime()) return sub.plan as PlanId;
    return "free";
  }

  return sub.plan as PlanId;
}

/**
 * Límites efectivos: combina los del plan base con los add-ons activos
 * (extraBrands, extraSeats, whiteLabelAddon).
 */
export async function getEffectiveLimits(agencyId: string) {
  const planId = await getEffectivePlanId(agencyId);
  const sub = await getOrCreateSubscription(agencyId);
  const base = PLANS[planId].limits;

  return {
    ...base,
    maxBrands:
      base.maxBrands === -1 ? -1 : base.maxBrands + (sub.extraBrands ?? 0),
    maxTeamMembers:
      base.maxTeamMembers === -1 ? -1 : base.maxTeamMembers + (sub.extraSeats ?? 0),
    whiteLabelEnabled: base.whiteLabelEnabled || (sub.whiteLabelAddon ?? false),
    /** Plan id efectivo, conveniente para mostrar "Tu plan: Pro" en UI. */
    planId,
  };
}

// ============================================================================
// Checks específicos por recurso. Cada función retorna LimitCheck con razón
// human-readable cuando falla, lista para mostrar en modal de upgrade.
// ============================================================================

export async function canCreateBrand(
  agencyId: string,
  db: DbClient = prisma,
): Promise<LimitCheck> {
  const limits = await getEffectiveLimits(agencyId);
  if (limits.maxBrands === -1) return { ok: true };

  const count = await db.brand.count({ where: { agencyId } });
  if (count >= limits.maxBrands) {
    const suggested = limits.planId === "free" ? "pro" : "agency";
    return {
      ok: false,
      reason: `Tu plan ${PLANS[limits.planId].name} permite ${limits.maxBrands} ${
        limits.maxBrands === 1 ? "marca" : "marcas"
      }. Pasa a ${PLANS[suggested].name} para crear más, o agrega una marca extra como add-on.`,
      currentCount: count,
      limit: limits.maxBrands,
      suggestedPlan: suggested,
    };
  }
  return { ok: true, currentCount: count, limit: limits.maxBrands };
}

export async function canCreatePost(
  agencyId: string,
  db: DbClient = prisma,
): Promise<LimitCheck> {
  const limits = await getEffectiveLimits(agencyId);
  if (limits.maxPostsPerMonth === -1) return { ok: true };

  // Cuenta posts creados en el mes calendario actual (UTC para simplicidad).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const count = await db.post.count({
    where: {
      brand: { agencyId },
      createdAt: { gte: monthStart },
      deletedAt: null,
    },
  });
  if (count >= limits.maxPostsPerMonth) {
    return {
      ok: false,
      reason: `Tu plan ${PLANS[limits.planId].name} permite ${limits.maxPostsPerMonth} posts por mes. Pasa a Pro para posts ilimitados.`,
      currentCount: count,
      limit: limits.maxPostsPerMonth,
      suggestedPlan: "pro",
    };
  }
  return { ok: true, currentCount: count, limit: limits.maxPostsPerMonth };
}

export async function canInviteClient(
  brandId: string,
  db: DbClient = prisma,
): Promise<LimitCheck> {
  const brand = await db.brand.findUnique({
    where: { id: brandId },
    select: { agencyId: true },
  });
  if (!brand) return { ok: false, reason: "Marca no encontrada" };

  const limits = await getEffectiveLimits(brand.agencyId);
  if (limits.maxClientsPerBrand === -1) return { ok: true };

  const count = await db.membership.count({
    where: { brandId, role: "client" },
  });
  if (count >= limits.maxClientsPerBrand) {
    return {
      ok: false,
      reason: `Tu plan ${PLANS[limits.planId].name} permite ${limits.maxClientsPerBrand} cliente${
        limits.maxClientsPerBrand === 1 ? "" : "s"
      } por marca. Pasa a Pro para clientes ilimitados.`,
      currentCount: count,
      limit: limits.maxClientsPerBrand,
      suggestedPlan: "pro",
    };
  }
  return { ok: true, currentCount: count, limit: limits.maxClientsPerBrand };
}

export async function canInviteTeamMember(
  agencyId: string,
  db: DbClient = prisma,
): Promise<LimitCheck> {
  const limits = await getEffectiveLimits(agencyId);
  if (limits.maxTeamMembers === -1) return { ok: true };

  // Miembros = owner + editors agency-level (brandId: null), no cuenta clients
  const count = await db.membership.count({
    where: {
      agencyId,
      brandId: null,
      role: { in: ["owner", "editor"] },
    },
  });
  if (count >= limits.maxTeamMembers) {
    const suggested = limits.planId === "free" ? "pro" : "agency";
    return {
      ok: false,
      reason: `Tu plan ${PLANS[limits.planId].name} permite ${limits.maxTeamMembers} ${
        limits.maxTeamMembers === 1 ? "miembro" : "miembros"
      } de equipo. Pasa a ${PLANS[suggested].name} para más.`,
      currentCount: count,
      limit: limits.maxTeamMembers,
      suggestedPlan: suggested,
    };
  }
  return { ok: true, currentCount: count, limit: limits.maxTeamMembers };
}

/**
 * Chequea AI usage del día. Para enforce en endpoints de Caption Assist.
 * No persistimos un contador — usamos el modelo Activity como proxy si lo
 * registramos ahí, o simplemente confiamos en el plan límite (legacy: free
 * tiene 3, pro/agency ilimitado).
 *
 * Por ahora retorna ok si el plan permite; el contador exacto se puede
 * implementar después con un modelo `AiUsage` cuando sea relevante.
 */
export async function canUseAi(agencyId: string): Promise<LimitCheck> {
  const limits = await getEffectiveLimits(agencyId);
  if (limits.aiCaptionGenerationsPerDay === -1) return { ok: true };
  if (limits.aiCaptionGenerationsPerDay === 0) {
    return {
      ok: false,
      reason: `Tu plan ${PLANS[limits.planId].name} no incluye AI Caption Assist.`,
      suggestedPlan: "pro",
    };
  }
  // TODO: chequear contador real (cuando agreguemos `AiUsage` model).
  return { ok: true, limit: limits.aiCaptionGenerationsPerDay };
}

/**
 * Helper de presentación: dado un agencyId, devuelve toda la info que la UI
 * necesita para mostrar el "Plan actual" en sidebar/settings.
 */
export async function getBillingSummary(agencyId: string) {
  const sub = await getOrCreateSubscription(agencyId);
  const planId = await getEffectivePlanId(agencyId);
  const limits = await getEffectiveLimits(agencyId);

  return {
    planId,
    plan: PLANS[planId],
    status: sub.status,
    billingCycle: sub.billingCycle,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    nextChargeAt: sub.nextChargeAt,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    /** Si está set y cancelAtPeriodEnd=true, hay un cambio de plan
     *  programado para currentPeriodEnd (downgrade Agency→Pro por ej).
     *  El cron lo activa al expirar el período. Null = bajada a Free. */
    pendingPlan: sub.pendingPlan,
    pendingBillingCycle: sub.pendingBillingCycle,
    extraBrands: sub.extraBrands,
    extraSeats: sub.extraSeats,
    whiteLabelAddon: sub.whiteLabelAddon,
    creditCents: sub.creditCents ?? 0,
    pastDueSinceAt: sub.pastDueSinceAt,
    limits,
  };
}
