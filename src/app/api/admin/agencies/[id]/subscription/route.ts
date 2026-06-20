import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/agencies/[id]/subscription
 *
 * Acciones admin sobre la subscription de una agency. Una sola route con
 * un campo `action` para tener un único punto de mutación auditable.
 *
 * Acciones:
 *  - { action: "set_plan", plan: "free|pro|agency", cycle: "monthly|yearly" }
 *      Fuerza el plan sin cobrar — útil para soporte (ej. "te regalo Pro
 *      por un mes mientras arreglamos un problema").
 *  - { action: "extend_trial", days: number }
 *      Extiende trialEndsAt sumando N días.
 *  - { action: "cancel" }
 *      Marca cancelAtPeriodEnd=true (mantiene activa hasta fin de período).
 *  - { action: "cancel_now" }
 *      Cancela inmediatamente (status=canceled, plan=free).
 *  - { action: "reactivate" }
 *      Quita cancelAtPeriodEnd.
 *  - { action: "set_period_end", date: ISO }
 *      Cambia currentPeriodEnd manualmente.
 */

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_plan"),
    plan: z.enum(["free", "pro", "agency"]),
    cycle: z.enum(["monthly", "yearly"]).default("monthly"),
  }),
  z.object({
    action: z.literal("extend_trial"),
    days: z.number().int().min(1).max(365),
  }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("cancel_now") }),
  z.object({ action: z.literal("reactivate") }),
  z.object({
    action: z.literal("set_period_end"),
    date: z.string().datetime(),
  }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { agencyId: id },
  });
  if (!sub) {
    return NextResponse.json(
      { error: "La agencia no tiene subscription. Prueba refrescando." },
      { status: 404 },
    );
  }

  let updated;
  let auditAction = `subscription.${body.action}`;
  const auditMeta: Record<string, unknown> = {};

  switch (body.action) {
    case "set_plan": {
      // Calculamos un currentPeriodEnd nuevo si no había (1 mes / 1 año)
      const now = new Date();
      const newEnd = new Date(now);
      if (body.cycle === "yearly") newEnd.setFullYear(newEnd.getFullYear() + 1);
      else newEnd.setMonth(newEnd.getMonth() + 1);
      const nextChargeAt = new Date(newEnd);
      nextChargeAt.setDate(nextChargeAt.getDate() - 1);

      updated = await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: body.plan,
          billingCycle: body.cycle,
          status: body.plan === "free" ? "active" : "active",
          // Si pasamos a free, limpiamos los campos de cobro
          ...(body.plan === "free"
            ? {
                currentPeriodStart: null,
                currentPeriodEnd: null,
                nextChargeAt: null,
                trialEndsAt: null,
                cancelAtPeriodEnd: false,
              }
            : {
                currentPeriodStart: sub.currentPeriodStart ?? now,
                currentPeriodEnd: sub.currentPeriodEnd ?? newEnd,
                nextChargeAt: sub.nextChargeAt ?? nextChargeAt,
              }),
        },
      });
      auditMeta.from = sub.plan;
      auditMeta.to = body.plan;
      auditMeta.cycle = body.cycle;
      break;
    }

    case "extend_trial": {
      // Idempotencia anti-doble-submit: extend_trial es ADITIVO (+N días sobre
      // el trial actual), así que reintentos de red / dobles POST compondrían
      // varias extensiones (y logs duplicados). Si ya está en trial y se acaba
      // de modificar (< 5s), asumimos que es un reintento del mismo request y
      // devolvemos el estado actual sin volver a extender ni auditar. (La
      // condición `trialing` evita bloquear una secuencia legítima como
      // set_plan → extend hecha en pocos segundos.)
      if (
        sub.status === "trialing" &&
        Date.now() - sub.updatedAt.getTime() < 5000
      ) {
        return NextResponse.json({ subscription: sub, deduped: true });
      }
      const base = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date();
      const newEnd = new Date(base);
      newEnd.setDate(newEnd.getDate() + body.days);
      updated = await prisma.subscription.update({
        where: { id: sub.id },
        data: { trialEndsAt: newEnd, status: "trialing" },
      });
      auditMeta.days = body.days;
      auditMeta.newTrialEnd = newEnd.toISOString();
      break;
    }

    case "cancel": {
      updated = await prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: true },
      });
      break;
    }

    case "cancel_now": {
      updated = await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "canceled",
          plan: "free",
          cancelAtPeriodEnd: false,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          nextChargeAt: null,
          trialEndsAt: null,
        },
      });
      break;
    }

    case "reactivate": {
      updated = await prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: false, status: "active" },
      });
      break;
    }

    case "set_period_end": {
      const newEnd = new Date(body.date);
      const nextChargeAt = new Date(newEnd);
      nextChargeAt.setDate(nextChargeAt.getDate() - 1);
      updated = await prisma.subscription.update({
        where: { id: sub.id },
        data: { currentPeriodEnd: newEnd, nextChargeAt },
      });
      auditMeta.newPeriodEnd = newEnd.toISOString();
      break;
    }
  }

  audit({
    category: "admin",
    action: auditAction,
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: auditMeta,
    req,
  });

  return NextResponse.json({ subscription: updated });
}
