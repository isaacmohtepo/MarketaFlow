/**
 * Helpers de métricas de plataforma para el admin dashboard.
 *
 * Filosofía: queries server-side baratas (Postgres es buena con agregaciones),
 * todo en una request paralela. Si el dashboard se vuelve lento podemos
 * cachear con `unstable_cache` o materializar en jobs.
 */

import { prisma } from "./db";
import { PLANS, type PlanId } from "./plans";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// MRR (Monthly Recurring Revenue)
// ============================================================================

/**
 * MRR actual: suma del precio mensualizado de subscriptions con status
 * "active" (no trial). Yearly se divide por 12 para normalizar.
 */
export async function currentMrrCents(): Promise<number> {
  const subs = await prisma.subscription.findMany({
    where: { status: "active", plan: { not: "free" } },
    select: { plan: true, billingCycle: true },
  });
  return subs.reduce((sum, s) => {
    const p = PLANS[s.plan as PlanId];
    if (!p) return sum;
    const monthly =
      s.billingCycle === "yearly" ? p.priceCopYearly / 12 : p.priceCopMonthly;
    return sum + monthly;
  }, 0);
}

/**
 * MRR mensualizado de los últimos 12 meses, basado en invoices PAGAS:
 * para cada mes calculamos el revenue cobrado en ese mes / proporción del
 * período. Aproximación pragmática para un SaaS pequeño — no es ASC contabilidad.
 */
export async function mrrSeries(
  months = 12,
): Promise<{ month: string; cents: number }[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const invoices = await prisma.invoice.findMany({
    where: {
      status: "paid",
      paidAt: { gte: start },
    },
    select: { amount: true, paidAt: true, periodStart: true, periodEnd: true },
  });

  // Inicializar buckets por mes (YYYY-MM)
  const buckets = new Map<string, number>();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    buckets.set(monthKey(d), 0);
  }

  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    // Si tenemos período, prorrateamos sobre los meses que cubre.
    // Sino, todo va al mes del paidAt.
    if (inv.periodStart && inv.periodEnd) {
      const days = Math.max(
        1,
        (inv.periodEnd.getTime() - inv.periodStart.getTime()) / MS_PER_DAY,
      );
      const ratePerDay = inv.amount / days;
      // Para cada mes del rango, suma el % proporcional
      let cursor = new Date(inv.periodStart);
      while (cursor < inv.periodEnd) {
        const monthEnd = new Date(
          cursor.getFullYear(),
          cursor.getMonth() + 1,
          0,
        );
        const segmentEnd = monthEnd < inv.periodEnd ? monthEnd : inv.periodEnd;
        const segmentDays =
          (segmentEnd.getTime() - cursor.getTime()) / MS_PER_DAY;
        const k = monthKey(cursor);
        if (buckets.has(k)) {
          buckets.set(k, (buckets.get(k) ?? 0) + ratePerDay * segmentDays);
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else {
      const k = monthKey(inv.paidAt);
      if (buckets.has(k)) {
        buckets.set(k, (buckets.get(k) ?? 0) + inv.amount);
      }
    }
  }

  return Array.from(buckets.entries()).map(([month, cents]) => ({
    month,
    cents: Math.round(cents),
  }));
}

// ============================================================================
// Signups (last N days)
// ============================================================================

export async function signupsSeries(
  days = 30,
): Promise<{ day: string; count: number }[]> {
  const now = new Date();
  const start = startOfDay(new Date(now.getTime() - (days - 1) * MS_PER_DAY));

  const users = await prisma.user.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true },
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = startOfDay(new Date(now.getTime() - (days - 1 - i) * MS_PER_DAY));
    buckets.set(dayKey(d), 0);
  }
  for (const u of users) {
    const k = dayKey(u.createdAt);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([day, count]) => ({ day, count }));
}

// ============================================================================
// Top agencies by lifetime value
// ============================================================================

export async function topAgenciesByRevenue(
  limit = 10,
): Promise<
  {
    agencyId: string;
    name: string;
    plan: string | null;
    status: string | null;
    totalCents: number;
    invoicesPaid: number;
  }[]
