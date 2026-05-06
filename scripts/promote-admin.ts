/**
 * Script one-shot para promover un user a admin.
 *
 * Uso: npx tsx scripts/promote-admin.ts tu-email@example.com
 *
 * Audit: deja un row en AuditLog con action="role.promoted" para que quede
 * registro de la promoción (cumple SOC 2 / ISO 27001).
 */
import { PrismaClient } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: npx tsx scripts/promote-admin.ts <email>");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está set en .env");
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });
  try {
    const before = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    const user = await prisma.user.update({
      where: { email },
      data: { role: "admin" },
      select: { id: true, email: true, role: true },
    });
    await prisma.auditLog.create({
      data: {
        category: "admin",
        action: "role.promoted",
        actorEmail: "script",
        targetId: user.id,
        metadata: { from: before?.role, to: "admin", email },
      },
    });
    console.log("✓ Promovido:", user);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
