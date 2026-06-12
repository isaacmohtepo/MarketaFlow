import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import {
  getUserTaskAgency,
  getAgencyTaskColumns,
  isTaskPriority,
  isTaskRecurrence,
  sanitizeTaskTitle,
  recordTaskActivity,
  TASK_STATUSES,
} from "@/lib/tasks";
import { computeAutoStatus } from "@/lib/tasks-types";

/**
 * GET /api/tasks?onlyMine=1&brandId=X&assigneeId=Y&priority=high
 * Devuelve TODAS las tareas de la agency del user, con sus subtareas + datos
 * mínimos del asignado/creador/marca/post linkeado.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency)
    return NextResponse.json(
      { error: "Sin acceso a tareas (no eres parte de ninguna agencia)" },
      { status: 403 },
    );

  const ok = await hasAgencyPermission(user.id, agency.agencyId, "tasks.read");
  if (!ok)
    return NextResponse.json({ error: "Sin permiso: tasks.read" }, { status: 403 });

  const url = new URL(req.url);
  const onlyMine = url.searchParams.get("onlyMine") === "1";
  const brandIdParam = url.searchParams.get("brandId");
  const assigneeIdParam = url.searchParams.get("assigneeId");
  const priorityParam = url.searchParams.get("priority");

  // Build where dinámico — default excluye papelera (deletedAt:null)
  const where: Record<string, unknown> = {
    agencyId: agency.agencyId,
    deletedAt: null,
  };
  if (onlyMine) where.assigneeId = user.id;
  else if (assigneeIdParam === "none") where.assigneeId = null;
  else if (assigneeIdParam) where.assigneeId = assigneeIdParam;
  if (brandIdParam === "none") where.brandId = null;
  else if (brandIdParam) where.brandId = brandIdParam;
  if (priorityParam && isTaskPriority(priorityParam))
    where.priority = priorityParam;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    // Mismo cap defensivo que el SSR del board (ver tasks/page.tsx).
    take: 1000,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignees: { select: { id: true, name: true, email: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      brand: { select: { id: true, name: true, color: true, logoUrl: true } },
      post: { select: { id: true, title: true, caption: true } },
      subtasks: { orderBy: { position: "asc" } },
      tags: { select: { id: true, name: true, color: true } },
    },
  });

  // También devolver listas reutilizables para los filtros (brands del user,
  // miembros del equipo) — así el cliente no hace 3 calls separados al cargar.
  const [brands, members] = await Promise.all([
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
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      })
      .then((ms) => {
        // De-duplicar (un user puede tener varias memberships brand-scoped)
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

  const columns = await getAgencyTaskColumns(agency.agencyId);

  return NextResponse.json({
    tasks,
    brands,
    members,
    agencyId: agency.agencyId,
    currentUserId: user.id,
    statuses: TASK_STATUSES,
    columns,
  });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  postId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  recurrence: z.string().nullable().optional(),
  subtasks: z
    .array(z.object({ title: z.string().min(1).max(200) }))
    .max(50)
    .optional(),
});

/**
 * POST /api/tasks — crear una tarea con subtareas opcionales (atómico).
 * El creator es siempre el user actual. Si se especifica assigneeId distinto
 * al user actual, requiere permiso tasks.assign.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency)
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const canWrite = await hasAgencyPermission(user.id, agency.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso: tasks.write" }, { status: 403 });

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  let title: string;
  try {
    title = sanitizeTaskTitle(body.title);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "title inválido" },
      { status: 400 },
    );
  }

  // Validar status contra las columnas reales de la agency (dinámicas).
  const columns = await getAgencyTaskColumns(agency.agencyId);
  const colIds = new Set(columns.map((c) => c.id));
  const baseStatus =
    body.status && colIds.has(body.status)
      ? body.status
      : columns[0]?.id ?? "todo";
  const priority =
    body.priority && isTaskPriority(body.priority) ? body.priority : "normal";

  // Si quiere asignar a alguien distinto a uno mismo, requiere tasks.assign
  if (body.assigneeId && body.assigneeId !== user.id) {
    const canAssign = await hasAgencyPermission(
      user.id,
      agency.agencyId,
      "tasks.assign",
    );
    if (!canAssign)
      return NextResponse.json(
        { error: "Sin permiso para asignar a otros: tasks.assign" },
        { status: 403 },
      );
  }

  // Validar brandId pertenece a la agency
  if (body.brandId) {
    const brand = await prisma.brand.findUnique({
      where: { id: body.brandId },
      select: { id: true, agencyId: true },
    });
    if (!brand || brand.agencyId !== agency.agencyId) {
      return NextResponse.json({ error: "Marca inválida" }, { status: 400 });
    }
  }
  // Validar postId existe (y si hay brandId, que coincida)
  let resolvedBrandId: string | null = body.brandId ?? null;
  if (body.postId) {
    const post = await prisma.post.findUnique({
      where: { id: body.postId },
      select: { id: true, brandId: true, brand: { select: { agencyId: true } } },
    });
    if (!post || post.brand.agencyId !== agency.agencyId) {
      return NextResponse.json({ error: "Post inválido" }, { status: 400 });
    }
    // Si vino brandId, debe coincidir con la del post. Si no vino, lo seteamos
    // automático para mantener consistencia.
    if (body.brandId && body.brandId !== post.brandId) {
      return NextResponse.json(
        { error: "brandId no coincide con la marca del post" },
        { status: 400 },
      );
    }
    resolvedBrandId = post.brandId;
  }
  // Validar assigneeId pertenece a la agency
  if (body.assigneeId) {
    const m = await prisma.membership.findFirst({
      where: { userId: body.assigneeId, agencyId: agency.agencyId },
      select: { id: true },
    });
    if (!m)
      return NextResponse.json(
        { error: "Asignado inválido (no es miembro de la agencia)" },
        { status: 400 },
      );
  }
  let dueDate: Date | null = null;
  if (body.dueDate) {
    const d = new Date(body.dueDate);
    if (Number.isNaN(d.getTime()))
      return NextResponse.json({ error: "dueDate inválida" }, { status: 400 });
    dueDate = d;
  }

  // Aplicar reglas de auto-movimiento (creación siempre dispara). Ej: si
  // creas una tarea ya completada de un cliente con regla, va a su columna.
  const auto = computeAutoStatus(columns, {
    baseStatus,
    brandId: resolvedBrandId,
    priority,
    assigneeIds: body.assigneeId ? [body.assigneeId] : [],
    trigger: "field",
  });
  const status = auto.status;
  const statusIsDone = auto.isDone;

  // position = max(actual) + 1000 (paso grande para insertar entre dos sin
  // reescribir todo). Por columna (status).
  const last = await prisma.task.findFirst({
    where: { agencyId: agency.agencyId, status },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + 1000;

  const task = await prisma.task.create({
    data: {
      agencyId: agency.agencyId,
      brandId: resolvedBrandId,
      postId: body.postId ?? null,
      title,
      description: body.description ?? null,
      status,
      priority,
      completedAt: statusIsDone ? new Date() : null,
      // Legacy single assignee — mantenemos sync con el primer M2M
      assigneeId: body.assigneeId ?? null,
      // M2M: si hay assigneeId también lo agregamos a la lista
      assignees: body.assigneeId
        ? { connect: { id: body.assigneeId } }
        : undefined,
      creatorId: user.id,
      dueDate,
      recurrence: isTaskRecurrence(body.recurrence) ? body.recurrence : null,
      position,
      subtasks: body.subtasks?.length
        ? {
            create: body.subtasks.map((s, i) => ({
              title: s.title.trim().slice(0, 200),
              position: (i + 1) * 1000,
            })),
          }
        : undefined,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignees: { select: { id: true, name: true, email: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      brand: { select: { id: true, name: true, color: true, logoUrl: true } },
      post: { select: { id: true, title: true, caption: true } },
      subtasks: { orderBy: { position: "asc" } },
      tags: { select: { id: true, name: true, color: true } },
    },
  });

  // Activity log: tarea creada
  recordTaskActivity(task.id, user.id, "created", { title: task.title });

  // Notif al asignado (si distinto del creator)
  if (task.assigneeId && task.assigneeId !== user.id) {
    const { notifyTaskAssigned } = await import("@/lib/notifications-tasks");
    notifyTaskAssigned({
      task,
      actorName: user.name ?? user.email,
      actorAvatarUrl: user.avatarUrl,
    }).catch((err) => console.error("notifyTaskAssigned", err));
  }

  return NextResponse.json({ task });
}
