import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency, recordTaskActivity } from "@/lib/tasks";

/**
 * Adjuntos de una tarea (brief, diseño de referencia…). El archivo se sube
 * primero a R2 vía /api/upload; acá solo se registra la URL.
 *
 * GET    /api/tasks/[id]/attachments
 * POST   /api/tasks/[id]/attachments { url, name?, mime? }
 * DELETE /api/tasks/[id]/attachments?attachmentId=X
 */

const createSchema = z.object({
  // Misma policy que posts: solo http(s) o /uploads/ local (bloquea
  // javascript:/data: que serían XSS al renderizar como link).
  url: z
    .string()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u) || u.startsWith("/uploads/"), "URL no permitida"),
  name: z.string().max(200).nullable().optional(),
  mime: z.string().max(100).nullable().optional(),
});

async function loadCtx(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, agencyId: true, title: true },
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
  const ctx = await loadCtx(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const canRead = await hasAgencyPermission(user.id, ctx.agency.agencyId, "tasks.read");
  if (!canRead) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ attachments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await loadCtx(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const canWrite = await hasAgencyPermission(user.id, ctx.agency.agencyId, "tasks.write");
  if (!canWrite) return NextResponse.json({ error: "Sin permiso: tasks.write" }, { status: 403 });

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: id,
      userId: user.id,
      url: body.url,
      name: body.name ?? null,
      mime: body.mime ?? null,
    },
  });
  recordTaskActivity(id, user.id, "comment_added", {
    attachment: body.name ?? body.url,
  });
  return NextResponse.json({ attachment });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await loadCtx(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const canWrite = await hasAgencyPermission(user.id, ctx.agency.agencyId, "tasks.write");
  if (!canWrite) return NextResponse.json({ error: "Sin permiso: tasks.write" }, { status: 403 });

  const attachmentId = new URL(req.url).searchParams.get("attachmentId");
  if (!attachmentId)
    return NextResponse.json({ error: "Falta attachmentId" }, { status: 400 });
  await prisma.taskAttachment.deleteMany({
    where: { id: attachmentId, taskId: id },
  });
  return NextResponse.json({ ok: true });
}
