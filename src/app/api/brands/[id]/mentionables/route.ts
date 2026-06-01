import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Devuelve usuarios que tienen acceso a la marca y son válidos para @mencionar.
 * Excluye al usuario actual (no tiene sentido mencionarte a ti mismo).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandRef } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, brandRef);
  if (!access) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const brandId = access.brandId; // ref → id real

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const all = url.searchParams.get("all") === "1";

  // Pool: members directos a la marca (clients de esta brand) + agency-level
  // (owner/editor de la agencia dueña, brandId null). El query anterior usaba
  // `agency: { brands: { some: { id: brandId } } }` SIN restringir brandId,
  // lo que filtraba clients de OTRAS brands de la misma agencia a un client
  // de esta brand → enumeration cross-brand de PII (nombres + handles + role).
  const members = await prisma.membership.findMany({
    where: {
      OR: [
        { brandId },
        { brandId: null, agency: { brands: { some: { id: brandId } } } },
      ],
    },
    include: { user: { select: { id: true, name: true, email: true } } },
    take: 100,
  });
  const seen = new Set<string>();
  const items: { userId: string; name: string; handle: string; role: string }[] = [];
  for (const m of members) {
    const u = m.user;
    if (seen.has(u.id) || u.id === user.id) continue;
    // Excluir guest users del widget (visitantes anónimos que dejaron feedback,
    // no son parte del equipo y no deben recibir notificaciones de @menciones).
    const email = u.email.toLowerCase();
    if (email.endsWith("@guest.local") || email.startsWith("widget_")) continue;
    seen.add(u.id);
    const handle = (u.email.split("@")[0] ?? "").toLowerCase();
    items.push({
      userId: u.id,
      name: u.name ?? u.email,
      handle,
      role: m.role,
    });
  }

  let filtered = items;
  if (q.length > 0) {
    filtered = items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.handle.includes(q),
    );
  }
  // Si all=1 devolvemos todos (cache para client). Si no, máx 8 sugerencias.
  return NextResponse.json({ users: all ? filtered : filtered.slice(0, 8) });
}
