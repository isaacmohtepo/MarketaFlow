"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { PLANS_LIST, formatCop, type Plan } from "@/lib/plans";

/**
 * Tabla pública de pricing con toggle Mensual/Anual. Se usa en la landing
 * y en /pricing. Los precios se formatean en COP con el helper canónico.
 */
export default function PricingTable() {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  return (
    <div>
      {/* Toggle Mensual / Anual */}
      <div className="mb-7 flex items-center justify-center">
        <div className="inline-flex items-center gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition ${
              cycle === "monthly"
                ? "bg-white text-zinc-900 shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setCycle("yearly")}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold transition ${
              cycle === "yearly"
                ? "bg-white text-zinc-900 shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Anual
            <span className="rounded-full bg-emerald-500/20 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-emerald-400">
              −20%
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS_LIST.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cycle={cycle} />
        ))}
      </div>

      <p className="mt-6 text-center text-[12px] text-zinc-500">
        Precios en pesos colombianos. Cobramos via Wompi (PSE, Nequi, tarjeta).
        Puedes cancelar en cualquier momento.
      </p>
    </div>
  );
}

function PlanCard({ plan, cycle }: { plan: Plan; cycle: "monthly" | "yearly" }) {
  const isFree = plan.priceCopMonthly === 0;
  const priceCents =
    cycle === "yearly" ? plan.priceCopYearly : plan.priceCopMonthly;
  // Mostramos siempre el precio "por mes" para comparación clara, aunque
  // facturemos anual. Anual / 12 = equivalente mensual.
  const displayCents = cycle === "yearly" ? priceCents / 12 : priceCents;
  const formatted = formatCop(displayCents);
  const note =
    cycle === "yearly"
      ? `/mes · ${formatCop(priceCents)} al año`
      : "/mes";

  return (
    <div
      className={`relative flex flex-col rounded-3xl p-7 transition ${
        plan.highlight
          ? "border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-900 to-fuchsia-950/40 shadow-2xl"
          : "card hover:-translate-y-1 hover:border-white/15"
      }`}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full brand-gradient px-3.5 py-1 text-3xs font-bold uppercase tracking-widest text-white shadow-lg">
          Más popular
        </span>
      )}
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500">
          {plan.name}
        </h3>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-5xl font-bold tracking-tight text-white">
            {isFree ? "$0" : formatted}
          </span>
          {!isFree && <span className="text-sm text-zinc-500">{note}</span>}
        </div>
        {!isFree && (
          <p className="mt-1 text-2xs text-zinc-500">
            ≈ ${plan.priceUsdMonthly} USD/mes
          </p>
        )}
        <p className="mt-3 text-[14px] text-zinc-400">{plan.tagline}</p>
      </div>

      <ul className="mt-7 flex-1 space-y-2.5 text-[14px]">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-fuchsia-500/20">
              <Check className="h-2.5 w-2.5 text-fuchsia-400" strokeWidth={3.5} />
            </span>
            <span className="text-zinc-300">{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={isFree ? "/register" : `/register?plan=${plan.id}&cycle=${cycle}`}
        className={`mt-8 block rounded-full py-3 text-center text-[13px] font-semibold transition ${
          plan.highlight ? "btn-gradient" : "btn-secondary text-white"
        }`}
      >
        {plan.cta}
      </Link>
    </div>
  );
}
