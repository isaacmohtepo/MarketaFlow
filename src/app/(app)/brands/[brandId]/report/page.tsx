import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Calendar as CalIcon, CheckCircle2, AlertCircle, Send, MessageSquare, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import PrintButton from "./PrintButton";
import { ApprovalDonut, PublishedChart } from "./ReportCharts";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function parseYM(s: string | undefined): { year: number; month: number } {
  if (s) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(s);
    if (m) return { year: Number(m[1]), month: Number(m[2]) - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export default async function BrandReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { brandId } = await params;
  const sp = await searchParams;
  const { year, month } = parseYM(sp.month);

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await getBrandAccess(user.id, brandId);
  if (!access) notFound();

  const brand = await prisma.brand.findUnique({
    where: { id: access.brandId },
    include: { agency: true },
  });
  if (!brand) notFound();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const prevYM = `${month === 0 ? year - 1 : year}-${String(month === 0 ? 12 : month).padStart(2, "0")}`;
  const nextYM = `${month === 11 ? year + 1 : year}-${String(month === 11 ? 1 : month + 2).padStart(2, "0")}`;

  const dateRange = { gte: monthStart, lt: monthEnd };

  const [
    publishedPosts,
    inReviewPosts,
    scheduledPosts,
    approvalsThisMonth,
    commentsCount,
    approvalsForAvg,
  ] = await Promise.all([
    prisma.post.findMany({
      where: { brandId: access.brandId, deletedAt: null, publishedAt: dateRange },
      orderBy: { publishedAt: "asc" },
    }),
    prisma.post.findMany({
      where: { brandId: access.brandId, deletedAt: null, status: "in_review", updatedAt: dateRange },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.post.findMany({
      where: {
        brandId: access.brandId,
        deletedAt: null,
        status: { in: ["scheduled", "approved"] },
        scheduledAt: dateRange,
        publishedAt: null,
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.approval.findMany({
      where: { post: { brandId: access.brandId }, createdAt: dateRange },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.comment.count({
      where: {
        post: { brandId: access.brandId },
        createdAt: dateRange,
        parentId: null,
        ...(access.role === "client" ? { internal: false } : {}),
      },
    }),
    prisma.approval.findMany({
      where: { decision: "approved", createdAt: dateRange, post: { brandId: access.brandId } },
      select: { createdAt: true, post: { select: { createdAt: true } } },
    }),
  ]);

  const approvedDecisions = approvalsThisMonth.filter((a) => a.decision === "approved").length;
  const changesDecisions = approvalsThisMonth.filter((a) => a.decision !== "approved").length;
  const totalDecisions = approvalsThisMonth.length;
  const approvalRate =
    totalDecisions > 0 ? Math.round((approvedDecisions / totalDecisions) * 100) : null;

  const avgHours =
    approvalsForAvg.length > 0
      ? approvalsForAvg.reduce(
          (acc, a) => acc + (a.createdAt.getTime() - a.post.createdAt.getTime()),
          0,
        ) /
        approvalsForAvg.length /
        (1000 * 60 * 60)
      : null;

  const changesNotes = approvalsThisMonth
    .filter((a) => a.decision !== "approved" && a.note)
    .slice(0, 6);

  // Datos para gráfico: publicaciones por día del mes
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const publishedByDay = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    count: 0,
  }));
  for (const p of publishedPosts) {
    if (!p.publishedAt) continue;
    const d = p.publishedAt.getDate();
    if (d >= 1 && d <= daysInMonth) {
      publishedByDay[d - 1].count++;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Link
            href={`/brands/${brandId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Volver a la marca
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={`/brands/${brandId}/report?month=${prevYM}`}
              className="rounded-lg border divider bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
            >
              ← Mes anterior
            </Link>
            <Link
              href={`/brands/${brandId}/report?month=${nextYM}`}
              className="rounded-lg border divider bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Mes siguiente →
            </Link>
            <PrintButton />
          </div>
        </div>

        {/* Documento imprimible */}
        <article className="mt-6 rounded-2xl bg-white p-8 shadow-sm print:mt-0 print:rounded-none print:p-0 print:shadow-none">
          {/* Encabezado */}
          <header className="flex items-start justify-between gap-4 border-b divider pb-6">
            <div className="flex items-center gap-4">
              <span
                className="grid h-14 w-14 flex-shrink-0 place-items-center overflow-hidden rounded-xl text-lg font-bold text-white"
                style={{ background: brand.color ?? "#8a2be2" }}
              >
                {brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  brand.name[0]?.toUpperCase()
                )}
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  Reporte mensual
                </p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900">
                  {brand.name}
                </h1>
                <p className="text-[12px] text-zinc-500">{monthLabel}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Por
              </p>
              <p className="mt-0.5 text-[13px] font-semibold text-zinc-900">{brand.agency.name}</p>
              <p className="text-[10px] text-zinc-500">
                Generado el {new Date().toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          </header>

          {/* KPIs */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              icon={<Send className="h-3.5 w-3.5" />}
              label="Publicados"
              value={String(publishedPosts.length)}
              tint="emerald"
            />
            <KpiCard
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Tasa aprob."
              value={approvalRate !== null ? `${approvalRate}%` : "—"}
              tint="fuchsia"
            />
            <KpiCard
              icon={<CalIcon className="h-3.5 w-3.5" />}
              label="Tiempo prom."
              value={avgHours !== null ? formatHours(avgHours) : "—"}
              tint="blue"
            />
            <KpiCard
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Comentarios"
              value={String(commentsCount)}
              tint="amber"
            />
          </section>

          <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Aprobaciones"
              value={String(approvedDecisions)}
              tint="emerald"
              subtle
            />
            <KpiCard
              icon={<AlertCircle className="h-3.5 w-3.5" />}
              label="Cambios pedidos"
              value={String(changesDecisions)}
              tint="rose"
              subtle
            />
            <KpiCard
              icon={<CalIcon className="h-3.5 w-3.5" />}
              label="Programados"
              value={String(scheduledPosts.length)}
              tint="blue"
              subtle
            />
          </section>

          {/* Gráficos */}
          {(publishedPosts.length > 0 || totalDecisions > 0) && (
            <section className="mt-6 grid gap-3 sm:grid-cols-2">
              <PublishedChart data={publishedByDay} brandColor={brand.color ?? "#8a2be2"} />
              <ApprovalDonut approved={approvedDecisions} changes={changesDecisions} />
            </section>
          )}

          {/* Publicados — grid de thumbnails */}
          {publishedPosts.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Publicados ({publishedPosts.length})
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {publishedPosts.map((p) => (
                  <div
                    key={p.id}
                    className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-zinc-200"
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 text-xs text-zinc-400">
                        —
                      </span>
                    )}
                    <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white">
                      {p.publishedAt ? fmtDate(p.publishedAt) : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Programados */}
          {scheduledPosts.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Programados durante el mes ({scheduledPosts.length})
              </h2>
              <ul className="mt-3 divide-y divide-zinc-100/80 rounded-xl ring-1 ring-zinc-200">
                {scheduledPosts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-2.5">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-9 w-9 flex-shrink-0 rounded bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-zinc-900">
                        {p.caption || "Sin caption"}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {p.scheduledAt ? fmtDate(p.scheduledAt) : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Notas de cambios solicitados */}
          {changesNotes.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Cambios solicitados
              </h2>
              <ul className="mt-3 space-y-2">
                {changesNotes.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg bg-rose-50 p-3 text-[12px] text-rose-900 ring-1 ring-rose-100"
                  >
                    <p className="italic">"{a.note}"</p>
                    <p className="mt-1 text-[10px] text-rose-700/70">
                      — {a.user.name ?? a.user.email} · {fmtDate(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* En revisión al cierre */}
          {inReviewPosts.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Quedaron en revisión ({inReviewPosts.length})
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                Posts que recibieron movimiento durante el mes y siguen esperando aprobación.
              </p>
            </section>
          )}

          {/* Estado vacío */}
          {publishedPosts.length === 0 &&
            scheduledPosts.length === 0 &&
            totalDecisions === 0 &&
            commentsCount === 0 && (
              <section className="mt-10 rounded-xl bg-zinc-50 p-8 text-center text-[12px] text-zinc-500">
                Sin actividad registrada para {monthLabel}.
              </section>
            )}

          {/* Footer */}
          <footer className="mt-10 border-t divider pt-4 text-center text-[10px] text-zinc-400">
            MarketaFlow · {brand.agency.name} · {monthLabel}
          </footer>
        </article>
      </div>
    </div>
  );
}

const TINT_BG: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700",
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
};

function KpiCard({
  icon,
  label,
  value,
  tint,
  subtle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: keyof typeof TINT_BG;
  subtle?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${
        subtle ? "border-zinc-200/70 bg-zinc-50/60" : "border-zinc-200 bg-white"
      } p-3`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`grid h-5 w-5 place-items-center rounded-md ${TINT_BG[tint]}`}>
          {icon}
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </p>
      </div>
      <p className={`mt-1.5 ${subtle ? "text-[18px]" : "text-[22px]"} font-bold tabular-nums tracking-tight text-zinc-900`}>
        {value}
      </p>
    </div>
  );
}
