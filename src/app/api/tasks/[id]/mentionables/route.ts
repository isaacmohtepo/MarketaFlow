import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserTaskAgency } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Usuarios @mencionables en los comentarios de una tarea: miembros de la
 * agency dueña de la tarea (no clients). Mismo shape que el de marcas para
 * que MentionInput lo consuma igual: { users: [{ userId, name, handle, role }] }.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id },
    select: { agencyId: true },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency || agency.agencyId !== task.agencyId)
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const all = url.searchParams.get("all") === "1";

  // Miembros del equipo (no clients) de la agency.
  const members = await prisma.membership.findMany({
    where: { agencyId: task.agencyId, role: { not: "client" } },
    include: { user: { select: { id: true, name: true, email: true } } },
    take: 200,
  });

  const seen = new Set<string>();
  const items: { userId: string; name: string; handle: string; role: string }[] =
    [];
  for (const m of members) {
    const u = m.user;
    if (seen.has(u.id) || u.id === user.id) continue;
    const email = u.email.toLowerCase();
    if (email.endsWith("@guest.local") || email.startsWith("widget_")) continue;
    seen.add(u.id);
    items.push({
      userId: u.id,
      name: u.name ?? u.email,
      handle: (u.email.split("@")[0] ?? "").toLowerCase(),
      role: m.role,
    });
  }

  let filtered = items;
  if (q.length > 0) {
    filtered = items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.handle.includes(q),
    );
  }
  return NextResponse.json({ users: all ? filtered : filtered.slice(0, 8) });
}
