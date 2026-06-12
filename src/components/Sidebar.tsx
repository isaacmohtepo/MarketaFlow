"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "./PermissionsProvider";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import type { Workspace } from "@/lib/active-agency";
import {
  LayoutDashboard,
  Layers,
  Inbox,
  BarChart3,
  Sparkles,
  Users,
  Settings,
  Zap,
  ArrowUpRight,
  CreditCard,
  Shield,
  ChevronDown,
  Building2,
  FileText,
  Send,
  Webhook,
  HeartPulse,
  KeyRound,
  ScrollText,
  UserCog,
  Bell,
  Lock,
  Activity,
  Receipt,
  HelpCircle,
  Package,
  ListTodo,
} from "lucide-react";

type NavItem = {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (path: string) => boolean;
  soon?: boolean;
  /** Si tiene `children`, el item se renderiza como dropdown expandible. */
  children?: NavItem[];
  badge?: "admin" | "owner" | string;
};

type Section = { title: string; items: NavItem[] };

function buildSections({
  isAdmin,
  canViewBilling,
  canViewTasks,
}: {
  isAdmin: boolean;
  canViewBilling: boolean;
  canViewTasks: boolean;
}): Section[] {
  const sections: Section[] = [
    {
      title: "Workspace",
      items: [
        {
          label: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
          match: (p) => p === "/dashboard",
        },
        {
          label: "Marcas",
          href: "/brands",
          icon: Layers,
          match: (p) => p.startsWith("/brands"),
        },
        {
          label: "Inbox",
          href: "/inbox",
          icon: Inbox,
          match: (p) => p.startsWith("/inbox"),
        },
        ...(canViewTasks
          ? [
              {
                label: "Tareas",
                href: "/tasks",
                icon: ListTodo,
                match: (p: string) => p.startsWith("/tasks"),
              } as NavItem,
            ]
          : []),
      ],
    },
    {
      title: "Cuenta",
      items: [
        {
          label: "Equipo",
          href: "/team",
          icon: Users,
          match: (p) => p.startsWith("/team"),
        },
        ...(canViewBilling
          ? [
              // Plan = todo lo que tiene que ver con la SUSCRIPCIÓN:
              // qué plan tienes activo y qué add-ons sumas encima.
              {
                label: "Plan",
                icon: Sparkles,
                match: (p: string) =>
                  p.startsWith("/billing/plan") ||
                  p.startsWith("/billing/productos"),
                children: [
                  {
                    label: "Configuración",
                    href: "/billing/plan",
                    icon: Settings,
                    match: (p: string) => p.startsWith("/billing/plan"),
                  } as NavItem,
                  {
                    label: "Productos",
                    href: "/billing/productos",
                    icon: Package,
                    match: (p: string) => p.startsWith("/billing/productos"),
                  } as NavItem,
                ],
              } as NavItem,
              // Facturación = todo lo FINANCIERO: qué ya cobramos (facturas).
              // (Métodos de pago se removió — modelo pago-único por ciclo,
              // no guardamos tarjetas.)
              {
                label: "Facturación",
                icon: CreditCard,
                match: (p: string) =>
                  p === "/billing" ||
                  p === "/billing/" ||
                  p.startsWith("/billing/return") ||
                  p.startsWith("/billing/checkout") ||
                  p.startsWith("/billing/invoices"),
                children: [
                  {
                    label: "Resumen",
                    href: "/billing",
                    icon: Receipt,
                    match: (p: string) =>
                      p === "/billing" ||
                      p === "/billing/" ||
                      p.startsWith("/billing/return") ||
                      p.startsWith("/billing/checkout"),
                  } as NavItem,
                  {
                    label: "Facturas",
                    href: "/billing/invoices",
                    icon: FileText,
                    match: (p: string) => p.startsWith("/billing/invoices"),
                  } as NavItem,
                ],
              } as NavItem,
            ]
          : []),
        {
          label: "Mi cuenta",
          icon: Settings,
          match: (p: string) => p.startsWith("/account"),
          children: [
            { label: "General", href: "/account?tab=general", icon: UserCog },
            { label: "Seguridad", href: "/account?tab=security", icon: Lock },
            { label: "Notificaciones", href: "/account?tab=notifications", icon: Bell },
            { label: "Actividad", href: "/account?tab=activity", icon: Activity },
            { label: "Privacidad", href: "/account?tab=privacy", icon: Shield },
          ],
        },
        {
          label: "Ayuda",
          href: "/help",
          icon: HelpCircle,
          match: (p: string) => p.startsWith("/help"),
        },
      ],
    },
  ];

  // Admin → todo expandido para que el admin vea de un vistazo qué tiene.
  if (isAdmin) {
    sections.push({
      title: "Admin",
      items: [
        {
          label: "Panel admin",
          icon: Shield,
          match: (p: string) => p.startsWith("/admin"),
          badge: "admin",
          children: [
            { label: "Resumen", href: "/admin", icon: LayoutDashboard, match: (p) => p === "/admin" },
            { label: "Usuarios", href: "/admin/users", icon: UserCog, match: (p) => p.startsWith("/admin/users") },
            { label: "Agencias", href: "/admin/agencies", icon: Building2, match: (p) => p.startsWith("/admin/agencies") },
            { label: "Posts", href: "/admin/posts", icon: FileText, match: (p) => p.startsWith("/admin/posts") },
            { label: "Métricas", href: "/admin/metrics", icon: BarChart3, match: (p) => p.startsWith("/admin/metrics") },
            { label: "Comunicaciones", href: "/admin/communications", icon: Send, match: (p) => p.startsWith("/admin/communications") },
            { label: "Integraciones", href: "/admin/integrations", icon: CreditCard, match: (p) => p.startsWith("/admin/integrations") },
            { label: "Webhooks", href: "/admin/webhooks", icon: Webhook, match: (p) => p.startsWith("/admin/webhooks") },
            { label: "Health", href: "/admin/health", icon: HeartPulse, match: (p) => p.startsWith("/admin/health") },
            { label: "Configuración", href: "/admin/settings", icon: Settings, match: (p) => p.startsWith("/admin/settings") },
            { label: "Setup", href: "/admin/setup", icon: KeyRound, match: (p) => p.startsWith("/admin/setup") },
            { label: "Audit log", href: "/admin/audit-log", icon: ScrollText, match: (p) => p.startsWith("/admin/audit-log") },
          ],
        },
      ],
    });
  }

  return sections;
}

