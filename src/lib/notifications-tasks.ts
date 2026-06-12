/**
 * Notificaciones específicas del sistema de tareas internas.
 * Separado de `notifications.ts` para no inflar ese archivo (que está
 * muy enfocado en post-related notifs con white-label y templates de email).
 *
 * Tipos nuevos:
 *  - task_assigned     → te asignaron una tarea
 *  - task_due_soon     → tu tarea vence en <= 24h (la dispara el cron diario)
 *  - task_due_overdue  → tu tarea ya venció (se dispara una sola vez al cruzar el límite)
 */
import { prisma } from "./db";
import { sendEmail, appUrl } from "./email";
import { escapeHtml } from "./sanitize-html";
import { TASK_PRIORITY_LABEL, type TaskPriority } from "./tasks";

type TaskWithBasics = {
  id: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  assigneeId: string | null;
  brand: { id: string; name: string } | null;
};

export async function notifyTaskAssigned(opts: {
  task: TaskWithBasics;
  actorName: string;
  actorAvatarUrl?: string | null;
}): Promise<void> {
  if (!opts.task.assigneeId) return;
  const recipient = await prisma.user.findUnique({
    where: { id: opts.task.assigneeId },
    select: { id: true, email: true, name: true, emailNotifications: true },
  });
  if (!recipient) return;

  const priorityLabel =
    TASK_PRIORITY_LABEL[opts.task.priority as TaskPriority] ?? opts.task.priority;
  const brandSuffix = opts.task.brand ? ` (${opts.task.brand.name})` : "";
  const body = `${opts.actorName} te asignó: "${opts.task.title}"${brandSuffix}`;

  await prisma.notification.create({
    data: {
      userId: recipient.id,
      type: "task_assigned",
      body,
      brandId: opts.task.brand?.id ?? null,
      postId: null,
      taskId: opts.task.id,
      actorName: opts.actorName,
      actorAvatarUrl: opts.actorAvatarUrl ?? null,
    },
  });

  if (!recipient.emailNotifications) return;
  const taskUrl = appUrl(`/tasks?open=${opts.task.id}`);
  const subject = `Te asignaron una tarea: ${opts.task.title}`;
  const dueLine = opts.task.dueDate
    ? `<p style="margin:0 0 12px;color:#52525b;font-size:13px"><strong>Vence:</strong> ${opts.task.dueDate.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p>`
    : "";
  const html = `
    <div style="font-family:system-ui,sans-serif;color:#18181b;line-height:1.55">
      <p>Hola ${recipient.name ?? ""},</p>
      <p><strong>${opts.actorName}</strong> te asignó una tarea${brandSuffix ? ` de <strong>${opts.task.brand!.name}</strong>` : ""}:</p>
      <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px;margin:16px 0;background:#fafafa">
        <p style="margin:0 0 8px;font-size:16px;font-weight:600">${escapeHtml(opts.task.title)}</p>
        <p style="margin:0 0 12px;color:#71717a;font-size:13px">Prioridad: <strong>${priorityLabel}</strong></p>
        ${dueLine}
        <a href="${taskUrl}" style="display:inline-block;background:#8b5cf6;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver tarea</a>
      </div>
    </div>
  `;
  sendEmail({ to: recipient.email, subject, html }).catch((err) =>
    console.error("notifyTaskAssigned email", err),
  );
}

/**
 * Cron diario: encuentra tareas con dueDate hoy o mañana sin completar, y
 * manda 1 reminder al asignado (idempotente vía type+postId — usamos taskId
 * como key efímera en el body para diferenciar). Llamado desde
 * /api/cron/billing una vez al día.
 */
