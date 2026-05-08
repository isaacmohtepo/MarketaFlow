/**
 * Reset de plan para suscripciones que se "auto-upgradearon" sin pago
 * (bug histórico de checkout que seteaba plan antes de confirmar).
 *
 * Detecta: subscriptions cuyo plan != "free" pero no tienen ningún
 * Invoice pagado. Las baja a free + monthly.
 *
 * Idempotente. Solo afecta a las que matchean el criterio.
 *
 * Uso:
 *   node scripts/reset-unpaid-plan.mjs           # dry run (default)
 *   node scripts/reset-unpaid-plan.mjs --apply   # aplica cambios
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const apply = process.argv.includes("--apply");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

console.log(`Modo: ${apply ? "APPLY" : "DRY RUN (sin cambios)"}\n`);

const subs = await prisma.subscription.findMany({
  where: { plan: { not: "free" } },
  include: {
    agency: { select: { id: true, name: true } },
    invoices: { where: { status: "paid" }, select: { id: true } },
  },
});

const toReset = subs.filter((s) => s.invoices.length === 0);

console.log(`Total subs con plan != free: ${subs.length}`);
console.log(
  `Sin invoice paid (auto-upgrade sin pago): ${toReset.length}\n`,
);

for (const s of toReset) {
  console.log(
    `  → ${s.agency.name} (${s.agency.id}): plan=${s.plan} cycle=${s.billingCycle} status=${s.status}`,
  );
  if (apply) {
    await prisma.subscription.update({
      where: { id: s.id },
      data: {
        plan: "free",
        billingCycle: "monthly",
        status: "active",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextChargeAt: null,
        pendingPlan: null,
        pendingBillingCycle: null,
      },
    });
  }
}

console.log(
  `\n${apply ? "✓ Aplicado" : "(Re-corre con --apply para aplicar)"}`,
);
await prisma.$disconnect();