const DARK_LINE = "1px solid rgba(255, 255, 255, 0.07)";

export default function Sidebar({
  agencyName,
  brandName,
  brandLogoUrl,
  brandLogoMode,
  brandLogoHeight,
  brandHeaderAlign,
  isMobile = false,
  onNavigate,
  isAdmin = false,
  isOwner = false,
  planCard = null,
  workspaces = [],
  activeAgencyId = null,
}: {
  agencyName: string | null;
  /** Si está set, reemplaza "MarketaFlow" en el header. */
  brandName?: string | null;
  /** Si está set, reemplaza el ícono Zap del header con el logo custom. */
  brandLogoUrl?: string | null;
  /** Modo de display: logo+texto / solo logo (grande) / solo texto. */
  brandLogoMode?: "logo_and_text" | "logo_only" | "text_only" | null;
  /** Altura del logo en px (solo aplica en modo logo_only). */
  brandLogoHeight?: number | null;
  /** Alineación horizontal del header del sidebar. */
  brandHeaderAlign?: "left" | "center" | "right" | null;
  isMobile?: boolean;
  onNavigate?: () => void;
  isAdmin?: boolean;
  isOwner?: boolean;
  planCard?: PlanCardData | null;
  /** Agencias del user para el selector de workspace. Si <=1, no se muestra. */
  workspaces?: Workspace[];
  /** Agencia activa actual (para marcar la seleccionada en el switcher). */
  activeAgencyId?: string | null;
}) {
  const pathname = usePathname() ?? "/dashboard";
  const [inboxCount, setInboxCount] = useState<number>(0);
  const [tasksCount, setTasksCount] = useState<number>(0);
  const { has, hasAnyScope } = usePermissions();
  // Billing solo visible si el user tiene billing.view (owner + manager por
  // default; cualquier custom role que tenga ese perm). Antes era owner-only.
  const canViewBilling = isOwner || has("billing.view");
  // Tareas es agency-global: un miembro brand-scoped (ej. diseñador asignado
  // a marcas puntuales) igual debe ver el tablero. Por eso hasAnyScope y no has.
  const canViewTasks = isOwner || hasAnyScope("tasks.read");
  const SECTIONS = useMemo(
    () => buildSections({ isAdmin, canViewBilling, canViewTasks }),
    [isAdmin, canViewBilling, canViewTasks],
  );

  // Expanded state per item. Default: expandido si algún hijo matchea el path.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Auto-expand cuando cambia el path: si el current path está dentro de un
  // dropdown, abrirlo automáticamente (UX común).
  useEffect(() => {
    const next: Record<string, boolean> = { ...expanded };
    let changed = false;
    for (const section of SECTIONS) {
      for (const item of section.items) {
        if (item.children && isItemActive(item, pathname)) {
          if (!next[item.label]) {
            next[item.label] = true;
            changed = true;
          }
        }
      }
    }
    if (changed) setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
    const id = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Tasks count para el badge — solo polling si el user tiene acceso.
  useEffect(() => {
    if (!canViewTasks) return;
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/tasks/my-count", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setTasksCount(j.count ?? 0);
      } catch {}
    }
    load();
    const id = setInterval(load, 30000); // tareas cambian menos que inbox
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [canViewTasks]);

  function toggle(label: string) {
    setExpanded((e) => ({ ...e, [label]: !e[label] }));
  }

  return (
    <aside
      className={
        isMobile
          ? "flex h-full w-64 shrink-0 flex-col"
          : // Desktop: sticky top-0 + h-screen anclan el sidebar al
            // viewport. Sin esto, en páginas largas (dashboard, brands)
            // el sidebar crecía con el contenido y el PlanCard del
            // footer quedaba below-the-fold. Ahora el nav scrollea
            // internamente y el PlanCard siempre es visible.
            "sticky top-0 hidden h-screen w-60 shrink-0 flex-col lg:flex"
      }
      style={{ background: "var(--bg-sidebar)", borderRight: DARK_LINE }}
    >
      <div
        className={`flex h-14 items-center gap-2.5 px-4 ${
          brandHeaderAlign === "center"
            ? "justify-center"
            : brandHeaderAlign === "right"
              ? "justify-end"
              : "justify-start"
        }`}
        style={{ borderBottom: DARK_LINE }}
      >
        {/* Logo (oculto si modo = text_only). En logo_only respetamos el
            aspect ratio natural — altura configurable, ancho automático. */}
        {brandLogoMode !== "text_only" && (
          <>
            {brandLogoUrl ? (
              brandLogoMode === "logo_only" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brandLogoUrl}
                  alt={brandName ?? "Logo"}
                  style={{ height: `${brandLogoHeight ?? 32}px` }}
                  className="w-auto max-w-[160px] object-contain"
                />
              ) : (
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center overflow-hidden rounded-lg bg-white/5 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={brandLogoUrl}
                    alt={brandName ?? "Logo"}
                    className="h-full w-full object-contain"
                  />
                </span>
              )
            ) : (
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg brand-gradient text-white shadow-sm">
                <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            )}
          </>
        )}
        {/* Texto (oculto si modo = logo_only) */}
        {brandLogoMode !== "logo_only" && (
          <div className="min-w-0">
            <p
              className={`truncate text-[13px] font-semibold tracking-tight text-white ${
                brandHeaderAlign === "center"
                  ? "text-center"
                  : brandHeaderAlign === "right"
                    ? "text-right"
                    : "text-left"
              }`}
            >
              {brandName ?? "MarketaFlow"}
            </p>
            {/* El nombre de la agencia lo muestra el WorkspaceSwitcher de abajo
                (evitamos duplicarlo aquí). */}
          </div>
        )}
      </div>

      <WorkspaceSwitcher
        workspaces={workspaces}
        activeAgencyId={activeAgencyId}
      />

      <nav className="scroll-dark flex-1 overflow-y-auto px-2 pb-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mt-5 first:mt-3">
            <p className="px-3 mb-1.5 text-3xs font-semibold uppercase tracking-wider text-zinc-500">
              {section.title}
            </p>
            <ul className="space-y-px">
              {section.items.map((item) => {
                if (item.children) {
                  return (
                    <ParentItem
                      key={item.label}
                      item={item}
                      pathname={pathname}
                      expanded={!!expanded[item.label]}
                      onToggle={() => toggle(item.label)}
                      onNavigate={onNavigate}
                    />
                  );
                }
                return (
                  <LeafItem
                    key={item.label}
                    item={item}
                    pathname={pathname}
                    inboxCount={inboxCount}
                    tasksCount={tasksCount}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Plan card — solo se muestra a owners. Clients/editors no tienen
          acceso a billing. Si no hay planCard data, no mostramos nada. */}
      {isOwner && planCard && (
        <div className="p-3">
          <PlanCard data={planCard} />
        </div>
      )}
    </aside>
  );
}

// ============================================================================
// Plan card en el footer del sidebar
// ============================================================================

export type PlanCardData = {
  planId: "free" | "pro" | "agency";
  planName: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  nextChargeAt: string | null;
  priceMonthlyCents: number;
  billingCycle: string;
};

function formatCop(cents: number): string {
  const pesos = Math.round(cents / 100);
  return "$" + pesos.toLocaleString("es-CO");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function PlanCard({ data }: { data: PlanCardData }) {
  // Todas las variantes linkean a /billing/plan (la página de gestión).
  // ANTES apuntaban a /billing (Resumen), lo cual hacía que el click
  // pareciera "no hacer nada" cuando el user ya estaba en /billing —
  // Next.js no re-navega a la misma URL.
  const planHref = "/billing/plan";

  // Caso 1: Free → CTA "Sube a Pro"
  if (data.planId === "free") {
    return (
      <Link
        href={planHref}
        className="group block overflow-hidden rounded-lg p-3 text-xs transition hover:bg-white/[0.04]"
        style={{ border: DARK_LINE }}
      >
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
            Plan Free
          </p>
          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500 transition group-hover:text-fuchsia-400" />
        </div>
        <p className="mt-1 text-[12px] font-semibold brand-gradient-text">
          Sube a Pro
        </p>
        <p className="mt-0.5 text-2xs text-zinc-500">
          Marcas y posts ilimitados
        </p>
      </Link>
    );
  }

  // Caso 2: Trialing
  if (data.status === "trialing" && data.trialEndsAt) {
    const daysLeft = Math.max(
      0,
      Math.ceil(
        (new Date(data.trialEndsAt).getTime() - Date.now()) /
          (24 * 60 * 60 * 1000),
      ),
    );
    return (
      <Link
        href={planHref}
        className="group block overflow-hidden rounded-lg p-3 text-xs transition hover:bg-white/[0.04]"
        style={{ border: DARK_LINE }}
      >
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-wider text-amber-400">
            Trial {data.planName}
          </p>
          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500 transition group-hover:text-amber-400" />
        </div>
        <p className="mt-1 text-[12px] font-semibold text-white">
          {daysLeft} {daysLeft === 1 ? "día restante" : "días restantes"}
        </p>
        <p className="mt-0.5 text-2xs text-zinc-500">
          Activa tu suscripción para no perder features
        </p>
      </Link>
    );
  }

  // Caso 3: Past due → va a Plan para renovar (pago único)
  if (data.status === "past_due") {
    return (
      <Link
        href="/billing/plan"
        className="group block overflow-hidden rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs transition hover:bg-rose-500/20"
      >
        <div className="flex items-center justify-between">
          <p className="text-2xs font-bold uppercase tracking-wider text-rose-300">
            Plan vencido
          </p>
          <ArrowUpRight className="h-3.5 w-3.5 text-rose-300" />
        </div>
        <p className="mt-1 text-[12px] font-semibold text-white">
          Renueva tu plan
        </p>
        <p className="mt-0.5 text-2xs text-rose-200/80">
          Unos días de gracia antes de bajar a Free
        </p>
      </Link>
    );
  }

  // Caso 4: Cancelará al final del período
  if (data.cancelAtPeriodEnd && data.currentPeriodEnd) {
    return (
      <Link
        href={planHref}
        className="group block overflow-hidden rounded-lg p-3 text-xs transition hover:bg-white/[0.04]"
        style={{ border: DARK_LINE }}
      >
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-wider text-amber-400">
            Plan {data.planName}
          </p>
          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500 transition group-hover:text-amber-400" />
        </div>
        <p className="mt-1 text-[12px] font-semibold text-white">
          Cancela el {formatDate(data.currentPeriodEnd)}
        </p>
        <p className="mt-0.5 text-2xs text-zinc-500">
          Toca para reactivar
        </p>
      </Link>
    );
  }

  // Caso 5: Plan activo paid (Pro / Agency normal)
  return (
    <Link
      href={planHref}
      className="group block overflow-hidden rounded-lg p-3 text-xs transition hover:bg-white/[0.04]"
      style={{ border: DARK_LINE }}
    >
      <div className="flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-wider brand-gradient-text">
          Plan {data.planName}
        </p>
        <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500 transition group-hover:text-fuchsia-400" />
      </div>
      <p className="mt-1 text-[12px] font-semibold text-white tabular-nums">
        {formatCop(data.priceMonthlyCents)}
        <span className="text-3xs font-normal text-zinc-500"> /mes</span>
      </p>
      <p className="mt-0.5 text-2xs text-zinc-500">
        {data.nextChargeAt
          ? `Renuevas ${formatDate(data.nextChargeAt)}`
          : data.billingCycle === "yearly"
            ? "Facturado anual"
            : "Activa"}
      </p>
    </Link>
  );
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.match && item.match(pathname)) return true;
  if (item.href) {
    if (pathname === item.href) return true;
  }
  if (item.children) {
    for (const c of item.children) {
      if (isItemActive(c, pathname)) return true;
    }
  }
  return false;
}

function ParentItem({
  item,
  pathname,
  expanded,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const someChildActive = !!item.children?.some((c) => isItemActive(c, pathname));

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`group relative flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition ${
          someChildActive
            ? "text-white"
            : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
        }`}
      >
        {someChildActive && !expanded && (
          <span
            className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full brand-gradient"
            aria-hidden
          />
        )}
        <Icon className={`h-4 w-4 ${someChildActive ? "text-white" : ""}`} />
        <span className="flex-1 text-left">{item.label}</span>
        {item.badge === "admin" && (
          <span className="rounded-full brand-gradient px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-white">
            Admin
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && item.children && (
        <ul className="mt-0.5 space-y-px pl-3">
          {item.children.map((child) => (
            <ChildItem
              key={child.label}
              item={child}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function LeafItem({
  item,
  pathname,
  inboxCount,
  tasksCount,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  inboxCount: number;
  tasksCount: number;
  onNavigate?: () => void;
}) {
  const active = isItemActive(item, pathname);
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
      {item.label === "Tareas" && tasksCount > 0 && (
        <span className="rounded-full bg-fuchsia-500 px-1.5 py-0.5 text-[9px] font-bold text-white tabular-nums">
          {tasksCount > 99 ? "99+" : tasksCount}
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
    <li>
      {item.soon || !item.href ? (
        <div aria-disabled>{inner}</div>
      ) : (
        <Link href={item.href} onClick={onNavigate}>
          {inner}
        </Link>
      )}
    </li>
  );
}

function ChildItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isItemActive(item, pathname);
  const Icon = item.icon;
  if (!item.href) return null;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        className={`group relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[12.5px] transition ${
          active
            ? "bg-white/[0.06] text-white"
            : "text-zinc-500 hover:text-zinc-200"
        }`}
      >
        {/* Línea vertical sutil que conecta visualmente con el parent */}
        <span
          className="absolute left-0.5 top-0 h-full w-px bg-white/[0.05]"
          aria-hidden
        />
        <Icon
          className={`relative ml-1 h-3.5 w-3.5 ${active ? "text-white" : "text-zinc-500"}`}
        />
        <span className="flex-1">{item.label}</span>
        {active && (
          <span
            className="h-1.5 w-1.5 rounded-full brand-gradient"
            aria-hidden
          />
        )}
      </Link>
    </li>
  );
}
