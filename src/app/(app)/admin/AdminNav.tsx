"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, BarChart3, LayoutGrid, KeyRound, ScrollText, UserCog, Building2, Webhook, HeartPulse, Send, FileText, Sliders } from "lucide-react";

const NAV = [
  { slug: "", label: "Resumen", icon: LayoutGrid, desc: "Stats globales" },
  {
    slug: "users",
    label: "Usuarios",
    icon: UserCog,
    desc: "Crear, editar, suspender, impersonar",
  },
  { slug: "agencies", label: "Agencias", icon: Building2, desc: "Tenants y suscripciones" },
  { slug: "posts", label: "Posts", icon: FileText, desc: "Buscar contenido cross-tenant" },
  { slug: "metrics", label: "Métricas", icon: BarChart3, desc: "MRR, churn, retention" },
  {
    slug: "communications",
    label: "Comunicaciones",
    icon: Send,
    desc: "Email broadcasts a usuarios",
  },
  {
    slug: "integrations",
    label: "Integraciones",
    icon: CreditCard,
    desc: "Pasarelas y APIs externas",
  },
  {
    slug: "webhooks",
    label: "Webhooks",
    icon: Webhook,
    desc: "Log de eventos recibidos",
  },
  {
    slug: "health",
    label: "Health",
    icon: HeartPulse,
    desc: "DB / R2 / Wompi / Anthropic",
  },
  {
    slug: "settings",
    label: "Configuración",
    icon: Sliders,
    desc: "Variables del sistema (2FA, trial, etc.)",
  },
  {
    slug: "setup",
    label: "Setup",
    icon: KeyRound,
    desc: "Master key de encriptación",
  },
  {
    slug: "audit-log",
    label: "Audit log",
    icon: ScrollText,
    desc: "Eventos sensibles",
  },
] as const;

export default function AdminNav() {
  const pathname = usePathname();
  const base = `/admin`;

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto pb-2 sm:flex-col sm:overflow-visible sm:pb-0">
      {NAV.map((item) => {
        const href = item.slug ? `${base}/${item.slug}` : base;
        const isActive =
          item.slug === ""
            ? pathname === base
            : pathname === href || pathname.startsWith(`${href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.slug || "summary"}
            href={href}
            className={`group flex flex-shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition sm:flex-shrink ${
              isActive
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <div className="min-w-0">
              <div className="truncate">{item.label}</div>
              <div
                className={`hidden truncate text-[11px] sm:block ${
                  isActive ? "text-white/60" : "text-zinc-500"
                }`}
              >
                {item.desc}
              </div>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
