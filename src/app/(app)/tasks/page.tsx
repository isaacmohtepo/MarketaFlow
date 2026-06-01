import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getUserTaskAgency,
  getAgencyTaskColumns,
  runTaskAutoArchive,
} from "@/lib/tasks";
import { hasAgencyPermission } from "@/lib/permissions";
import { resolveStatusColors, resolveTaskColumns } from "@/lib/tasks-types";
import TasksBoard from "./TasksBoard";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const agency = await getUserTaskAgency(user.id);
  if (!agency) redirect("/dashboard");
  const canRead = await hasAgencyPermission(user.id, agency.agencyId, "tasks.read");
  if (!canRead) redirect("/dashboard");
  const canWrite = await hasAgencyPermission(user.id, agency.agencyId, "tasks.write");
  const canAssign = await hasAgencyPermission(user.id, agency.agencyId, "tasks.assign");

  // Auto-archivado oportunista: antes de leer las tareas, archivamos las que
  // superaron el límite de días en columnas con autoArchiveDays. Así el
  // tablero se mantiene limpio sin necesidad de un cron.
  const columnsForArchive = await getAgencyTaskColumns(agency.agencyId);
  await runTaskAutoArchive(agency.agencyId, columnsForArchive).catch(() => {});

  // SSR-load inicial: tareas + brands + miembros + colores customs de
  // las columnas (persistidos en Agency.taskStatusColors).
  const [tasks, brands, members, agencyRow, initialTags] = await Promise.all([
    prisma.task.findMany({
      where: { agencyId: agency.agencyId, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        assignees: { select: { id: true, name: true, email: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
        brand: { select: { id: true, name: true, color: true, logoUrl: true } },
        post: { select: { id: true, title: true, caption: true } },
        subtasks: { orderBy: { position: "asc" } },
        tags: { select: { id: true, name: true, color: true } },
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
    prisma.agency.findUnique({
      where: { id: agency.agencyId },
      select: { taskStatusColors: true, taskColumns: true },
    }),
    prisma.taskTag.findMany({
      where: { agencyId: agency.agencyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);
  const statusColors = resolveStatusColors(agencyRow?.taskStatusColors);
  const columns = resolveTaskColumns(
    agencyRow?.taskColumns,
    agencyRow?.taskStatusColors,
  );

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
        initialStatusColors={statusColors}
        initialColumns={columns}
        initialTags={initialTags}
      />
    </div>
  );
}
