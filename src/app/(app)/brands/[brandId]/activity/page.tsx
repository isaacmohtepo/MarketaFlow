import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  CornerDownRight,
  MapPin,
  FileText,
  Sparkles,
  Trash2,
  RotateCcw,
  Send,
  X,
  Activity as ActivityIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  changes_requested: "Cambios solicitados",
  approved: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
};

type FeedEvent = {
  id: string;
  timestamp: Date;
  type: string;
  actor: string;
  postId: string;
  postCaption: string | null;
  postImageUrl: string | null;
  body: string;
  variant: "neutral" | "good" | "warn" | "bad" | "info";
  Icon: typeof CheckCircle2;
};

function relTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (dayKey(d) === dayKey(today)) return "Hoy";
  if (dayKey(d) === dayKey(yesterday)) return "Ayer";
  return d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
}

const VARIANT_STYLES: Record<FeedEvent["variant"], string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  bad: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-violet-50 text-violet-700 ring-violet-200",
  neutral: "bg-zinc-50 text-zinc-600 ring-zinc-200",
};

/**
 * Timeline de actividad por marca. Agrupa Activity (cambios de estado, versiones,
 * publicación), Approval (aprobaciones y cambios solicitados) y Comment (threads
 * + replies). Últimos 90 días, agrupados por día.
 *
 * El cliente solo ve eventos relacionados a posts que él puede ver (no draft) y
 * comentarios no internos.
 */
