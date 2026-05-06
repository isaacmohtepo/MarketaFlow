/**
 * Script one-shot para promover un user a admin.
 *
 * Uso: npx tsx scripts/promote-admin.ts tu-email@example.com
 *
 * (Requiere `tsx` instalado: `npm i -D tsx` o usar via `npx tsx`).
 */
import { PrismaClient } from "../src/generated/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: npx tsx scripts/promote-admin.ts <email>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: "admin" },
      select: { id: true, email: true, role: true },
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
