"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { id: "resumen", label: "Resumen", href: "/billing" },
  { id: "plan", label: "Plan", href: "/billing/plan" },
  { id: "productos", label: "Productos", href: "/billing/productos" },
  { id: "metodos", label: "Métodos de pago", href: "/billing/payment-methods" },
  { id: "facturas", label: "Facturas", href: "/billing/invoices" },
] as const;

/**
 * Tabs estilo underline minimalista: subraya el activo con un border-bottom
 * gradient en vez de un pill con fondo. Mucho más limpio visualmente que el
 * estilo anterior tipo "segmented control".
 */
export default function BillingTabs() {
  const pathname = usePathname() ?? "/billing";
  return (
    <nav className="mb-8 -mx-1 flex gap-6 overflow-x-auto border-b border-zinc-100 px-1">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`relative flex-shrink-0 whitespace-nowrap px-0.5 pb-3 text-[13px] transition ${
              active
                ? "font-semibold text-zinc-900"
                : "font-medium text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {t.label}
            {active && (
              <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full brand-gradient" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/billing") {
    return (
      pathname === "/billing" ||
      pathname === "/billing/" ||
      pathname.startsWith("/billing/checkout") ||
      pathname.startsWith("/billing/return")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
