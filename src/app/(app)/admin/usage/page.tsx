import { Database, HardDrive, Activity, Mail, AlertTriangle, Image as ImageIcon, FileVideo, Camera, Folder } from "lucide-react";
import { prisma } from "@/lib/db";
import { r2UsageByPrefix, isR2Configured } from "@/lib/storage";

/**
 * Admin → Uso e infraestructura.
 *
 * Dashboard de capacidad real: cuánto storage estamos usando en R2, cuántas
 * rows tiene la DB, y qué tan lejos estamos de los límites de cada tier free.
 * Útil para anticipar cuándo upgradear cada servicio.
 *
 * Fuentes de datos:
 *  - DB counts: prisma directo (instantáneo)
 *  - R2 storage: ListObjectsV2 sumarizado por prefix (uploads/, screenshots/)
 *  - Sentry / Vercel / Upstash: no APIs gratis sin token — links externos.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Límites tier free (referencia para barras de progreso)
const FREE_LIMITS = {
  r2_storage_gb: 10,
  neon_storage_gb: 0.5,
  vercel_function_gb_hours: 100,
  sentry_errors_month: 5_000,
  upstash_commands_day: 10_000,
  resend_emails_month: 3_000,
};

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtN(n: number): string {
  return new Intl.NumberFormat("es").format(n);
}

export default async function AdminUsagePage() {
  // DB stats (Promise.all paralelo — todo en una sola roundtrip lógica)
  const [
    users,
    agencies,
    brands,
    posts,
    comments,
    activity,
    notifications,
    postImages,
    invoices,
    activeSubs,
    postsLast30d,
    commentsLast30d,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.agency.count(),
    prisma.brand.count(),
    prisma.post.count({ where: { deletedAt: null } }),
    prisma.comment.count(),
    prisma.activity.count(),
    prisma.notification.count(),
    prisma.postImage.count(),
    prisma.invoice.count(),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.post.count({
      where: {
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      },
    }),
    prisma.comment.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      },
    }),
  ]);

  // R2 stats — paralelo por prefix
  const [r2Uploads, r2Screenshots] = isR2Configured
    ? await Promise.all([
        r2UsageByPrefix("uploads/"),
        r2UsageByPrefix("screenshots/"),
      ])
    : [{ bytes: 0, count: 0 }, { bytes: 0, count: 0 }];

  const r2TotalBytes = r2Uploads.bytes + r2Screenshots.bytes;
  const r2UsedGB = r2TotalBytes / 1024 ** 3;
  const r2PctOfFree = (r2UsedGB / FREE_LIMITS.r2_storage_gb) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Uso e infraestructura</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Capacidad real consumida y cuánto queda en los tiers free de cada servicio.
        </p>
      </div>

      {/* Totales DB */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-zinc-500">
          <Database className="h-3.5 w-3.5" />
          Base de datos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Usuarios" value={fmtN(users)} />
          <StatCard label="Agencias" value={fmtN(agencies)} hint={`${activeSubs} activas`} />
          <StatCard label="Marcas" value={fmtN(brands)} />
          <StatCard label="Posts" value={fmtN(posts)} hint={`+${postsLast30d} en 30d`} />
          <StatCard label="Comentarios" value={fmtN(comments)} hint={`+${commentsLast30d} en 30d`} />
          <StatCard label="Notificaciones" value={fmtN(notifications)} />
          <StatCard label="Eventos activity" value={fmtN(activity)} />
          <StatCard label="Facturas" value={fmtN(invoices)} />
        </div>
      </section>

      {/* R2 storage */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-zinc-500">
          <HardDrive className="h-3.5 w-3.5" />
          Cloudflare R2 storage
        </h2>
        <div className="card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Usado del tier free
              </p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 tabular-nums">
                {fmtBytes(r2TotalBytes)}
                <span className="ml-2 text-[14px] font-medium text-zinc-400">
                  / {FREE_LIMITS.r2_storage_gb} GB
                </span>
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                r2PctOfFree < 60
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : r2PctOfFree < 85
                    ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                    : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              }`}
            >
              {r2PctOfFree.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full transition-all ${
                r2PctOfFree < 60
                  ? "bg-emerald-500"
                  : r2PctOfFree < 85
                    ? "bg-amber-500"
                    : "bg-rose-500"
              }`}
              style={{ width: `${Math.min(100, r2PctOfFree)}%` }}
            />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/40 p-3">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-blue-50 ring-1 ring-blue-100">
                <Folder className="h-4 w-4 text-blue-600" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  uploads/
                </p>
                <p className="text-[16px] font-bold text-zinc-900 tabular-nums">
                  {fmtBytes(r2Uploads.bytes)}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {fmtN(r2Uploads.count)} archivos · imágenes, videos, PDFs
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/40 p-3">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-fuchsia-50 ring-1 ring-fuchsia-100">
                <Camera className="h-4 w-4 text-fuchsia-600" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  screenshots/
                </p>
                <p className="text-[16px] font-bold text-zinc-900 tabular-nums">
                  {fmtBytes(r2Screenshots.bytes)}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {fmtN(r2Screenshots.count)} capturas de sitios cacheadas
                </p>
              </div>
            </div>
          </div>
          {/* Métrica derivada: imágenes/videos por tipo */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-white p-3 text-[12.5px]">
              <ImageIcon className="h-4 w-4 text-zinc-400" />
              <span className="text-zinc-600">PostImages en DB:</span>
              <span className="ml-auto font-semibold tabular-nums text-zinc-900">
                {fmtN(postImages)}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-white p-3 text-[12.5px]">
              <FileVideo className="h-4 w-4 text-zinc-400" />
              <span className="text-zinc-600">Promedio por upload:</span>
              <span className="ml-auto font-semibold tabular-nums text-zinc-900">
                {r2Uploads.count > 0
                  ? fmtBytes(r2Uploads.bytes / r2Uploads.count)
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Servicios externos — links porque no tienen API gratis sin token */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-zinc-500">
          <Activity className="h-3.5 w-3.5" />
          Servicios externos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ExternalRow
            name="Neon Postgres"
            tier="Free"
            limit="0.5 GB storage · 190 compute hours/mes"
            href="https://console.neon.tech"
            note="Storage actual visible en su dashboard. Auto-suspend cuando no hay queries activas."
          />
          <ExternalRow
            name="Vercel"
            tier="Hobby"
            limit="100 GB-hours funciones · 1M invocations/mes"
            href="https://vercel.com/dashboard/usage"
            note="Cada screenshot nuevo ≈ 0.085 GB-hours. Después de cacheado = costo 0."
          />
          <ExternalRow
            name="Sentry"
            tier="Developer"
            limit={`${fmtN(FREE_LIMITS.sentry_errors_month)} errores/mes`}
            href="https://sentry.io/organizations/marketaflow/stats/"
            note="Si pasamos 5k errores, upgrade a Team ($26/mes)."
          />
          <ExternalRow
            name="Upstash Redis"
            tier="Free"
            limit={`${fmtN(FREE_LIMITS.upstash_commands_day)} commands/día`}
            href="https://console.upstash.com"
            note="Rate limiting distribuido. Cada request a la app ≈ 1-2 commands."
          />
          <ExternalRow
            name="Resend"
            tier="Free"
            limit={`${fmtN(FREE_LIMITS.resend_emails_month)} emails/mes`}
            href="https://resend.com/emails"
            note="Notifs por mail + magic links + facturas. Upgrade a Pro $20/mes a 3k/mes."
          />
          <ExternalRow
            name="Cloudflare R2"
            tier="Free"
            limit={`${FREE_LIMITS.r2_storage_gb} GB storage · egress ilimitado`}
            href="https://dash.cloudflare.com/?to=/:account/r2/buckets"
            note="Egress siempre gratis — esa es la magia de R2 vs S3."
          />
        </div>
      </section>

      {/* Alertas si algo se está acercando al límite */}
      {r2PctOfFree > 75 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-[13px] font-bold text-amber-900">
              R2 storage al {r2PctOfFree.toFixed(0)}% del tier free
            </p>
            <p className="mt-1 text-[12px] text-amber-800">
              Cuando pases 10 GB, el costo es $0.015/GB/mes (ej: 50 GB = $0.75/mes). Sigue muy barato.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-bold text-zinc-900 tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

function ExternalRow({
  name,
  tier,
  limit,
  href,
  note,
}: {
  name: string;
  tier: string;
  limit: string;
  href: string;
  note: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="card group flex flex-col gap-1.5 p-4 transition hover:border-zinc-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13.5px] font-bold text-zinc-900">{name}</p>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          {tier}
        </span>
      </div>
      <p className="text-[11.5px] font-medium text-zinc-700">{limit}</p>
      <p className="text-[11px] text-zinc-500">{note}</p>
      <span className="mt-1 text-[10.5px] font-semibold text-fuchsia-600 group-hover:underline">
        Ver dashboard →
      </span>
    </a>
  );
}
