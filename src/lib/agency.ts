import { prisma } from "./db";
import { getActiveAgencyId } from "./active-agency";

/**
 * Nombre de la agencia ACTIVA del usuario (workspace activo, cookie-aware).
 * Delega en el resolver central para que coincida con lo que muestra el resto
 * de la app (sidebar, branding) cuando el user cambia de workspace.
 */
export async function getUserAgencyName(userId: string): Promise<string | null> {
  const agencyId = await getActiveAgencyId(userId);
  if (!agencyId) return null;
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { name: true },
  });
  return agency?.name ?? null;
}
