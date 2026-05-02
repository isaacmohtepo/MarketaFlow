"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Layers,
  Calendar,
  Inbox,
  BarChart3,
  Sparkles,
  Users,
  Settings,
  Zap,
  ArrowUpRight,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (path: string) => boolean;
  soon?: boolean;
};

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
      { label: "Marcas", href: "/dashboard", icon: Layers, match: (p) => p.startsWith("/brands") },
      { label: "Inbox", href: "/inbox", icon: Inbox, match: (p) => p.startsWith("/inbox") },
    ],
  },
  {
    title: "Producción",
    items: [
      { label: "Calendario", href: "/calendar", icon: Calendar, soon: true },
      { label: "Plantillas", href: "/templates", icon: Sparkles, soon: true },
      { label: "Métricas", href: "/metrics", icon: BarChart3, soon: true },
    ],
  },
  {
    title: "Cuenta",
    items: [
      { label: "Equipo", href: "/team", icon: Users },
      { label: "Cuenta", href: "/account", icon: Settings },
    ],
  },
];

const DARK_LINE = "1px solid rgba(255, 255, 255, 0.07)";

export default function Sidebar({
  agencyName,
  isMobile = false,
  onNavigate,
}: {
  agencyName: string | null;
  isMobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "/dashboard";
  const [inboxCount, setInboxCount] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/inbox/count", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setInboxCount(j.count ?? 0);
      } catch {}
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <aside
      className={
        isMobile
          ? "flex h-full w-64 shrink-0 flex-col"
          : "hidden lg:flex w-60 shrink-0 flex-col"
      }
      style={{ background: "var(--bg-sidebar)", borderRight: DARK_LINE }}
    >
      <div
        className="flex h-14 items-center gap-2.5 px-4"
        style={{ borderBottom: DARK_LINE }}
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg brand-gradient text-white shadow-sm">
          <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold tracking-tight text-white">
            MarketaFlow
          </p>
          {agencyName && (
            <p className="truncate text-[11px] text-zinc-500">{agencyName}</p>
          )}
        </div>
      </div>

      <nav className="scroll-dark flex-1 overflow-y-auto px-2 pb-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mt-5 first:mt-3">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {section.title}
            </p>
            <ul className="space-y-px">
              {section.items.map((item) => {
                const active = item.match
                  ? item.match(pathname)
                  : pathname.startsWith(item.href);
                const Icon = item.icon;
                const inner = (
                  <span
                    className={`group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition ${
                      active
                        ? "bg-white/[0.07] text-white"
                        : item.soon
                          ? "text-zinc-600 cursor-not-allowed"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full brand-gradient"
                        aria-hidden
                      />
                    )}
                    <Icon className={`h-4 w-4 ${active ? "text-white" : ""}`} />
                    <span className="flex-1">{item.label}</span>
                    {item.label === "Inbox" && inboxCount > 0 && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white brand-gradient tabular-nums">
                        {inboxCount > 99 ? "99+" : inboxCount}
                      </span>
                    )}
                    {item.soon && (
                      <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                        Pronto
                      </span>
                    )}
                  </span>
                );
                return (
                  <li key={item.label}>
                    {item.soon ? (
                      <div aria-disabled>{inner}</div>
                    ) : (
                      <Link href={item.href} onClick={onNavigate}>
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3">
        <Link
          href="/pricing"
          className="group block overflow-hidden rounded-lg p-3 text-xs transition hover:bg-white/[0.04]"
          style={{ border: DARK_LINE }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Plan Free
            </p>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500 transition group-hover:text-fuchsia-400" />
          </div>
          <p className="mt-1 text-[12px] font-semibold brand-gradient-text">
            Sube a Pro
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Marcas y posts ilimitados
          </p>
        </Link>
      </div>
    </aside>
  );
}
