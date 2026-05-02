import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS } from "@/lib/plans";

export default function PricingTable() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={`relative flex flex-col rounded-3xl p-7 transition ${
            plan.highlight
              ? "border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-900 to-fuchsia-950/40 shadow-2xl"
              : "card hover:-translate-y-1 hover:border-white/15"
          }`}
        >
          {plan.highlight && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full brand-gradient px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg">
              Más popular
            </span>
          )}
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500">
              {plan.name}
            </h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-5xl font-bold tracking-tight text-white">
                {plan.price}
              </span>
              <span className="text-sm text-zinc-500">{plan.priceNote}</span>
            </div>
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
            href="/register"
            className={`mt-8 block rounded-full py-3 text-center text-[13px] font-semibold transition ${
              plan.highlight
                ? "btn-gradient"
                : "btn-secondary text-white"
            }`}
          >
            {plan.cta}
          </Link>
        </div>
      ))}
    </div>
  );
}