> {
  // Obtener todos los invoices pagados agrupados por agency.
  // Lo hacemos via groupBy de Prisma — eficiente.
  const grouped = await prisma.invoice.groupBy({
    by: ["subscriptionId"],
    where: { status: "paid" },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: "desc" } },
    take: limit,
  });

  if (grouped.length === 0) return [];

  // Resolvemos agency info para cada subscription
  const subIds = grouped.map((g) => g.subscriptionId);
  const subs = await prisma.subscription.findMany({
    where: { id: { in: subIds } },
    include: { agency: { select: { id: true, name: true } } },
  });
  const subMap = new Map(subs.map((s) => [s.id, s]));

  return grouped
    .map((g) => {
      const sub = subMap.get(g.subscriptionId);
      if (!sub) return null;
      return {
        agencyId: sub.agency.id,
        name: sub.agency.name,
        plan: sub.plan,
        status: sub.status,
        totalCents: g._sum.amount ?? 0,
        invoicesPaid: g._count._all,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// ============================================================================
// Conversion + churn
// ============================================================================

/**
 * Conversion trial → paid: % de subscriptions que empezaron como trial y
 * terminaron en plan paid en los últimos N días.
 */
export async function trialConversion(days = 90): Promise<{
  trialsStarted: number;
  trialsConverted: number;
  rate: number;
}> {
  const since = new Date(Date.now() - days * MS_PER_DAY);
  // Trials iniciados: subs creadas con status trialing en el período (proxy:
  // creadas en el período y cuyo plan en trialEndsAt era pro/agency).
  // Como no tenemos historial de status, usamos: subs con trialEndsAt seteado
  // y cuya createdAt está en el rango.
  const [trialsStarted, trialsConverted] = await Promise.all([
    prisma.subscription.count({
      where: {
        createdAt: { gte: since },
        OR: [{ trialEndsAt: { not: null } }, { status: "trialing" }],
      },
    }),
    // Convertidas: trial subs que ahora tienen al menos 1 invoice paid
    prisma.subscription.count({
      where: {
        createdAt: { gte: since },
        invoices: { some: { status: "paid" } },
      },
    }),
  ]);

  const rate = trialsStarted > 0 ? trialsConverted / trialsStarted : 0;
  return { trialsStarted, trialsConverted, rate };
}

/**
 * Churn: % de subs que se cancelaron en los últimos N días contra el total
 * activas al principio del período.
 */
export async function churnRate(days = 30): Promise<{
  canceled: number;
  active: number;
  rate: number;
}> {
  const since = new Date(Date.now() - days * MS_PER_DAY);
  const [canceled, active] = await Promise.all([
    prisma.subscription.count({
      where: {
        status: { in: ["canceled", "expired"] },
        updatedAt: { gte: since },
      },
    }),
    prisma.subscription.count({
      where: { status: "active", plan: { not: "free" } },
    }),
  ]);
  const denom = active + canceled;
  return {
    canceled,
    active,
    rate: denom > 0 ? canceled / denom : 0,
  };
}

// ============================================================================
// Utilities
// ============================================================================

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ============================================================================
// Cohort retention
// ============================================================================

/**
 * Cohort retention table: para los últimos N meses, agrupa subscriptions
 * por su mes de creación (cohort) y calcula qué % siguen activas en cada
 * mes posterior (mes 0 = creación, mes 1 = mes después, etc.).
 *
 * Ejemplo de output:
 *   { cohort: "2025-01", size: 50, retention: [50, 42, 38, 35, ...] }
 *
 * Definición de "retenido": subscription con status active O trialing
 * (no canceled/expired) al final del mes.
 */
export type CohortRow = {
  cohort: string;
  size: number;
  retention: (number | null)[];
};

export async function cohortRetention(months = 6): Promise<CohortRow[]> {
  const now = new Date();
  const subs = await prisma.subscription.findMany({
    select: {
      id: true,
      createdAt: true,
      status: true,
      updatedAt: true,
      plan: true,
    },
  });

  // Agrupar por cohort month
  const cohorts = new Map<string, typeof subs>();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    cohorts.set(monthKey(d), []);
  }
  for (const s of subs) {
    const k = monthKey(s.createdAt);
    if (cohorts.has(k)) cohorts.get(k)!.push(s);
  }

  const rows: CohortRow[] = [];
  const cohortKeys = Array.from(cohorts.keys());
  for (let ci = 0; ci < cohortKeys.length; ci++) {
    const k = cohortKeys[ci];
    const cohortSubs = cohorts.get(k) ?? [];
    const size = cohortSubs.length;
    // mes 0..N donde N = months-1-ci (mes ci hacia adelante)
    const periodsRemaining = months - ci;
    const retention: (number | null)[] = [];
    for (let p = 0; p < periodsRemaining; p++) {
      const periodEnd = new Date(
        now.getFullYear(),
        now.getMonth() - (months - 1 - ci) + p + 1,
        0,
      );
      // Si periodEnd es futuro, marcamos null (no aplica todavía)
      if (periodEnd > now) {
        retention.push(null);
        continue;
      }
      // Cuántas de la cohort estaban "active" o "trialing" al final del period
      const stillActive = cohortSubs.filter((s) => {
        // Si nunca fue cancelada/expired, está activa
        if (s.status !== "canceled" && s.status !== "expired") return true;
        // Si lo fue, miramos si la cancelación pasó DESPUÉS del period end
        return s.updatedAt > periodEnd;
      }).length;
      retention.push(stillActive);
    }
    rows.push({ cohort: k, size, retention });
  }
  return rows;
}
