import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({
  where: { email: "isaacmohtepo@gmail.com" },
});
const ownership = await prisma.membership.findFirst({
  where: { userId: user.id, role: "owner", brandId: null },
  include: { agency: { include: { subscription: true } } },
});

console.log("Agency:", ownership.agency.name);
console.log("Subscription:");
console.log("  plan:        ", ownership.agency.subscription?.plan);
console.log("  status:      ", ownership.agency.subscription?.status);
console.log("  cycle:       ", ownership.agency.subscription?.billingCycle);
console.log("  trialEndsAt: ", ownership.agency.subscription?.trialEndsAt);
console.log("  periodEnd:   ", ownership.agency.subscription?.currentPeriodEnd);
console.log("  nextCharge:  ", ownership.agency.subscription?.nextChargeAt);
console.log("  cancelAtEnd: ", ownership.agency.subscription?.cancelAtPeriodEnd);

await prisma.$disconnect();