export default async function BrandActivityPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access) notFound();

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { name: true },
  });
  if (!brand) notFound();

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const isClient = access.role === "client";

  const [activities, approvals, comments] = await Promise.all([
    prisma.activity.findMany({
      where: {
        post: { brandId, ...(isClient ? { status: { not: "draft" } } : {}) },
        createdAt: { gte: since },
      },
      include: {
        user: { select: { name: true, email: true } },
        post: { select: { id: true, caption: true, imageUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.approval.findMany({
      where: {
        post: { brandId, ...(isClient ? { status: { not: "draft" } } : {}) },
        createdAt: { gte: since },
      },
      include: {
        user: { select: { name: true, email: true } },
        post: { select: { id: true, caption: true, imageUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.comment.findMany({
      where: {
        post: { brandId, ...(isClient ? { status: { not: "draft" } } : {}) },
        createdAt: { gte: since },
        ...(isClient ? { internal: false } : {}),
      },
      include: {
        user: { select: { name: true, email: true } },
        post: { select: { id: true, caption: true, imageUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const events: FeedEvent[] = [];

  for (const a of activities) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(a.meta);
    } catch {}
    let body = a.type;
    let variant: FeedEvent["variant"] = "neutral";
    let Icon: FeedEvent["Icon"] = ActivityIcon;
    if (a.type === "status_changed") {
      const from = typeof meta.from === "string" ? STATUS_LABEL[meta.from] ?? meta.from : "?";
      const to = typeof meta.to === "string" ? STATUS_LABEL[meta.to] ?? meta.to : "?";
      body = `Cambió estado: ${from} → ${to}`;
      variant = meta.to === "approved" || meta.to === "published" ? "good" : "info";
      Icon = ActivityIcon;
    } else if (a.type === "version_uploaded") {
      body = `Subió versión v${meta.version ?? ""}${
        meta.restoredFromVersion ? ` (restaurada de v${meta.restoredFromVersion})` : ""
      }`;
      variant = "info";
      Icon = RotateCcw;
    } else if (a.type === "published") {
      body = "Publicó el post";
      variant = "good";
      Icon = Send;
    } else if (a.type === "publish_failed") {
      body = `Falló al publicar: ${meta.error ?? ""}`;
      variant = "bad";
      Icon = AlertCircle;
    } else if (a.type === "created") {
      body = "Creó el post";
      variant = "neutral";
      Icon = Sparkles;
    } else if (a.type === "deleted") {
      body = "Movió a la papelera";
      variant = "warn";
      Icon = Trash2;
    } else if (a.type === "restored") {
      body = "Restauró de la papelera";
      variant = "info";
      Icon = RotateCcw;
    }
    events.push({
      id: `a:${a.id}`,
      timestamp: a.createdAt,
      type: a.type,
      actor: a.user?.name ?? a.user?.email ?? "Sistema",
      postId: a.postId,
      postCaption: a.post.caption,
      postImageUrl: a.post.imageUrl,
      body,
      variant,
      Icon,
    });
  }

  for (const ap of approvals) {
    events.push({
      id: `ap:${ap.id}`,
      timestamp: ap.createdAt,
      type: ap.decision === "approved" ? "approval" : "changes_request",
      actor: ap.user.name ?? ap.user.email,
      postId: ap.postId,
      postCaption: ap.post.caption,
      postImageUrl: ap.post.imageUrl,
      body:
        ap.decision === "approved"
          ? "Aprobó el post"
          : `Pidió cambios${ap.note ? `: ${ap.note}` : ""}`,
      variant: ap.decision === "approved" ? "good" : "warn",
      Icon: ap.decision === "approved" ? CheckCircle2 : X,
    });
  }

  for (const c of comments) {
    const isReply = !!c.parentId;
    const isPin = c.x !== null;
    events.push({
      id: `c:${c.id}`,
      timestamp: c.createdAt,
      type: isReply ? "comment_reply" : isPin ? "comment_pin" : "comment",
      actor: c.user.name ?? c.user.email,
      postId: c.postId,
      postCaption: c.post.caption,
      postImageUrl: c.post.imageUrl,
      body: c.body.length > 240 ? c.body.slice(0, 240) + "…" : c.body,
      variant: c.internal ? "info" : "neutral",
      Icon: isReply ? CornerDownRight : isPin ? MapPin : MessageSquare,
    });
  }

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const top = events.slice(0, 200);

  // Agrupa por día
  const grouped = new Map<string, { label: string; date: Date; events: FeedEvent[] }>();
  for (const e of top) {
    const key = dayKey(e.timestamp);
    if (!grouped.has(key)) {
      grouped.set(key, { label: dayLabel(e.timestamp), date: e.timestamp, events: [] });
    }
    grouped.get(key)!.events.push(e);
  }
  const days = Array.from(grouped.values()).sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/brands/${brandId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver al feed
      </Link>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Actividad</h1>
          <p className="text-sm text-zinc-500">{brand.name} · últimos 90 días</p>
        </div>
        {access.canEdit && (
          <Link
            href={`/api/brands/${brandId}/audit`}
            className="inline-flex items-center gap-1.5 rounded-full btn-secondary px-3 py-1.5 text-[12px] font-semibold"
          >
            <FileText className="h-3.5 w-3.5" />
            Descargar CSV
          </Link>
        )}
      </div>

      {top.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-3 p-12 text-center">
          <ActivityIcon className="h-6 w-6 text-zinc-400" />
          <p className="text-[14px] font-semibold text-zinc-900">Sin actividad reciente</p>
          <p className="text-[12px] text-zinc-500">
            Cuando hagas algo en esta marca, aparecerá acá.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {days.map((day) => (
            <section key={day.label} className="space-y-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                {day.label}
              </h2>
              <ul className="space-y-2">
                {day.events.map((e) => (
                  <li key={e.id} className="card p-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ring-1 ${VARIANT_STYLES[e.variant]}`}
                      >
                        <e.Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px]">
                          <span className="font-semibold text-zinc-900">{e.actor}</span>{" "}
                          <span className="text-zinc-700">{e.body}</span>
                        </p>
                        <Link
                          href={`/brands/${brandId}/posts/${e.postId}`}
                          className="mt-2 flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1.5 text-[12px] text-zinc-600 transition hover:bg-zinc-100"
                        >
                          {e.postImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={e.postImageUrl}
                              alt=""
                              className="h-6 w-6 flex-shrink-0 rounded object-cover"
                            />
                          ) : (
                            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded bg-zinc-200">
                              <FileText className="h-3 w-3 text-zinc-500" />
                            </span>
                          )}
                          <span className="truncate">
                            {e.postCaption?.trim() ? e.postCaption.slice(0, 60) : "(sin caption)"}
                          </span>
                        </Link>
                      </div>
                      <span className="flex-shrink-0 text-[11px] text-zinc-400 tabular-nums">
                        {relTime(e.timestamp)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
