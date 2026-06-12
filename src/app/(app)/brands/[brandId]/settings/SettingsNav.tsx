"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  Share2,
  Code2,
  BookMarked,
  ScrollText,
  Smartphone,
  AtSign as Instagram,
} from "lucide-react";
import { usePermissions } from "@/components/PermissionsProvider";
import { useFeatureFlags } from "@/components/FeatureFlagsProvider";

const NAV = [
  { slug: "", label: "General", icon: Settings, desc: "Logo, color, clientes", perm: "brands.edit", flag: null },
  { slug: "sharing", label: "Compartir", icon: Share2, desc: "Link público e invitación", perm: "share.manage", flag: null },
  { slug: "widget", label: "Widget", icon: Code2, desc: "Feedback en sitio", perm: "share.manage", flag: null },
  { slug: "instagram", label: "Instagram", icon: Instagram, desc: "Conectar cuenta para publicar", perm: "instagram.manage", flag: "metaOAuthEnabled" as const },
  { slug: "breakpoints", label: "Breakpoints", icon: Smartphone, desc: "Mobile / tablet / desktop", perm: "brands.edit", flag: null },
  { slug: "library", label: "Biblioteca", icon: BookMarked, desc: "Hashtags y plantillas", perm: "library.manage", flag: null },
  { slug: "audit", label: "Audit log", icon: ScrollText, desc: "Actividad reciente", perm: "audit.view", flag: null },
] as const;

/**
 * Navegación lateral de Settings. Vive en `settings/layout.tsx`, así que persiste
 * entre sub-rutas — solo el contenido de la sección cambia.
 */
export default function SettingsNav({ brandId }: { brandId: string }) {
  const pathname = usePathname();
  const base = `/brands/${brandId}/settings`;
  const { has } = usePermissions();
  const flags = useFeatureFlags();
  const items = NAV.filter((item) => {
    if (!has(item.perm, brandId)) return false;
    if (item.flag && !flags[item.flag]) return false;
    return true;
  });

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto pb-2 sm:flex-col sm:overflow-visible sm:pb-0">
      {items.map((item) => {
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
                className={`hidden truncate text-2xs sm:block ${
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
