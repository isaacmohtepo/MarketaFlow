/**
 * Migración one-shot: convierte el rol legacy "editor" → "community_manager"
 * en Membership y TeamInvitation. Idempotente.
 *
 * Correr una vez después de aplicar el schema:
 *   node scripts/migrate-roles.mjs
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const memberships = await prisma.membership.updateMany({
  where: { role: "editor" },
  data: { role: "community_manager" },
});
console.log(`Membership: ${memberships.count} editor → community_manager`);

const invitations = await prisma.teamInvitation.updateMany({
  where: { role: "editor" },
  data: { role: "community_manager" },
});
console.log(`TeamInvitation: ${invitations.count} editor → community_manager`);

await prisma.$disconnect();
