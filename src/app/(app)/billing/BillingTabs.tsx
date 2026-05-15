"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Receipt,
  Sparkles,
  Package,
  Wallet,
  FileText,
} from "lucide-react";

/**
 * Nav superior compartido entre todas las páginas /billing/*. Funciona
 * como tabs: muestra cuál sub-página estás viendo y permite saltar a
 * las demás sin ir al sidebar.
 *
 * Layout: scroll horizontal en mobile, fila normal en desktop.
 */
const TABS = [
  { id: "resumen", label: "Resumen", icon: Receipt, href: "/billing" },
  { id: "plan", label: "Plan", icon: Sparkles, href: "/billing/plan" },
  { id: "productos", label: "Productos", icon: Package, href: "/billing/productos" },
  { id: "metodos", label: "Métodos de pago", icon: Wallet, href: "/billing/payment-methods" },
  { id: "facturas", label: "Facturas", icon: FileText, href: "/billing/invoices" },
] as const;

export default function BillingTabs() {
  const pathname = usePathname() ?? "/billing";
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50/60 p-1">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition ${
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

function isActive(pathname: string, href: string): boolean {
  if (href === "/billing") {
    // Resumen: solo activo en la raíz exacta + páginas de flow (checkout/return)
    return (
      pathname === "/billing" ||
      pathname === "/billing/" ||
      pathname.startsWith("/billing/checkout") ||
      pathname.startsWith("/billing/return")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
