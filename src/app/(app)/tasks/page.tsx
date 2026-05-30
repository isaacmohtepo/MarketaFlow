import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserTaskAgency } from "@/lib/tasks";
import { hasPermission } from "@/lib/permissions";
import TasksBoard from "./TasksBoard";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const agency = await getUserTaskAgency(user.id);
  if (!agency) redirect("/dashboard");
  const canRead = await hasPermission(user.id, agency.agencyId, "tasks.read");
  if (!canRead) redirect("/dashboard");
  const canWrite = await hasPermission(user.id, agency.agencyId, "tasks.write");
  const canAssign = await hasPermission(user.id, agency.agencyId, "tasks.assign");

  // SSR-load inicial: tareas + brands + miembros (los filtros también lo
  // devuelven, pero así la página renderiza con datos sin spinner).
  const [tasks, brands, members] = await Promise.all([
    prisma.task.findMany({
      where: { agencyId: agency.agencyId },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
        brand: { select: { id: true, name: true, color: true, logoUrl: true } },
        post: { select: { id: true, title: true, caption: true } },
        subtasks: { orderBy: { position: "asc" } },
      },
    }),
    prisma.brand.findMany({
      where: { agencyId: agency.agencyId, lockedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, logoUrl: true },
    }),
    prisma.membership
      .findMany({
        where: { agencyId: agency.agencyId, role: { not: "client" } },
        orderBy: { id: "asc" },
        select: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      })
      .then((ms) => {
        const seen = new Set<string>();
        const out: Array<{
          id: string;
          name: string | null;
          email: string;
          avatarUrl: string | null;
        }> = [];
        for (const m of ms) {
          if (seen.has(m.user.id)) continue;
          seen.add(m.user.id);
          out.push(m.user);
        }
        return out;
      }),
  ]);

  return (
    <div className="flex h-full flex-col">
      <TasksBoard
        currentUserId={user.id}
        currentUserName={user.name ?? user.email}
        initialTasks={JSON.parse(JSON.stringify(tasks))}
        brands={brands}
        members={members}
        canWrite={canWrite}
        canAssign={canAssign}
      />
    </div>
  );
}
