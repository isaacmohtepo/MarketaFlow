/**
 * Crea (o promueve) un usuario admin con su agencia + trial.
 *
 * Uso: npx tsx scripts/create-admin.ts <email> <password> [agencyName]
 *
 * Si el user ya existe, solo lo promueve a admin.
 * Si no existe, lo crea con su agencia + trial de 14 días.
 */
import { PrismaClient } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const agencyName = process.argv[4] ?? "Admin Workspace";

  if (!email || !password) {
    console.error("Uso: npx tsx scripts/create-admin.ts <email> <password> [agencyName]");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está set en .env");
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const updated = await prisma.user.update({
        where: { email },
        data: { role: "admin" },
        select: { id: true, email: true, name: true, role: true },
      });
      console.log("✓ User existente promovido a admin:", updated);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: "Admin",
        passwordHash,
        role: "admin",
        memberships: {
          create: {
            agency: { create: { name: agencyName } },
            role: "owner",
          },
        },
      },
      include: {
        memberships: { where: { role: "owner", brandId: null }, take: 1 },
      },
    });

    // Trial de 14 días en Pro automático
    const ownership = user.memberships[0];
    if (ownership) {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await prisma.subscription.create({
        data: {
          agencyId: ownership.agencyId,
          plan: "pro",
          status: "trialing",
          trialEndsAt,
        },
      });
    }

    console.log("✓ Admin user creado:", {
      id: user.id,
      email: user.email,
      role: user.role,
      agencyId: ownership?.agencyId,
      agencyName,
    });
    console.log("Trial Pro activo por 14 días.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
