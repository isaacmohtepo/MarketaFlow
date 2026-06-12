import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Building2,
  Users,
  Receipt,
  Activity,
  Layers,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { resolveAgencyRef } from "@/lib/slugs";
import { PLANS, formatCop, type PlanId } from "@/lib/plans";
import { Stat, StatusPill } from "@/components/ui";
import AgencyActions from "./AgencyActions";
import FeatureFlagsPanel from "./FeatureFlagsPanel";
import {
  formatAuditAction,
  formatAuditTime,
  categoryLabel,
  categoryTone,
} from "@/lib/audit-format";

export default async function AdminAgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: agencyRef } = await params;
  // Acepta slug o cuid en la URL admin (back-compat).
  const resolvedAgency = await resolveAgencyRef(agencyRef);
  if (!resolvedAgency) notFound();
  const id = resolvedAgency.id;

  const [agency, subscription, brands, members, invoices, recentAudit] =
    await Promise.all([
      prisma.agency.findUnique({
        where: { id },
        include: {
          _count: {
            select: { brands: true, members: true, invitations: true },
          },
        },
      }),
      prisma.subscription.findUnique({
        where: { agencyId: id },
        include: {
          paymentMethods: { orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.brand.findMany({
        where: { agencyId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { posts: true } } },
      }),
      prisma.membership.findMany({
        where: { agencyId: id },
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
          brand: { select: { id: true, name: true } },
        },
        orderBy: { id: "asc" },
      }),
      prisma.invoice.findMany({
        where: { subscription: { agencyId: id } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.auditLog.findMany({
        where: {
          // Eventos relacionados a la agency: targetId == agencyId, o
          // metadata.agencyId == agencyId (cubre brand.locked, role.*,
          // membership.*, subscription.*, etc.)
          OR: [
            { targetId: id },
            { metadata: { path: ["agencyId"], equals: id } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

  if (!agency) notFound();

  // Lookups para formatear: brand id → name, user id → email/name
  const brandLookup: Record<string, string> = {};
  for (const b of brands) brandLookup[b.id] = b.name;
  const userLookup: Record<string, string> = {};
  for (const m of members) {
    userLookup[m.user.id] = m.user.name ?? m.user.email;
  }

  const plan = PLANS[(subscription?.plan ?? "free") as PlanId] ?? PLANS.free;
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/agencies"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver a agencias
      </Link>

      {/* Hero */}
      <div className="card overflow-hidden">
        <div className="border-b border-zinc-100 bg-gradient-to-br from-fuchsia-50/40 via-white to-amber-50/30 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-white">
                  <Building2 className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold text-zinc-900">
                      {agency.name}
                    </h1>
                    {agency.suspendedAt && (
                      <StatusPill tone="bad" size="sm">
                        Suspendida
                      </StatusPill>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-[10.5px] text-zinc-400">
                    {agency.id}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11.5px] text-zinc-500">
                Creada{" "}
                {agency.createdAt.toLocaleDateString("es", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {agency.suspendedAt && agency.suspendedReason && (
                  <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10.5px] text-rose-700">
                    {agency.suspendedReason}
                  </span>
                )}
              </p>
            </div>

            {subscription && (
              <div className="text-right">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                  Plan
                </p>
                <p className="text-2xl font-bold text-zinc-900">{plan.name}</p>
                <p className="text-2xs text-zinc-500">
                  {subscription.billingCycle === "yearly" ? "Anual" : "Mensual"}
                  {" · "}
                  {formatCop(
                    subscription.billingCycle === "yearly"
                      ? plan.priceCopYearly / 12
                      : plan.priceCopMonthly,
                  )}{" "}
                  /mes
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-zinc-100 sm:grid-cols-5">
          <Stat label="Brands" value={agency._count.brands} className="px-4 py-3" />
          <Stat label="Equipo" value={agency._count.members} className="px-4 py-3" />
          <Stat label="Invitaciones" value={agency._count.invitations} className="px-4 py-3" />
          <Stat
            label="Facturas pagas"
            value={invoices.filter((i) => i.status === "paid").length}
            className="px-4 py-3"
          />
          <Stat label="LTV" value={formatCop(totalPaid)} className="px-4 py-3" />
        </div>
      </div>

      {/* Acciones (subscription + suspend + delete) */}
      <AgencyActions
        agencyId={agency.id}
        agencyName={agency.name}
        suspended={!!agency.suspendedAt}
        suspendedReason={agency.suspendedReason}
        sub={
          subscription
            ? {
                plan: subscription.plan,
                status: subscription.status,
                billingCycle: subscription.billingCycle,
                trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
                currentPeriodEnd:
                  subscription.currentPeriodEnd?.toISOString() ?? null,
                nextChargeAt: subscription.nextChargeAt?.toISOString() ?? null,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              }
            : null
        }
        invoices={invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          amount: i.amount,
          status: i.status,
          paidAt: i.paidAt?.toISOString() ?? null,
          createdAt: i.createdAt.toISOString(),
          wompiTransactionId: i.wompiTransactionId,
        }))}
      />

      {/* Feature flags */}
      <FeatureFlagsPanel agencyId={agency.id} />

      {/* Brands */}
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-900">
            Brands ({brands.length})
          </h2>
        </div>
        {brands.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">No hay brands.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {brands.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-900">
                    {b.name}
                  </p>
                  {b.handle && (
                    <p className="text-2xs text-zinc-500">{b.handle}</p>
                  )}
                </div>
                <span className="text-2xs tabular-nums text-zinc-500">
                  {b._count.posts} posts
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Equipo */}
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-900">
            Equipo ({members.length})
          </h2>
        </div>
        {members.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">No hay miembros.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-zinc-900">
                    {m.user.name ?? m.user.email}
                    <span className="ml-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-zinc-600">
                      {m.role}
                    </span>
                  </p>
                  <p className="text-2xs text-zinc-500">
                    {m.user.email}
                    {m.brand && (
                      <span className="ml-1 text-zinc-400">
                        · scope: {m.brand.name}
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href={`/admin/users/${m.user.id}`}
                  className="rounded-md px-2 py-1 text-2xs font-semibold text-zinc-600 hover:bg-zinc-100"
                >
                  Ver user
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Facturas */}
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <Receipt className="h-3.5 w-3.5 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-900">
            Facturas ({invoices.length})
          </h2>
        </div>
        {invoices.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">Sin facturas todavía.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11.5px] text-zinc-700">
                    {i.invoiceNumber ?? "—"}
                  </p>
                  <p className="text-[10.5px] text-zinc-500">
                    {(i.paidAt ?? i.createdAt).toLocaleDateString("es", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] font-semibold tabular-nums text-zinc-900">
                    {formatCop(i.amount)}
                  </span>
                  <InvoiceStatusBadge status={i.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Audit log */}
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-900">
            Actividad reciente ({recentAudit.length})
          </h2>
        </div>
        <p className="mt-0.5 text-2xs text-zinc-500">
          Eventos del equipo, billing, brands y configuración relacionados
          a esta agencia.
        </p>
        {recentAudit.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">Sin eventos.</p>
        ) : (
          <ol className="mt-3 space-y-2 text-[12px]">
            {recentAudit.map((a) => {
              const text = formatAuditAction(
                {
                  id: a.id,
                  category: a.category,
                  action: a.action,
                  actorEmail: a.actorEmail,
                  targetId: a.targetId,
                  metadata: a.metadata,
                  ip: a.ip,
                  createdAt: a.createdAt,
                },
                { brands: brandLookup, users: userLookup },
              );
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-md border border-zinc-100 bg-white px-3 py-2"
                >
                  <span
                    className={`mt-0.5 flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ${categoryTone(a.category)}`}
                  >
                    {categoryLabel(a.category)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-zinc-800">{text}</p>
                    <p className="mt-0.5 text-[10.5px] text-zinc-500">
                      {formatAuditTime(a.createdAt)}
                      {a.actorEmail && (
                        <>
                          {" · por "}
                          <span className="font-medium text-zinc-700">
                            {a.actorEmail}
                          </span>
                        </>
                      )}
                      {a.ip && (
                        <>
                          {" · "}
                          <span className="font-mono text-3xs">{a.ip}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const tones: Record<string, "good" | "warn" | "bad" | "neutral"> = {
    paid: "good",
    pending: "warn",
    failed: "bad",
    refunded: "neutral",
  };
  const labels: Record<string, string> = {
    paid: "Pagada",
    pending: "Pendiente",
    failed: "Falló",
    refunded: "Reembolsada",
  };
  return (
    <StatusPill tone={tones[status] ?? "neutral"} size="sm">
      {labels[status] ?? status}
    </StatusPill>
  );
}
