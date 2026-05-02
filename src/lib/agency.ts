import { prisma } from "./db";

export async function getUserAgencyName(userId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { userId, role: { in: ["owner", "editor"] }, brandId: null },
    include: { agency: true },
    orderBy: { id: "asc" },
  });
  if (m) return m.agency.name;
  const c = await prisma.membership.findFirst({
    where: { userId },
    include: { agency: true },
    orderBy: { id: "asc" },
  });
  return c?.agency.name ?? null;
}
