import Link from "next/link";
import {
  ArrowRight,
  KeyRound,
  TrendingUp,
  Users,
  Building2,
  Sparkles,
  AlertTriangle,
  CreditCard,
  Activity,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { hasMasterKey } from "@/lib/encryption";
import { formatCop } from "@/lib/plans";
import {
  currentMrrCents,
  mrrSeries,
  signupsSeries,
  topAgenciesByRevenue,
  trialConversion,
  churnRate,
} from "@/lib/metrics";
import AreaChart from "@/components/admin/AreaChart";
import BarChart from "@/components/admin/BarChart";
import { PageHeader, Stat } from "@/components/ui";

/**
 * Admin → Dashboard. KPIs, charts (MRR + signups), top agencies, recent
 * activity, alertas operativas (master key, integraciones, etc).
 */
export default async function AdminSummary() {
  const [
    totalAgencies,
    totalUsers,
    activeSubs,
    trialingSubs,
    pastDueSubs,
    totalBrands,
    masterKeyReady,
    mrr,
    mrr12,
    signups30,
    topAgencies,
    conversion,
    churn,
    recentAudit,
    integrationsCount,
    suspendedAgencies,
    disabledUsers,
  ] = await Promise.all([
    prisma.agency.count(),
    prisma.user.count(),
    prisma.subscription.count({
      where: { status: "active", plan: { not: "free" } },
    }),
    prisma.subscription.count({ where: { status: "trialing" } }),
    prisma.subscription.count({ where: { status: "past_due" } }),
    prisma.brand.count(),
    hasMasterKey(),
    currentMrrCents(),
    mrrSeries(12),
    signupsSeries(30),
    topAgenciesByRevenue(8),
    trialConversion(90),
    churnRate(30),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.integrationConfig.count({ where: { enabled: true } }),
    prisma.agency.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
  ]);

  const arr = mrr * 12;
  const mrrChartData = mrr12.map((m) => ({
    label: monthLabel(m.month),
    value: m.cents,
  }));
  const signupsChartData = signups30.map((s) => ({
    label: dayLabel(s.day),
    value: s.count,
  }));

  // MRR delta vs mes anterior
  const mrrThis = mrr12[mrr12.length - 1]?.cents ?? 0;
  const mrrPrev = mrr12[mrr12.length - 2]?.cents ?? 0;
  const mrrDelta = mrrPrev > 0 ? (mrrThis - mrrPrev) / mrrPrev : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumen"
        subtitle="Pulso de la plataforma en tiempo real."
      />

      {/* Alertas operativas */}
      <div className="space-y-2">
        {!masterKeyReady && (
          <Alert
            tone="amber"
            href="/admin/setup"
            icon={<KeyRound className="h-4 w-4" />}
            title="Setup pendiente: master key"
            body="Antes de poder configurar pasarelas de pago necesitas generar la llave que las encripta. 1 click."
          />
        )}
        {pastDueSubs > 0 && (
          <Alert
            tone="rose"
            href="/admin/agencies?status=past_due"
            icon={<AlertTriangle className="h-4 w-4" />}
            title={`${pastDueSubs} ${pastDueSubs === 1 ? "subscripción vencida" : "subscripciones vencidas"}`}
            body="Pagos fallidos sin resolver — revisalas para no perderlas a Free."
          />
        )}
        {integrationsCount === 0 && masterKeyReady && (
          <Alert
            tone="amber"
            href="/admin/integrations"
            icon={<CreditCard className="h-4 w-4" />}
            title="Sin pasarelas activas"
            body="Configura Wompi (u otra) para que los clientes puedan pagar."
          />
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="MRR"
          value={formatCop(mrr)}
          subtitle={`ARR ${formatCop(arr)}`}
          delta={mrrDelta}
          tone="primary"
        />
        <Kpi
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Agencias activas"
          value={String(activeSubs)}
          subtitle={`${trialingSubs} trial · ${Math.max(0, totalAgencies - activeSubs - trialingSubs)} free/inactivas · ${totalAgencies} total`}
        />
        <Kpi
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Conversión trial→paid"
          value={`${(conversion.rate * 100).toFixed(1)}%`}
          subtitle={`${conversion.trialsConverted} de ${conversion.trialsStarted} (90d)`}
        />
        <Kpi
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Churn (30d)"
          value={`${(churn.rate * 100).toFixed(1)}%`}
          subtitle={`${churn.canceled} cancelaciones`}
          tone={churn.rate > 0.05 ? "danger" : "default"}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="MRR — últimos 12 meses"
          subtitle="Revenue mensualizado de invoices pagas (prorrateado por período)"
        >
          <AreaChart
            data={mrrChartData}
            format={(n) => formatCop(n)}
            emptyLabel="Aún no hay revenue"
          />
          <ChartLegend
            data={mrr12.map((m) => ({
              label: monthLabel(m.month),
              hint: formatCop(m.cents),
            }))}
            spread={3}
          />
        </ChartCard>

        <ChartCard
          title="Signups — últimos 30 días"
          subtitle="Nuevos usuarios registrados por día"
        >
          <BarChart
            data={signupsChartData}
            format={(n) => `${n} ${n === 1 ? "signup" : "signups"}`}
            emptyLabel="Sin signups en 30d"
          />
          <ChartLegend
            data={signups30.map((s) => ({
              label: dayLabel(s.day),
              hint: String(s.count),
            }))}
            spread={6}
          />
        </ChartCard>
      </div>

      {/* Stats secundarias */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Usuarios" value={totalUsers.toLocaleString("es")} />
          <Stat label="Brands" value={totalBrands.toLocaleString("es")} />
          <Stat
            label="Suspendidas"
            value={suspendedAgencies.toLocaleString("es")}
            tone={suspendedAgencies > 0 ? "bad" : undefined}
          />
          <Stat
            label="Users disabled"
            value={disabledUsers.toLocaleString("es")}
            tone={disabledUsers > 0 ? "bad" : undefined}
          />
          <Stat label="Pasarelas on" value={integrationsCount.toLocaleString("es")} />
        </div>
      </div>

      {/* Top agencies */}
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Top agencias por revenue
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Los que más han pagado en total (LTV).
            </p>
          </div>
          <Link
            href="/admin/agencies"
            className="text-[12px] font-semibold text-zinc-600 hover:text-zinc-900"
          >
            Ver todas →
          </Link>
        </div>
        {topAgencies.length === 0 ? (
          <p className="mt-4 text-[12px] text-zinc-500">
            Aún no hay revenue de ninguna agencia.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {topAgencies.map((a, i) => (
              <li
                key={a.agencyId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-zinc-100 text-2xs font-bold text-zinc-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/admin/agencies/${a.agencyId}`}
                      className="text-[13px] font-semibold text-zinc-900 hover:underline"
                    >
                      {a.name}
                    </Link>
                    <p className="text-2xs text-zinc-500">
                      {a.invoicesPaid}{" "}
                      {a.invoicesPaid === 1 ? "factura" : "facturas"} ·{" "}
                      {a.plan ?? "free"}
                    </p>
                  </div>
                </div>
                <p className="text-[13px] font-bold tabular-nums text-emerald-700">
                  {formatCop(a.totalCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent activity */}
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Actividad reciente
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Eventos del audit log de toda la plataforma.
            </p>
          </div>
          <Link
            href="/admin/audit-log"
            className="text-[12px] font-semibold text-zinc-600 hover:text-zinc-900"
          >
            Ver completo →
          </Link>
        </div>
        {recentAudit.length === 0 ? (
          <p className="mt-4 text-[12px] text-zinc-500">Sin eventos.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {recentAudit.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-md border border-zinc-100 bg-zinc-50/40 px-3 py-2"
              >
                <CategoryDot category={a.category} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-zinc-800">
                    <strong>{a.action}</strong>
                    {a.actorEmail && (
                      <span className="text-zinc-500"> · {a.actorEmail}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-zinc-500">
                    {a.createdAt.toLocaleString("es", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {a.ip && (
                      <>
                        {" · "}
                        <span className="font-mono">{a.ip}</span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

function dayLabel(yyyymmdd: string): string {
  const [, m, d] = yyyymmdd.split("-");
  return `${d}/${m}`;
}

// ============================================================================
// Subcomponentes
// ============================================================================

function Alert({
  tone,
  href,
  icon,
  title,
  body,
}: {
  tone: "amber" | "rose";
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const map = {
    amber:
      "border-amber-300 from-amber-50 to-rose-50 hover:border-amber-400 [&_.icon]:bg-amber-500 [&_.arrow]:text-amber-600",
    rose: "border-rose-300 from-rose-50 to-fuchsia-50 hover:border-rose-400 [&_.icon]:bg-rose-500 [&_.arrow]:text-rose-600",
  } as const;
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl border bg-gradient-to-r p-4 transition hover:shadow-sm ${map[tone]}`}
    >
      <span className="icon grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl text-white shadow-sm">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-zinc-900">{title}</p>
        <p className="text-[12px] text-zinc-700">{body}</p>
      </div>
      <ArrowRight className="arrow h-5 w-5 flex-shrink-0" />
    </Link>
  );
}

function Kpi({
  icon,
  label,
  value,
  subtitle,
  delta,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  delta?: number;
  tone?: "default" | "primary" | "danger";
}) {
  const ring =
    tone === "primary"
      ? "ring-1 ring-fuchsia-200 bg-gradient-to-br from-white to-fuchsia-50/30"
      : tone === "danger"
        ? "ring-1 ring-rose-200 bg-rose-50/30"
        : "";
  return (
    <div className={`card p-4 ${ring}`}>
      <div className="flex items-center gap-1.5 text-3xs font-bold uppercase tracking-wider text-zinc-400">
        <span className="grid h-5 w-5 place-items-center rounded bg-zinc-100 text-zinc-500">
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums text-zinc-900">{value}</p>
        {delta !== undefined && Number.isFinite(delta) && delta !== 0 && (
          <span
            className={`text-2xs font-semibold tabular-nums ${
              delta > 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && <p className="mt-0.5 text-2xs text-zinc-500">{subtitle}</p>}
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
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-2xs text-zinc-500">{subtitle}</p>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChartLegend({
  data,
  spread = 4,
}: {
  data: { label: string; hint: string }[];
  spread?: number;
}) {
  // Mostramos N puntos equiespaciados como labels x-axis
  const n = data.length;
  if (n === 0) return null;
  const step = Math.max(1, Math.floor(n / spread));
  const visible: { i: number; label: string }[] = [];
  for (let i = 0; i < n; i += step) {
    visible.push({ i, label: data[i].label });
  }
  // Asegurar último
  if (visible[visible.length - 1].i !== n - 1) {
    visible.push({ i: n - 1, label: data[n - 1].label });
  }
  return (
    <div className="mt-2 flex justify-between text-3xs text-zinc-400">
      {visible.map((v) => (
        <span key={v.i}>{v.label}</span>
      ))}
    </div>
  );
}

function CategoryDot({ category }: { category: string }) {
  const map: Record<string, string> = {
    auth: "bg-blue-100 text-blue-700",
    billing: "bg-emerald-100 text-emerald-700",
    integrations: "bg-fuchsia-100 text-fuchsia-700",
    admin: "bg-amber-100 text-amber-700",
    team: "bg-violet-100 text-violet-700",
  };
  return (
    <span
      className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
        map[category] ?? "bg-zinc-100 text-zinc-600"
      }`}
    >
      {category}
    </span>
  );
}
