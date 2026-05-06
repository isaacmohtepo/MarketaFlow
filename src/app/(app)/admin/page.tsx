import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasMasterKey } from "@/lib/encryption";

/**
 * Admin → Resumen. Stats globales de MarketaFlow.
 */
export default async function AdminSummary() {
  const [totalAgencies, totalUsers, activeSubs, trialingSubs, totalBrands, masterKeyReady] =
    await Promise.all([
      prisma.agency.count(),
      prisma.user.count(),
      prisma.subscription.count({ where: { status: "active" } }),
      prisma.subscription.count({ where: { status: "trialing" } }),
      prisma.brand.count(),
      hasMasterKey(),
    ]);

  const stats = [
    { label: "Agencias", value: totalAgencies },
    { label: "Usuarios", value: totalUsers },
    { label: "Subs activas", value: activeSubs },
    { label: "En trial", value: trialingSubs },
    { label: "Marcas", value: totalBrands },
  ];

  return (
    <>
      {!masterKeyReady && (
        <Link
          href="/admin/setup"
          className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-rose-50 p-4 transition hover:border-amber-400 hover:shadow-sm"
        >
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-amber-500 text-white shadow-sm">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-zinc-900">
              Setup pendiente: generá la master key
            </p>
            <p className="text-[12px] text-zinc-700">
              Antes de poder configurar pasarelas de pago, necesitás crear la
              llave que las encripta. Es un click.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 flex-shrink-0 text-amber-600" />
        </Link>
      )}
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
    </>
  );
}
