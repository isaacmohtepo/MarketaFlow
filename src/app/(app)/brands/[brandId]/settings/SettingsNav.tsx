"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  Share2,
  Code2,
  BookMarked,
  ScrollText,
} from "lucide-react";

const NAV = [
  { slug: "", label: "General", icon: Settings, desc: "Logo, color, clientes" },
  { slug: "sharing", label: "Compartir", icon: Share2, desc: "Link público e invitación" },
  { slug: "widget", label: "Widget", icon: Code2, desc: "Feedback en sitio" },
  { slug: "library", label: "Biblioteca", icon: BookMarked, desc: "Hashtags y plantillas" },
  { slug: "audit", label: "Audit log", icon: ScrollText, desc: "Actividad reciente" },
] as const;

/**
 * Navegación lateral de Settings. Vive en `settings/layout.tsx`, así que persiste
 * entre sub-rutas — solo el contenido de la sección cambia.
 */
export default function SettingsNav({ brandId }: { brandId: string }) {
  const pathname = usePathname();
  const base = `/brands/${brandId}/settings`;

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
            key={item.slug || "general"}
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
