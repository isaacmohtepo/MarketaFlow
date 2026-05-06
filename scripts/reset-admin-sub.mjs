import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = "isaacmohtepo@gmail.com";

const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
if (!user) {
  console.error("No se encontró el user admin");
  process.exit(1);
}

const ownership = await prisma.membership.findFirst({
  where: { userId: user.id, role: "owner", brandId: null },
  include: { agency: true },
});
if (!ownership) {
  console.error("El admin no es owner de ninguna agency");
  process.exit(1);
}

console.log(`User: ${user.email} (id ${user.id})`);
console.log(`Agency: ${ownership.agency.name} (id ${ownership.agencyId})`);

const before = await prisma.subscription.findUnique({
  where: { agencyId: ownership.agencyId },
});
console.log("\nEstado ANTES:");
console.log(`  plan: ${before?.plan}`);
console.log(`  status: ${before?.status}`);
console.log(`  trialEndsAt: ${before?.trialEndsAt}`);
console.log(`  currentPeriodEnd: ${before?.currentPeriodEnd}`);

const deletedInvoices = await prisma.invoice.deleteMany({
  where: {
    subscriptionId: before?.id,
    status: { in: ["pending", "failed"] },
  },
});
console.log(`\nInvoices pending/failed borrados: ${deletedInvoices.count}`);

const deletedPM = await prisma.paymentMethod.deleteMany({
  where: { subscriptionId: before?.id },
});
console.log(`Payment methods borrados: ${deletedPM.count}`);

const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
const after = await prisma.subscription.update({
  where: { agencyId: ownership.agencyId },
  data: {
    plan: "pro",
    status: "trialing",
    trialEndsAt,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextChargeAt: null,
    billingCycle: "monthly",
  },
});

console.log("\nEstado DESPUÉS (trial Pro 14 días):");
console.log(`  plan: ${after.plan}`);
console.log(`  status: ${after.status}`);
console.log(`  trialEndsAt: ${after.trialEndsAt}`);

await prisma.$disconnect();
console.log("\n✅ Listo — entrá de nuevo a /billing y probá el upgrade");
