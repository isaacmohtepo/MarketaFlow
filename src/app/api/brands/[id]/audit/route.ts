import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  changes_requested: "Cambios solicitados",
  approved: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
};

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvEscape).join(",");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandId } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const access = await getBrandAccess(user.id, brandId);
  // El audit log incluye comentarios internos del equipo. Los clients NO
  // deberían poder descargarlo. Restringimos a canEdit (owner/editor).
  if (!access || !access.canEdit) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const to = toParam ? new Date(toParam) : new Date();

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { agency: true },
  });
  if (!brand) return new Response("Not found", { status: 404 });

  // Tres fuentes de eventos: Activity, Approval, Comment.
  const [activities, approvals, comments] = await Promise.all([
    prisma.activity.findMany({
      where: {
        post: { brandId },
        createdAt: { gte: from, lte: to },
      },
      include: {
        user: { select: { name: true, email: true } },
        post: { select: { id: true, caption: true } },
      },
    }),
    prisma.approval.findMany({
      where: {
        post: { brandId },
        createdAt: { gte: from, lte: to },
      },
      include: {
        user: { select: { name: true, email: true } },
        post: { select: { id: true, caption: true } },
      },
    }),
    prisma.comment.findMany({
      where: {
        post: { brandId },
        createdAt: { gte: from, lte: to },
      },
      include: {
        user: { select: { name: true, email: true } },
        post: { select: { id: true, caption: true } },
      },
    }),
  ]);

  type Event = {
    timestamp: Date;
    type: string;
    actor: string;
    postId: string;
    postCaption: string;
    detail: string;
  };

  const events: Event[] = [];

  for (const a of activities) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(a.meta);
    } catch {}
    let detail = a.type;
    if (a.type === "status_changed") {
      const from = typeof meta.from === "string" ? STATUS_LABEL[meta.from] ?? meta.from : "?";
      const to = typeof meta.to === "string" ? STATUS_LABEL[meta.to] ?? meta.to : "?";
      detail = `Estado: ${from} → ${to}`;
    } else if (a.type === "version_uploaded") {
      detail = `Versión ${meta.version ?? ""} subida${meta.restoredFromVersion ? ` (restaurada de v${meta.restoredFromVersion})` : ""}`;
    } else if (a.type === "published") {
      detail = "Post publicado";
    } else if (a.type === "publish_failed") {
      detail = `Falló publicación: ${meta.error ?? ""}`;
    } else if (a.type === "created") {
      detail = "Post creado";
    } else if (a.type === "deleted") {
      detail = "Post movido a papelera";
    } else if (a.type === "restored") {
      detail = "Post restaurado de papelera";
    }
    events.push({
      timestamp: a.createdAt,
      type: a.type,
      actor: a.user?.name ?? a.user?.email ?? "Sistema",
      postId: a.postId,
      postCaption: a.post.caption ?? "",
      detail,
    });
  }

  for (const ap of approvals) {
    events.push({
      timestamp: ap.createdAt,
      type: ap.decision === "approved" ? "approval" : "changes_request",
      actor: ap.user.name ?? ap.user.email,
      postId: ap.postId,
      postCaption: ap.post.caption ?? "",
      detail:
        ap.decision === "approved"
          ? "Aprobó el post"
          : `Solicitó cambios${ap.note ? `: ${ap.note}` : ""}`,
    });
  }

  for (const c of comments) {
    events.push({
      timestamp: c.createdAt,
      type: c.parentId ? "comment_reply" : c.x !== null ? "comment_pin" : "comment",
      actor: c.user.name ?? c.user.email,
      postId: c.postId,
      postCaption: c.post.caption ?? "",
      detail: c.body,
    });
  }

  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const lines: string[] = [];
  lines.push(row(["Timestamp", "Tipo", "Usuario", "Post ID", "Post (caption)", "Detalle"]));
  for (const e of events) {
    lines.push(
      row([
        e.timestamp.toISOString(),
        e.type,
        e.actor,
        e.postId,
        e.postCaption.slice(0, 200),
        e.detail,
      ]),
    );
  }

  const slug = brand.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const filename = `audit-${slug}-${fromStr}-${toStr}.csv`;

  // BOM al inicio para que Excel lo abra bien con UTF-8
  const csv = "﻿" + lines.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
