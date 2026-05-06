import Link from "next/link";
import {
  Shield,
  UserCog,
  Building2,
  CreditCard,
  HeartPulse,
  Send,
  BarChart3,
  ArrowRight,
} from "lucide-react";

/**
 * Banner de acceso rápido al panel admin. Solo se muestra a users con
 * role="admin" en el dashboard. Pensado para que el admin tenga un
 * acceso visible y de un click a las secciones más usadas.
 */
export default function AdminQuickAccess() {
  const SHORTCUTS = [
    { label: "Usuarios", href: "/admin/users", icon: UserCog },
    { label: "Agencias", href: "/admin/agencies", icon: Building2 },
    { label: "Métricas", href: "/admin/metrics", icon: BarChart3 },
    { label: "Pasarelas", href: "/admin/integrations", icon: CreditCard },
    { label: "Health", href: "/admin/health", icon: HeartPulse },
    { label: "Comunicaciones", href: "/admin/communications", icon: Send },
  ] as const;

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-fuchsia-200/60 bg-gradient-to-r from-fuchsia-50/60 via-rose-50/40 to-amber-50/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-sm">
            <Shield className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-zinc-900">
              Panel administrativo
            </p>
            <p className="text-[11.5px] text-zinc-600">
              Gestión global de la plataforma — usuarios, agencias, billing.
            </p>
          </div>
        </div>
        <Link
          href="/admin"
          className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
        >
          Abrir panel
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group flex items-center gap-2 rounded-lg border border-white/60 bg-white/70 px-3 py-2 text-[12px] font-medium text-zinc-700 transition hover:border-fuchsia-300 hover:bg-white hover:text-zinc-900 hover:shadow-sm"
            >
              <Icon className="h-3.5 w-3.5 text-fuchsia-600" />
              <span className="flex-1 truncate">{s.label}</span>
              <ArrowRight className="h-3 w-3 -translate-x-1 text-zinc-400 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
