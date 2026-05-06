"use client";

import Link from "next/link";
import { User, Shield, Bell, Activity, Lock } from "lucide-react";

const TABS = [
  { id: "general", label: "General", icon: User },
  { id: "security", label: "Seguridad", icon: Shield },
  { id: "notifications", label: "Notificaciones", icon: Bell },
  { id: "activity", label: "Actividad", icon: Activity },
  { id: "privacy", label: "Privacidad", icon: Lock },
] as const;

export default function AccountTabs({ current }: { current: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50/60 p-1">
      {TABS.map((t) => {
        const active = current === t.id;
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={`?tab=${t.id}`}
            scroll={false}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition ${
              active
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
