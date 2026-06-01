import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency, recordTaskActivity } from "@/lib/tasks";
import { notifyTaskMention } from "@/lib/notifications-tasks";

/**
 * GET  /api/tasks/[id]/comments — lista todos los comentarios de la tarea
 * POST /api/tasks/[id]/comments { body } — crear comentario
 */
const createSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

/** Extrae los @handles de un texto (mismo patrón que comentarios de posts). */
function extractMentions(text: string): string[] {
  const matches =
    text.match(/@(?:"[^"]+"|[\w.\-áéíóúñÁÉÍÓÚÑ]+)/g) ?? [];
  return matches.map((m) =>
    m.slice(1).replace(/^"|"$/g, "").trim().toLowerCase(),
  );
}

/** Resuelve los @menciones a userIds dentro de los miembros de la agency. */
async function resolveMentionedUsers(
  agencyId: string,
  authorId: string,
  text: string,
): Promise<string[]> {
  const mentions = extractMentions(text);
  if (mentions.length === 0) return [];
  const members = await prisma.membership.findMany({
    where: { agencyId, role: { not: "client" } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const matched = new Set<string>();
  for (const m of mentions) {
    for (const mem of members) {
      const u = mem.user;
      if (u.id === authorId) continue;
      const candidates = [
        u.name?.toLowerCase(),
        u.email.toLowerCase().split("@")[0],
      ].filter(Boolean) as string[];
      if (candidates.some((c) => c === m || c.startsWith(m))) matched.add(u.id);
    }
  }
  return Array.from(matched);
}

async function loadTaskForUser(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, agencyId: true },
  });
  if (!task) return null;
  const agency = await getUserTaskAgency(userId);
  if (!agency || agency.agencyId !== task.agencyId) return null;
  return { task, agency };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await loadTaskForUser(id, user.id);
  if (!ctx) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const canRead = await hasAgencyPermission(user.id, ctx.agency.agencyId, "tasks.read");
  if (!canRead)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
  return NextResponse.json({ comments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await loadTaskForUser(id, user.id);
  if (!ctx) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  // Cualquier user con tasks.read puede comentar (no requiere write — leer
  // y discutir es el mismo nivel de capability)
  const canRead = await hasAgencyPermission(user.id, ctx.agency.agencyId, "tasks.read");
  if (!canRead)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const comment = await prisma.taskComment.create({
    data: {
      taskId: id,
      userId: user.id,
      body: body.body,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  // Activity log
  recordTaskActivity(id, user.id, "comment_added", {
    commentId: comment.id,
    preview: body.body.slice(0, 80),
  });

  // @menciones → notificación + email. AWAITeado (no fire-and-forget) para que
  // la notificación se cree de forma confiable antes de responder. Los emails
  // adentro siguen siendo best-effort (no bloquean).
  try {
    const mentionedIds = await resolveMentionedUsers(
      ctx.agency.agencyId,
      user.id,
      body.body,
    );
    if (mentionedIds.length > 0) {
      const t = await prisma.task.findUnique({
        where: { id },
        select: { title: true },
      });
      await notifyTaskMention({
        taskId: id,
        taskTitle: t?.title ?? "una tarea",
        mentionedUserIds: mentionedIds,
        actorName: user.name ?? user.email,
        actorAvatarUrl: user.avatarUrl,
        body: body.body,
        excludeUserId: user.id,
      });
    }
  } catch (err) {
    console.error("task mention notify", err);
  }

  return NextResponse.json({ comment });
}
