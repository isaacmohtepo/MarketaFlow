import Link from "next/link";
import { redirect } from "next/navigation";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  Sparkles,
  Users,
  BarChart3,
  Heart,
  MessageCircle,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listUserBrands } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getKpisForBrands } from "@/lib/kpis";
import BarChart from "@/components/admin/BarChart";
import MetricsFilters from "./MetricsFilters";

/**
 * Métricas del lado del usuario (agency owner / editor). Diferente de
 * /admin/metrics que es plataforma-global. Acá solo ve datos de SUS marcas.
 */
export const dynamic = "force-dynamic";

export default async function UserMetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; days?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const brands = await listUserBrands(user.id);
  if (brands.length === 0) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-3 text-[14px] font-semibold text-zinc-900">
          Sin marcas todavía
        </p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Creá una marca para empezar a ver métricas.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const brandFilter = sp.brand;
  const daysParam = parseInt(sp.days ?? "30", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;

  const brandIds = brandFilter
    ? brands.filter((b) => b.id === brandFilter).map((b) => b.id)
    : brands.map((b) => b.id);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    posts,
    publishedRecent,
    approvalsRecent,
    commentsRecent,
    avgApprovalTime,
    kpis,
  ] = await Promise.all([
    prisma.post.findMany({
      where: {
        brandId: { in: brandIds },
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        publishedAt: true,
        publishedUrl: true,
        caption: true,
        imageUrl: true,
        brandId: true,
        igMediaId: true,
        insights: true,
        brand: { select: { name: true, color: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.post.count({
      where: {
        brandId: { in: brandIds },
        publishedAt: { gte: since },
        deletedAt: null,
      },
    }),
    prisma.approval.count({
      where: {
        post: { brandId: { in: brandIds } },
        decision: "approved",
        createdAt: { gte: since },
      },
    }),
    prisma.comment.count({
      where: {
        post: { brandId: { in: brandIds } },
        createdAt: { gte: since },
      },
    }),
    // Tiempo promedio entre creación y aprobación (last N posts)
    prisma.$queryRaw<{ avg_hours: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (a."createdAt" - p."createdAt")) / 3600)::float as avg_hours
      FROM "Post" p
      JOIN "Approval" a ON a."postId" = p.id AND a.decision = 'approved'
      WHERE p."brandId" = ANY(${brandIds}::text[])
        AND p."createdAt" >= ${since}
        AND p."deletedAt" IS NULL
    `,
    getKpisForBrands(brandIds),
  ]);

  const avgHours = avgApprovalTime[0]?.avg_hours ?? null;

  // Aggregate IG insights across published posts
  let totalLikes = 0;
  let totalComments = 0;
  let totalReach = 0;
  let postsWithInsights = 0;
  for (const p of posts) {
    if (p.publishedAt && p.insights) {
      const ins = p.insights as Record<string, number>;
      if (typeof ins.likes === "number") totalLikes += ins.likes;
      if (typeof ins.comments === "number") totalComments += ins.comments;
      if (typeof ins.reach === "number") totalReach += ins.reach;
      postsWithInsights++;
    }
  }

  // Posts por día last N
  const postsByDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    postsByDay.set(key, 0);
  }
  for (const p of posts) {
    const k = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}-${String(p.createdAt.getDate()).padStart(2, "0")}`;
    if (postsByDay.has(k)) postsByDay.set(k, (postsByDay.get(k) ?? 0) + 1);
  }
  const postsChartData = Array.from(postsByDay.entries()).map(([day, count]) => ({
    label: day.slice(5),
    value: count,
  }));

  // Status breakdown for status chart
  const statusCounts: Record<string, number> = {
    draft: 0,
    in_review: 0,
    changes_requested: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
  };
  for (const p of posts) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
  }
  const statusChartData = Object.entries(statusCounts).map(([s, c]) => ({
    label: s.replace("_", " "),
    value: c,
  }));

  // Top 5 posts publicados por engagement (likes + comments)
  const topPosts = posts
    .filter((p) => p.publishedAt && p.insights)
    .map((p) => {
      const ins = (p.insights as Record<string, number>) ?? {};
      const engagement = (ins.likes ?? 0) + (ins.comments ?? 0);
      return { ...p, ins, engagement };
    })
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Métricas</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Performance de tus marcas — flujo de aprobación + engagement de IG.
          </p>
        </div>
        <MetricsFilters
          brands={brands.map((b) => ({ id: b.id, name: b.name }))}
          brandFilter={brandFilter ?? null}
          days={days}
        />
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Posts publicados"
          value={String(publishedRecent)}
          subtitle={`Últimos ${days} días`}
        />
        <Kpi
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Aprobaciones"
          value={String(approvalsRecent)}
          subtitle={(() => {
            let totalDec = 0;
            let approvedDec = 0;
            for (const k of kpis.values()) {
              totalDec += k.totalDecisions ?? 0;
              approvedDec += k.approvedDecisions ?? 0;
            }
            return totalDec > 0
              ? `${Math.round((approvedDec / totalDec) * 100)}% approval rate`
              : "—";
          })()}
        />
        <Kpi
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Tiempo promedio aprobación"
          value={
            avgHours != null
              ? avgHours < 24
                ? `${avgHours.toFixed(1)}h`
                : `${(avgHours / 24).toFixed(1)}d`
              : "—"
          }
          subtitle="Desde creación a aprobado"
        />
        <Kpi
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label="Comentarios internos"
          value={String(commentsRecent)}
          subtitle={`Últimos ${days} días`}
        />
      </div>

      {/* IG engagement KPIs (si hay insights) */}
      {postsWithInsights > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi
            icon={<Heart className="h-3.5 w-3.5" />}
            label="Likes totales"
            value={totalLikes.toLocaleString("es")}
            subtitle={`En ${postsWithInsights} posts publicados`}
            tone="primary"
          />
          <Kpi
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            label="Comments en IG"
            value={totalComments.toLocaleString("es")}
            subtitle={`Avg ${(totalComments / Math.max(1, postsWithInsights)).toFixed(1)}/post`}
            tone="primary"
          />
          <Kpi
            icon={<Users className="h-3.5 w-3.5" />}
            label="Alcance acumulado"
            value={totalReach.toLocaleString("es")}
            subtitle="Cuentas únicas"
            tone="primary"
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={`Posts creados — últimos ${days} días`}
          subtitle="Volumen de creación en el período"
        >
          <BarChart
            data={postsChartData}
            format={(n) => `${n} ${n === 1 ? "post" : "posts"}`}
            emptyLabel="Sin posts en el período"
          />
        </ChartCard>

        <ChartCard
          title="Estado actual de los posts"
          subtitle="Distribución por status (todos los tiempos)"
        >
          <BarChart
            data={statusChartData}
            format={(n) => `${n}`}
            emptyLabel="Sin posts"
          />
        </ChartCard>
      </div>

      {/* Top posts */}
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-fuchsia-600" />
          <h2 className="text-sm font-semibold text-zinc-900">
            Top posts por engagement (IG)
          </h2>
        </div>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Solo aparecen posts publicados en Instagram con insights cacheados.
          Los insights se refrescan automático cuando abrís el detalle del post.
        </p>
        {topPosts.length === 0 ? (
          <p className="mt-4 text-[12px] text-zinc-500">
            Aún no hay posts publicados con insights. Conectá Instagram en
            Settings → Instagram para que se traigan automático.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {topPosts.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600">
                    {i + 1}
                  </span>
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-10 w-10 flex-shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <Link
                      href={`/brands/${p.brandId}/posts/${p.id}`}
                      className="block truncate text-[13px] font-medium text-zinc-900 hover:underline"
                    >
                      {p.caption?.split("\n")[0]?.slice(0, 60) ||
                        "(sin caption)"}
                    </Link>
                    <p className="text-[10.5px] text-zinc-500">
                      {p.brand.name} ·{" "}
                      {p.publishedAt?.toLocaleDateString("es", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3 text-[11px] text-zinc-600">
                  <span className="inline-flex items-center gap-0.5">
                    <Heart className="h-3 w-3" />
                    {(p.ins.likes ?? 0).toLocaleString("es")}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <MessageCircle className="h-3 w-3" />
                    {(p.ins.comments ?? 0).toLocaleString("es")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone?: "primary";
}) {
  return (
    <div
      className={`card p-4 ${tone === "primary" ? "ring-1 ring-fuchsia-200 bg-gradient-to-br from-white to-fuchsia-50/30" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
        <span className="grid h-5 w-5 place-items-center rounded bg-zinc-100 text-zinc-500">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900">
        {value}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}
