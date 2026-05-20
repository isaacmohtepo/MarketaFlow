import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EMAIL = process.env.TARGET_EMAIL ?? "isaac@test.com";
// Días que YA pasaron desde que venció. Con gracePeriodDays=5 default,
// 3 días pasados → quedan 2 días de gracia (banner ámbar).
const DAYS_AGO = Number(process.env.DAYS_AGO ?? 3);
const PLAN = process.env.PLAN ?? "pro";

const user = await prisma.user.findUnique({ where: { email: EMAIL } });
if (!user) {
  console.error(`No se encontró el user ${EMAIL}`);
  process.exit(1);
}

const ownership = await prisma.membership.findFirst({
  where: { userId: user.id, role: "owner", brandId: null },
  include: { agency: true },
});
if (!ownership) {
  console.error(`${EMAIL} no es owner de ninguna agency`);
  process.exit(1);
}

console.log(`User: ${user.email} (id ${user.id})`);
console.log(`Agency: ${ownership.agency.name} (id ${ownership.agencyId})`);

const pastDueSinceAt = new Date(Date.now() - DAYS_AGO * 24 * 60 * 60 * 1000);

const after = await prisma.subscription.update({
  where: { agencyId: ownership.agencyId },
  data: {
    plan: PLAN,
    status: "past_due",
    pastDueSinceAt,
    trialEndsAt: null,
    nextChargeAt: null,
    lastDunningSentAt: null,
    lastDunningStage: null,
  },
});

console.log("\nEstado DESPUÉS:");
console.log(`  plan: ${after.plan}`);
console.log(`  status: ${after.status}`);
console.log(`  pastDueSinceAt: ${after.pastDueSinceAt?.toISOString()} (${DAYS_AGO} días atrás)`);
console.log(`  → con gracePeriodDays=5: quedan ~${Math.max(0, 5 - DAYS_AGO)} días de gracia`);

await prisma.$disconnect();
console.log("\n✅ Listo — entrá a la app con ese user y vas a ver el banner de gracia.");
