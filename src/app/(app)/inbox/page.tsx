import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, AlertCircle, CheckCircle2, CalendarClock, Inbox as InboxIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import InboxNotifications from "./InboxNotifications";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import MediaThumb from "@/components/MediaThumb";

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatDate(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function formatDateTime(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const agencyName = await getUserAgencyName(user.id);

  // ¿Es agencia (owner/editor) o cliente?
  const agencyMembership = await prisma.membership.findFirst({
    where: { userId: user.id, role: { in: ["owner", "editor"] }, brandId: null },
  });
  const isAgency = !!agencyMembership;

  // Scoping correcto: agency-level (brandId: null) ve toda la agencia, pero
  // un client brand-scoped solo debe ver SU brand. Sin esto, un client de
  // brand X de la agency A veía el inbox de TODAS las brands de A.
  const accessFilter: Prisma.PostWhereInput = {
    deletedAt: null,
    brand: {
      OR: [
        { agency: { members: { some: { userId: user.id, brandId: null } } } },
        { memberships: { some: { userId: user.id } } },
      ],
    },
  };

  const now = new Date();
  const in7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [
    pendingApproval,
    changesRequested,
    readyToPublish,
    upcoming,
    recentlyPublished,
    notifications,
    unreadCount,
  ] = await Promise.all([
      // Por aprobar (relevante a cliente; agencia también ve para saber qué espera)
      prisma.post.findMany({
        where: { ...accessFilter, status: "in_review" },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: { brand: true },
      }),
      // Cambios solicitados (relevante a agencia)
      prisma.post.findMany({
        where: { ...accessFilter, status: "changes_requested" },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: { brand: true, approvals: { orderBy: { createdAt: "desc" }, take: 1, include: { user: { select: { id: true, name: true, email: true } } } } },
      }),
      // Listos para publicar (approved/scheduled con fecha pasada o sin fecha)
      prisma.post.findMany({
        where: {
          ...accessFilter,
          status: { in: ["approved", "scheduled"] },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
          publishedAt: null,
        },
        orderBy: { scheduledAt: "asc" },
        take: 10,
        include: { brand: true },
      }),
      // Programados próximos 7 días
      prisma.post.findMany({
        where: {
          ...accessFilter,
          status: { in: ["approved", "scheduled"] },
          scheduledAt: { gt: now, lte: in7d },
          publishedAt: null,
        },
        orderBy: { scheduledAt: "asc" },
        take: 10,
        include: { brand: true },
      }),
      // Publicados recientes
      prisma.post.findMany({
        where: { ...accessFilter, status: "published" },
        orderBy: { publishedAt: "desc" },
        take: 5,
        include: { brand: true },
      }),
      // Notificaciones personales (in-app) — solo las no archivadas
      prisma.notification.findMany({
        where: { userId: user.id, archivedAt: null },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
      prisma.notification.count({
        where: { userId: user.id, read: false, archivedAt: null },
      }),
    ]);

  // Enriquecer cada notificación con su FUENTE (de dónde viene) para que el
  // inbox sea claro tipo correo: título de la tarea / caption del post / marca.
  const nTaskIds = [
    ...new Set(notifications.map((n) => n.taskId).filter(Boolean) as string[]),
  ];
  const nPostIds = [
    ...new Set(notifications.map((n) => n.postId).filter(Boolean) as string[]),
  ];
  const nBrandIds = [
    ...new Set(notifications.map((n) => n.brandId).filter(Boolean) as string[]),
  ];
  const [nTasks, nPosts, nBrands] = await Promise.all([
    nTaskIds.length
      ? prisma.task.findMany({
          where: { id: { in: nTaskIds } },
          select: { id: true, title: true, brand: { select: { name: true } } },
        })
      : Promise.resolve([]),
    nPostIds.length
      ? prisma.post.findMany({
          where: { id: { in: nPostIds } },
          select: {
            id: true,
            number: true,
            caption: true,
            brandId: true,
            brand: { select: { name: true, slug: true } },
          },
        })
      : Promise.resolve([]),
    nBrandIds.length
      ? prisma.brand.findMany({
          where: { id: { in: nBrandIds } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const taskMap = new Map(nTasks.map((t) => [t.id, t]));
  const postMap = new Map(nPosts.map((p) => [p.id, p]));
  const brandMap = new Map(nBrands.map((b) => [b.id, b]));

  type NotifSource = {
    kind: "task" | "post" | "brand";
    title: string;
    context: string | null;
    href: string;
  } | null;

  function resolveSource(n: (typeof notifications)[number]): NotifSource {
    if (n.taskId && taskMap.has(n.taskId)) {
      const t = taskMap.get(n.taskId)!;
      return {
        kind: "task",
        title: t.title,
        context: t.brand?.name ?? null,
        href: `/tasks?open=${n.taskId}`,
      };
    }
    if (n.postId && postMap.has(n.postId)) {
      const p = postMap.get(n.postId)!;
      return {
        kind: "post",
        title: (p.caption?.trim() || "Post sin texto").slice(0, 70),
        context: p.brand?.name ?? null,
        href: `/brands/${p.brand?.slug ?? p.brandId}/posts/${p.number ?? p.id}`,
      };
    }
    if (n.brandId && brandMap.has(n.brandId)) {
      const b = brandMap.get(n.brandId)!;
      return { kind: "brand", title: b.name, context: null, href: `/brands/${b.slug ?? n.brandId}` };
    }
    return null;
  }

  const notifItems = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    body: n.body,
    brandId: n.brandId,
    postId: n.postId,
    taskId: n.taskId,
    actorName: n.actorName,
    actorAvatarUrl: n.actorAvatarUrl,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
    source: resolveSource(n),
  }));

  const empty =
    pendingApproval.length === 0 &&
    changesRequested.length === 0 &&
    readyToPublish.length === 0 &&
    upcoming.length === 0 &&
    recentlyPublished.length === 0 &&
    notifItems.length === 0;

  return (
    <>
      <div className="mx-auto max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Inbox</h1>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Todo lo que necesita tu atención, en un solo lugar.
          </p>
        </div>

        {empty && (
          <div className="card mt-8 flex flex-col items-center gap-2 p-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100">
              <InboxIcon className="h-5 w-5 text-zinc-500" />
            </span>
            <p className="text-[14px] font-semibold text-zinc-900">Todo al día ✨</p>
            <p className="text-[12px] text-zinc-500">
              No tienes nada pendiente. Disfruta el silencio.
            </p>
          </div>
        )}

        <div className="mt-6 space-y-7">
          {notifItems.length > 0 && (
            <InboxNotifications initialItems={notifItems} initialUnread={unreadCount} />
          )}

          {/* Pendientes de aprobación */}
          {pendingApproval.length > 0 && (
            <Section
              title={isAgency ? "Esperando aprobación del cliente" : "Por aprobar"}
              count={pendingApproval.length}
              tint="amber"
              icon={<Clock className="h-3.5 w-3.5" />}
              hint={isAgency ? "Posts que enviaste y aún no se aprueban." : "Tu agencia te está esperando."}
            >
              {pendingApproval.map((p) => (
                <Row
                  key={p.id}
                  href={`/brands/${p.brand.slug ?? p.brandId}/posts/${p.number ?? p.id}`}
                  imageUrl={p.imageUrl}
                  brandName={p.brand.name}
                  caption={p.caption}
                  status={p.status}
                  rightLabel={`hace ${timeAgo(p.updatedAt)}`}
                />
              ))}
            </Section>
          )}

          {/* Cambios solicitados (agencia debe rehacer) */}
          {changesRequested.length > 0 && (
            <Section
              title="Cambios solicitados"
              count={changesRequested.length}
              tint="rose"
              icon={<AlertCircle className="h-3.5 w-3.5" />}
              hint={isAgency ? "Posts donde el cliente pidió correcciones." : "Posts que pediste corregir."}
            >
              {changesRequested.map((p) => {
                const lastApproval = p.approvals[0];
                return (
                  <Row
                    key={p.id}
                    href={`/brands/${p.brand.slug ?? p.brandId}/posts/${p.number ?? p.id}`}
                    imageUrl={p.imageUrl}
                    brandName={p.brand.name}
                    caption={
                      lastApproval?.note
                        ? `"${lastApproval.note}" — ${lastApproval.user.name ?? lastApproval.user.email}`
                        : p.caption
                    }
                    status={p.status}
                    rightLabel={`hace ${timeAgo(p.updatedAt)}`}
                  />
                );
              })}
            </Section>
          )}

          {/* Listos para publicar */}
          {readyToPublish.length > 0 && (
            <Section
              title="Listos para publicar"
              count={readyToPublish.length}
              tint="emerald"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              hint="Aprobados, sin publicar todavía."
            >
              {readyToPublish.map((p) => (
                <Row
                  key={p.id}
                  href={`/brands/${p.brand.slug ?? p.brandId}/posts/${p.number ?? p.id}`}
                  imageUrl={p.imageUrl}
                  brandName={p.brand.name}
                  caption={p.caption}
                  status={p.status}
                  rightLabel={
                    p.scheduledAt && p.scheduledAt < now
                      ? `programado ${formatDateTime(p.scheduledAt)} — vencido`
                      : "publicar ahora"
                  }
                  rightTone={p.scheduledAt && p.scheduledAt < now ? "warn" : "default"}
                />
              ))}
            </Section>
          )}

          {/* Próximos 7 días */}
          {upcoming.length > 0 && (
            <Section
              title="Próximos 7 días"
              count={upcoming.length}
              tint="blue"
              icon={<CalendarClock className="h-3.5 w-3.5" />}
              hint="Programados para publicarse pronto."
            >
              {upcoming.map((p) => (
                <Row
                  key={p.id}
                  href={`/brands/${p.brand.slug ?? p.brandId}/posts/${p.number ?? p.id}`}
                  imageUrl={p.imageUrl}
                  brandName={p.brand.name}
                  caption={p.caption}
                  status={p.status}
                  rightLabel={p.scheduledAt ? formatDateTime(p.scheduledAt) : ""}
                />
              ))}
            </Section>
          )}

          {/* Publicados recientes */}
          {recentlyPublished.length > 0 && (
            <Section
              title="Publicados recientes"
              count={recentlyPublished.length}
              tint="violet"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              hint=""
            >
              {recentlyPublished.map((p) => (
                <Row
                  key={p.id}
                  href={`/brands/${p.brand.slug ?? p.brandId}/posts/${p.number ?? p.id}`}
                  imageUrl={p.imageUrl}
                  brandName={p.brand.name}
                  caption={p.caption}
                  status={p.status}
                  rightLabel={p.publishedAt ? formatDate(p.publishedAt) : ""}
                />
              ))}
              <div className="px-3 py-2 text-center">
                <Link
                  href="/dashboard"
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
                >
                  Ver todos en marcas →
                </Link>
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function timeAgo(d: Date) {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

const TINT_CLASSES: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  emerald: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
  violet: "bg-violet-50 text-violet-700",
};

function Section({
  title,
  count,
  icon,
  tint,
  hint,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  tint: keyof typeof TINT_CLASSES;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-md ${TINT_CLASSES[tint]}`}
          >
            {icon}
          </span>
          <h2 className="text-[13px] font-semibold text-zinc-900">{title}</h2>
          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 tabular-nums">
            {count}
          </span>
        </div>
      </div>
      {hint && <p className="ml-8 text-[11px] text-zinc-500">{hint}</p>}
      <ul className="card mt-2 divide-y divide-zinc-100/80 overflow-hidden">{children}</ul>
    </section>
  );
}

function Row({
  href,
  imageUrl,
  brandName,
  caption,
  status,
  rightLabel,
  rightTone = "default",
}: {
  href: string;
  imageUrl: string | null;
  brandName: string;
  caption: string;
  status: string;
  rightLabel?: string;
  rightTone?: "default" | "warn";
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-zinc-50"
      >
        {imageUrl ? (
          <span className="block h-10 w-10 flex-shrink-0 overflow-hidden rounded-md">
            <MediaThumb url={imageUrl} className="h-full w-full object-cover" showPlayIcon={false} />
          </span>
        ) : (
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 text-[10px] text-zinc-400">
            —
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-zinc-900">{brandName}</p>
          <p className="truncate text-[11.5px] text-zinc-500">
            {caption || "Sin caption"}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[status] ?? "bg-zinc-200"}`}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
          {rightLabel && (
            <span
              className={`text-[10px] tabular-nums ${
                rightTone === "warn" ? "font-semibold text-rose-600" : "text-zinc-500"
              }`}
            >
              {rightLabel}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