export async function runTaskDueReminders(): Promise<{ sent: number; overdue: number }> {
  const now = new Date();
  // Ventana: hoy + mañana (48h adelante desde ahora)
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  // Para overdue: sin completar y dueDate ya pasada
  const overdueCutoff = now;

  const dueSoon = await prisma.task.findMany({
    where: {
      status: { not: "done" },
      assigneeId: { not: null },
      dueDate: { gte: now, lte: horizon },
    },
    include: { brand: { select: { id: true, name: true } } },
  });

  const overdue = await prisma.task.findMany({
    where: {
      status: { not: "done" },
      assigneeId: { not: null },
      dueDate: { lt: overdueCutoff, gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      // Solo las que cruzaron el límite en las últimas 24h, para no spammear
      // todos los días sobre la misma tarea overdue de hace 1 mes.
    },
    include: { brand: { select: { id: true, name: true } } },
  });

  // ESCALABILIDAD: idempotencia en BATCH. Antes esto hacía 1 findFirst + 1
  // create POR TAREA dentro de un loop (2N queries — con 2000 tareas eran
  // hasta 4000 queries en un solo cron). Ahora: 1 findMany de las notifs
  // recientes de todas las tareas candidatas + 2 createMany. Total: ~5 queries
  // sin importar N.
  const allTaskIds = [...dueSoon, ...overdue]
    .filter((t) => t.assigneeId)
    .map((t) => t.id);
  if (allTaskIds.length === 0) return { sent: 0, overdue: 0 };

  const soonCutoff = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const overdueDedupCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const existing = await prisma.notification.findMany({
    where: {
      type: { in: ["task_due_soon", "task_due_overdue"] },
      taskId: { in: allTaskIds },
      // Ventana más amplia de las dos; el filtrado fino se hace en memoria.
      createdAt: { gte: overdueDedupCutoff },
    },
    select: { userId: true, type: true, taskId: true, createdAt: true },
  });
  const seenSoon = new Set(
    existing
      .filter((e) => e.type === "task_due_soon" && e.createdAt >= soonCutoff)
      .map((e) => `${e.userId}:${e.taskId}`),
  );
  const seenOverdue = new Set(
    existing
      .filter((e) => e.type === "task_due_overdue")
      .map((e) => `${e.userId}:${e.taskId}`),
  );

  const soonData = dueSoon
    .filter((t) => t.assigneeId && !seenSoon.has(`${t.assigneeId}:${t.id}`))
    .map((t) => {
      const hoursLeft = Math.max(
        0,
        Math.round((t.dueDate!.getTime() - now.getTime()) / (60 * 60 * 1000)),
      );
      const whenLabel = hoursLeft < 24 ? `en ${hoursLeft}h` : "mañana";
      return {
        userId: t.assigneeId!,
        type: "task_due_soon",
        body: `Vence ${whenLabel}: "${t.title}"`,
        brandId: t.brand?.id ?? null,
        taskId: t.id,
        actorName: null,
      };
    });
  const overdueData = overdue
    .filter((t) => t.assigneeId && !seenOverdue.has(`${t.assigneeId}:${t.id}`))
    .map((t) => ({
      userId: t.assigneeId!,
      type: "task_due_overdue",
      body: `Tarea vencida: "${t.title}"`,
      brandId: t.brand?.id ?? null,
      taskId: t.id,
      actorName: null,
    }));

  if (soonData.length > 0) {
    await prisma.notification.createMany({ data: soonData });
  }
  if (overdueData.length > 0) {
    await prisma.notification.createMany({ data: overdueData });
  }

  return { sent: soonData.length, overdue: overdueData.length };
}


/**
 * Notifica a los PARTICIPANTES de una tarea (asignados + creador) que alguien
 * la movió de columna. In-app solamente (sin email — sería spam: el equipo
 * mueve tareas todo el día). Excluye al actor.
 */
export async function notifyTaskStatusChanged(opts: {
  taskId: string;
  taskTitle: string;
  /** Label legible de la columna destino (ej. "Completadas"). */
  statusLabel: string;
  /** userIds de asignados + creador (se deduplica acá). */
  participantIds: (string | null)[];
  actorName: string;
  actorAvatarUrl?: string | null;
  excludeUserId?: string;
}): Promise<void> {
  const ids = [
    ...new Set(opts.participantIds.filter(Boolean) as string[]),
  ].filter((id) => id !== opts.excludeUserId);
  if (ids.length === 0) return;

  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: "task_status",
      body: `${opts.actorName} movió "${opts.taskTitle}" a ${opts.statusLabel}`,
      taskId: opts.taskId,
      actorName: opts.actorName,
      actorAvatarUrl: opts.actorAvatarUrl ?? null,
    })),
  });
}

/**
 * Notifica a los PARTICIPANTES (asignados + creador) que hay un comentario
 * nuevo en la tarea. In-app solamente. Excluye al actor Y a los @mencionados
 * (esos ya reciben su notificación de mención, con email).
 */
export async function notifyTaskComment(opts: {
  taskId: string;
  taskTitle: string;
  participantIds: (string | null)[];
  mentionedUserIds?: string[];
  actorName: string;
  actorAvatarUrl?: string | null;
  body: string;
  excludeUserId?: string;
}): Promise<void> {
  const mentioned = new Set(opts.mentionedUserIds ?? []);
  const ids = [
    ...new Set(opts.participantIds.filter(Boolean) as string[]),
  ].filter((id) => id !== opts.excludeUserId && !mentioned.has(id));
  if (ids.length === 0) return;

  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: "task_comment",
      body: `${opts.actorName} comentó en "${opts.taskTitle}": "${opts.body.slice(0, 100)}"`,
      taskId: opts.taskId,
      actorName: opts.actorName,
      actorAvatarUrl: opts.actorAvatarUrl ?? null,
    })),
  });
}

/**
 * Notifica a los usuarios @mencionados en un comentario de tarea. Crea la
 * notificación in-app + email (si el user los tiene activados). El link va a
 * /tasks?open=<taskId>.
 */
export async function notifyTaskMention(opts: {
  taskId: string;
  taskTitle: string;
  mentionedUserIds: string[];
  actorName: string;
  actorAvatarUrl?: string | null;
  body: string;
  excludeUserId?: string;
}): Promise<void> {
  const ids = opts.mentionedUserIds.filter((id) => id !== opts.excludeUserId);
  if (ids.length === 0) return;

  const recipients = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, name: true, emailNotifications: true },
  });
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((r) => ({
      userId: r.id,
      type: "task_mention",
      body: `${opts.actorName} te mencionó en "${opts.taskTitle}": "${opts.body.slice(0, 100)}"`,
      taskId: opts.taskId,
      actorName: opts.actorName,
      actorAvatarUrl: opts.actorAvatarUrl ?? null,
    })),
  });

  const taskUrl = appUrl(`/tasks?open=${opts.taskId}`);
  for (const r of recipients) {
    if (!r.emailNotifications) continue;
    const html = `
      <div style="font-family:system-ui,sans-serif;color:#18181b;line-height:1.55">
        <p>Hola ${escapeHtml(r.name ?? "")},</p>
        <p><strong>${escapeHtml(opts.actorName)}</strong> te mencionó en un comentario de la tarea
        <strong>${escapeHtml(opts.taskTitle)}</strong>:</p>
        <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px;margin:16px 0;background:#fafafa">
          <p style="margin:0;color:#3f3f46;font-size:14px">${escapeHtml(opts.body.slice(0, 400))}</p>
        </div>
        <a href="${taskUrl}" style="display:inline-block;background:#8b5cf6;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver tarea</a>
      </div>
    `;
    sendEmail({
      to: r.email,
      subject: `${opts.actorName} te mencionó en una tarea`,
      html,
    }).catch((err) => console.error("notifyTaskMention email", err));
  }
}
