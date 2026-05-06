/**
 * Helper para chequear si el current user es admin del producto (no de
 * una agency, sino admin global de MarketaFlow). Usado en `/admin/*`.
 *
 * Convención: User.role === "admin" tiene acceso al admin panel.
 * Se setea manualmente en DB o vía un script seed (no hay UI para
 * promote/demote — tiene que ser manual por seguridad).
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { prisma } from "./db";

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Re-fetchamos el role del DB por si fue actualizado después del session token
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (row?.role !== "admin") {
    redirect("/dashboard"); // 404 sería más correcto, pero redirect es más amistoso
  }
  return user;
}

export async function isAdmin(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return row?.role === "admin";
}
