import { prisma } from "@/lib/db";

/**
 * Admin → Resumen. Stats globales de MarketaFlow.
 */
export default async function AdminSummary() {
  const [totalAgencies, totalUsers, activeSubs, trialingSubs, totalBrands] =
    await Promise.all([
      prisma.agency.count(),
      prisma.user.count(),
      prisma.subscription.count({ where: { status: "active" } }),
      prisma.subscription.count({ where: { status: "trialing" } }),
      prisma.brand.count(),
    ]);

  const stats = [
    { label: "Agencias", value: totalAgencies },
    { label: "Usuarios", value: totalUsers },
    { label: "Subs activas", value: activeSubs },
    { label: "En trial", value: trialingSubs },
    { label: "Marcas", value: totalBrands },
  ];

  return (
    <section className="card p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Resumen</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Snapshot del estado actual de la plataforma.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3 md:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
              {s.label}
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-zinc-900">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
