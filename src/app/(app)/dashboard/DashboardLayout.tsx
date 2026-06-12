"use client";

/**
 * Dashboard widgets en una grid arrastrable + redimensionable
 * (react-grid-layout).
 *
 * Modo lectura (default): la grid se ve como un dashboard normal, sin
 * indicadores de drag. Tocas "Editar layout" y aparecen los handles para
 * arrastrar cada widget y un grip en la esquina inferior derecha para
 * redimensionar. Sales de edición → se vuelve a la vista limpia.
 *
 * El layout se persiste en localStorage por user para no perderlo entre
 * sesiones. Botón "Resetear" vuelve al layout default.
 *
 * Cada widget vive en un card del design-system normal (.card). El widget
 * es contenido — la grid solo decide su posición/tamaño. Los datos siguen
 * cargándose en el server component padre y se inyectan via props.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  GripVertical,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Layers,
  ListChecks,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
  Check,
} from "lucide-react";
// react-grid-layout v1.5.x — la versión estable (la v2 reescrita tenía un
// bug en el cálculo de offset del drag: el item se separaba del cursor).
// v1 usa react-draggable + el HOC WidthProvider, battle-tested.
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import ExpandableList from "@/components/ExpandableList";
import Sparkline from "./Sparkline";
import NewBrandTile from "./NewBrandTile";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import { approvalRateTone } from "@/lib/kpis-utils";

const ResponsiveGridLayout = WidthProvider(Responsive);

// ────────────────────────────────────────────────────────────────────────
// Tipos (espejo de lo que carga page.tsx)
// ────────────────────────────────────────────────────────────────────────

type BrandLite = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  role: string;
};
type BrandStats = { total: number; pending: number; approved: number };
type BrandKpi = {
  approvalRate: number | null;
  publishedTotal: number;
  publishedSparkline: number[];
};
type NotifLite = {
  id: string;
  type: string;
  body: string | null;
  brandId: string | null;
  postId: string | null;
  read: boolean;
  createdAt: string;
};
type ActivityLite = {
  id: string;
  type: string;
  meta: string;
  createdAt: string;
  user: { name: string | null; email: string } | null;
  post: { id: string; brandId: string; brand: { name: string } };
};
type PendingPostLite = {
  id: string;
  brandId: string;
  status: string;
  caption: string | null;
  imageUrl: string | null;
  brand: { name: string };
};
type MyTaskLite = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  brand: { id: string; name: string; color: string | null } | null;
};

export type DashboardData = {
  brands: BrandLite[];
  perBrand: Record<string, BrandStats>;
  brandKpis: Record<string, BrandKpi>;
  recentNotifications: NotifLite[];
  unreadNotifCount: number;
  recentActivities: ActivityLite[];
  pendingPosts: PendingPostLite[];
  inReviewCount: number;
  myTasks: MyTaskLite[];
  myTasksTotal: number;
  canCreateBrand: boolean;
  /** Usado como sufijo del key de localStorage para no mezclar layouts
   *  entre cuentas. */
  storageKey: string;
};

// ────────────────────────────────────────────────────────────────────────
// Helpers — colores, formato de fechas, mapeo de actividad/notif.
// (Duplicados respecto a page.tsx porque este es client-only y page.tsx
// se queda server-side renderizando el shell.)
// ────────────────────────────────────────────────────────────────────────

const BRAND_COLORS = ["#3b5fff", "#8a2be2", "#ff4d8f", "#ff2d55", "#0ea5e9", "#22c55e"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const APPROVAL_TONE_TEXT: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
  neutral: "text-zinc-400",
};

const TASK_PRIORITY_LABEL: Record<string, string> = {
  low: "Baja", normal: "Normal", high: "Alta", urgent: "Urgente",
};
const TASK_PRIORITY_DOT: Record<string, string> = {
  low: "bg-zinc-300", normal: "bg-blue-400", high: "bg-amber-500", urgent: "bg-rose-500",
};
const TASK_STATUS_DASH_LABEL: Record<string, string> = {
  todo: "Por hacer", in_progress: "En progreso", blocked: "Bloqueada", done: "Listo",
};

function formatRelative(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function formatDueShort(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return `Vencida (${-diffDays}d)`;
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  if (diffDays < 7) return `En ${diffDays}d`;
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
}

function dueBadgeClass(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "bg-rose-50 text-rose-700";
  if (diffDays === 0) return "bg-amber-50 text-amber-700";
  if (diffDays <= 2) return "bg-amber-50 text-amber-600";
  return "bg-blue-50 text-blue-700";
}

function describeNotification(type: string): { icon: typeof Plus; tone: string } {
  switch (type) {
    case "post_approved": return { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" };
    case "post_changes_requested": return { icon: XCircle, tone: "bg-rose-50 text-rose-600" };
    case "post_published": return { icon: Sparkles, tone: "bg-fuchsia-50 text-fuchsia-600" };
    case "post_publish_failed": return { icon: XCircle, tone: "bg-rose-50 text-rose-600" };
    case "post_in_review": return { icon: Clock, tone: "bg-amber-50 text-amber-600" };
    default: return { icon: InboxIcon, tone: "bg-zinc-50 text-zinc-600" };
  }
}

function describeActivity(
  type: string,
  meta: Record<string, unknown>,
): { icon: typeof Plus; label: string; tone: string } {
  switch (type) {
    case "created": return { icon: Plus, label: "creó el post", tone: "text-zinc-600" };
    case "status_changed": {
      const to = typeof meta.to === "string" ? meta.to : "";
      if (to === "approved") return { icon: CheckCircle2, label: "aprobó", tone: "text-emerald-600" };
      if (to === "changes_requested") return { icon: XCircle, label: "pidió cambios", tone: "text-rose-600" };
      if (to === "in_review") return { icon: Clock, label: "envió a revisión", tone: "text-amber-600" };
      if (to === "scheduled") return { icon: CalendarClock, label: "programó", tone: "text-blue-600" };
      return { icon: RefreshCw, label: "cambió el estado", tone: "text-zinc-600" };
    }
    case "version_uploaded": return { icon: RefreshCw, label: "subió nueva versión", tone: "text-fuchsia-600" };
    case "published": return { icon: Sparkles, label: "publicó", tone: "text-emerald-600" };
    case "publish_failed": return { icon: XCircle, label: "falló al publicar", tone: "text-rose-600" };
    default: return { icon: MessageSquare, label: type, tone: "text-zinc-600" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Layout default — 12-col grid
// ────────────────────────────────────────────────────────────────────────

/**
 * Cada widget tiene un id estable (i). La grid trabaja con altura en
 * "filas" (default 60px) y ancho en cols (12 total). Los heights default
 * son aproximados al contenido típico.
 */
// minW/minH bajitos a propósito: queremos que el widget pueda
// comprimirse para encajar en huecos chicos al soltar. Si el usuario
// arrastra "Marcas" (8x5) a una columna libre de ancho 3, debería
// achicarse en vez de empujar todo. react-grid-layout respeta minW —
// si lo dejamos en 4, no entraría nunca.
const DEFAULT_LAYOUT_LG: Layout[] = [
  { i: "brands",    x: 0, y: 0,  w: 8, h: 5, minW: 2, minH: 3 },
  { i: "inbox",     x: 8, y: 0,  w: 4, h: 5, minW: 2, minH: 3 },
  { i: "myTasks",   x: 0, y: 5,  w: 8, h: 5, minW: 2, minH: 3 },
  { i: "pending",   x: 8, y: 5,  w: 4, h: 7, minW: 2, minH: 3 },
  { i: "activity",  x: 0, y: 10, w: 8, h: 7, minW: 2, minH: 3 },
];
const DEFAULT_LAYOUT_MD: Layout[] = [
  { i: "brands",    x: 0, y: 0,  w: 6, h: 5, minW: 2, minH: 3 },
  { i: "inbox",     x: 6, y: 0,  w: 4, h: 5, minW: 2, minH: 3 },
  { i: "myTasks",   x: 0, y: 5,  w: 6, h: 5, minW: 2, minH: 3 },
  { i: "pending",   x: 6, y: 5,  w: 4, h: 7, minW: 2, minH: 3 },
  { i: "activity",  x: 0, y: 10, w: 10, h: 7, minW: 3, minH: 3 },
];
const DEFAULT_LAYOUT_SM: Layout[] = [
  { i: "brands",    x: 0, y: 0,  w: 6, h: 6, minW: 2 },
  { i: "myTasks",   x: 0, y: 6,  w: 6, h: 5, minW: 2 },
  { i: "inbox",     x: 0, y: 11, w: 6, h: 5, minW: 2 },
  { i: "pending",   x: 0, y: 16, w: 6, h: 6, minW: 2 },
  { i: "activity",  x: 0, y: 22, w: 6, h: 7, minW: 2 },
];

const STORAGE_KEY_PREFIX = "marketaflow.dashboard.layout.v1.";

// ────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────

export default function DashboardLayout({ data }: { data: DashboardData }) {
  const [editing, setEditing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Layouts inicializan con default; al montar leemos LS y mergeamos.
  const [layouts, setLayouts] = useState<{ lg: Layout[]; md: Layout[]; sm: Layout[] }>({
    lg: DEFAULT_LAYOUT_LG,
    md: DEFAULT_LAYOUT_MD,
    sm: DEFAULT_LAYOUT_SM,
  });

  const storageKey = `${STORAGE_KEY_PREFIX}${data.storageKey}`;

  // Mount: hidratar layout desde LS (SSR-safe — react-grid-layout necesita
  // window para WidthProvider, así que recién renderizamos en client).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Validación mínima: si alguna breakpoint quedó vacía o sin algún
        // widget conocido (caso: agregamos widgets nuevos), caemos al default
        // de ese breakpoint para no romper.
        const validate = (l: unknown, fallback: Layout[]): Layout[] => {
          if (!Array.isArray(l)) return fallback;
          const ids = new Set(l.map((x: Layout) => x.i));
          const allPresent = fallback.every((d) => ids.has(d.i));
          return allPresent ? (l as Layout[]) : fallback;
        };
        setLayouts({
          lg: validate(parsed.lg, DEFAULT_LAYOUT_LG),
          md: validate(parsed.md, DEFAULT_LAYOUT_MD),
          sm: validate(parsed.sm, DEFAULT_LAYOUT_SM),
        });
      }
    } catch {}
    setMounted(true);
  }, [storageKey]);

  function persistLayouts(next: { lg?: Layout[]; md?: Layout[]; sm?: Layout[] }) {
    const merged = { ...layouts, ...next };
    setLayouts(merged);
    try {
      localStorage.setItem(storageKey, JSON.stringify(merged));
    } catch {}
  }

  function resetLayout() {
    setLayouts({
      lg: DEFAULT_LAYOUT_LG,
      md: DEFAULT_LAYOUT_MD,
      sm: DEFAULT_LAYOUT_SM,
    });
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }

  // Render funciones — uno por widget. Cada uno se monta dentro de un
  // contenedor `card` que la grid posiciona.
  const widgets = useMemo(() => buildWidgets(data, editing), [data, editing]);

  return (
    <div className="mt-8">
      {/* Toolbar de edición */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-2xs font-medium uppercase tracking-wider text-zinc-400">
          {editing
            ? "Arrastra los widgets para moverlos. Tira de la esquina inferior derecha para redimensionar."
            : "Tu dashboard"}
        </p>
        <div className="flex items-center gap-2">
          {editing && (
            <button
              type="button"
              onClick={resetLayout}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11.5px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              <RotateCcw className="h-3 w-3" />
              Resetear
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
              editing
                ? "brand-gradient text-white shadow-sm"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            {editing ? (
              <>
                <Check className="h-3 w-3" />
                Listo
              </>
            ) : (
              <>
                <Pencil className="h-3 w-3" />
                Editar layout
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mientras hidrata SSR, render skeleton para no flickear */}
      {!mounted ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card h-64 animate-pulse lg:col-span-2" />
          <div className="card h-64 animate-pulse" />
        </div>
      ) : (
        <ResponsiveGridLayout
          className={`layout ${editing ? "is-editing" : "is-readonly"}`}
          layouts={layouts}
          breakpoints={{ lg: 1024, md: 640, sm: 0 }}
          cols={{ lg: 12, md: 10, sm: 6 }}
          rowHeight={56}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          isDraggable={editing}
          isResizable={editing}
          compactType="vertical"
          preventCollision={false}
          draggableHandle=".widget-drag-handle"
          onLayoutChange={(_current, all) => {
            if (editing) {
              persistLayouts({
                lg: all.lg as Layout[],
                md: all.md as Layout[],
                sm: all.sm as Layout[],
              });
            }
          }}
        >
          {widgets.map((w) => (
            <div key={w.id} className="dashboard-widget">
              {w.node}
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {/* CSS base de react-grid-layout + react-resizable inyectado inline.
          NO se puede importar desde globals.css (ver nota allí: Tailwind v4
          descarta @imports posteriores). Sin estas reglas, el item
          arrastrado conserva `transition: all 200ms` y queda DESFASADO del
          cursor (animación en cada frame de drag). La regla clave es
          `.react-draggable-dragging { transition: none }`. */}
      <style jsx global>{`
        .react-grid-layout {
          position: relative;
          transition: height 200ms ease;
        }
        .react-grid-item {
          transition: all 200ms ease;
          transition-property: left, top, width, height;
        }
        .react-grid-item img {
          pointer-events: none;
          user-select: none;
        }
        .react-grid-item.cssTransforms {
          transition-property: transform, width, height;
        }
        .react-grid-item.resizing {
          transition: none;
          z-index: 1;
          will-change: width, height;
        }
        .react-grid-item.react-draggable-dragging {
          transition: none;
          z-index: 3;
          will-change: transform;
        }
        .react-grid-item.dropping {
          visibility: hidden;
        }
        .react-grid-item.react-grid-placeholder {
          background: red;
          opacity: 0.2;
          transition-duration: 100ms;
          z-index: 2;
          user-select: none;
        }
        .react-grid-item > .react-resizable-handle {
          position: absolute;
          width: 20px;
          height: 20px;
        }
        .react-grid-item > .react-resizable-handle::after {
          content: "";
          position: absolute;
          right: 3px;
          bottom: 3px;
          width: 5px;
          height: 5px;
          border-right: 2px solid rgba(0, 0, 0, 0.4);
          border-bottom: 2px solid rgba(0, 0, 0, 0.4);
        }
        .react-resizable-hide > .react-resizable-handle {
          display: none;
        }
        .react-grid-item > .react-resizable-handle.react-resizable-handle-se {
          bottom: 0;
          right: 0;
          cursor: se-resize;
        }
      `}</style>

      {/* Estilos del dashboard. Foco en feedback visual del drag — la
          lib default se ve plana. Aquí agregamos:
          - Items se reacomodan con cubic-bezier suave (no lineal feo).
          - Item arrastrado: lift con shadow + borde (sin transform para no
            desincronizar del cursor).
          - Placeholder: gradient brand + outline punteado animado.
          - Modo edición: borde dashed sutil + cursor grab/grabbing. */}
      <style jsx global>{`
        .dashboard-widget {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: white;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 16px;
          height: 100%;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          transition:
            box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1),
            border-color 180ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Reacomodo suave de los items que NO se mueven activamente */
        .react-grid-item.cssTransforms {
          transition-property: transform, width, height;
          transition-duration: 220ms;
          transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
        }
        /* El que estás arrastrando no debe tener transition o "patina" */
        .react-grid-item.react-draggable-dragging,
        .react-grid-item.resizing {
          transition: none !important;
          z-index: 50;
          will-change: transform;
        }

        /* MODO EDICIÓN — feedback de que algo es interactivo */
        .layout.is-editing .dashboard-widget {
          border-style: dashed;
          border-color: rgba(168, 85, 247, 0.35);
        }
        .layout.is-editing .dashboard-widget:hover {
          border-color: rgba(168, 85, 247, 0.6);
          box-shadow: 0 6px 20px -6px rgba(168, 85, 247, 0.22);
        }
        .layout.is-editing .widget-drag-handle {
          cursor: grab;
          user-select: none;
        }
        .layout.is-editing .widget-drag-handle:active {
          cursor: grabbing;
        }

        /* ITEM ARRASTRADO — feedback de "lift" SIN transform.
           Importante: react-grid-layout posiciona el item con translate3d
           y mide colisiones contra ese rect. Si le agregamos un transform
           extra (scale/rotate) en el card interno, el centro visual se
           desplaza del cursor y se siente "desincronizado". Solo
           cambiamos shadow + border + background — el transform queda
           limpio para la lib. */
        .react-grid-item.react-draggable-dragging .dashboard-widget {
          border-color: rgba(168, 85, 247, 0.9) !important;
          border-style: solid !important;
          background: #fefefe;
          box-shadow:
            0 24px 48px -12px rgba(168, 85, 247, 0.45),
            0 10px 20px -4px rgba(15, 23, 42, 0.15),
            0 0 0 1px rgba(168, 85, 247, 0.35);
          cursor: grabbing;
        }
        /* RESIZING — feedback distinto al drag */
        .react-grid-item.resizing .dashboard-widget {
          border-color: rgba(236, 72, 153, 0.7) !important;
          border-style: solid !important;
          box-shadow:
            0 12px 32px -8px rgba(236, 72, 153, 0.3),
            0 0 0 1px rgba(236, 72, 153, 0.2);
        }

        /* PLACEHOLDER — donde va a caer. Antes era casi invisible. */
        .react-grid-item.react-grid-placeholder {
          background: linear-gradient(
            135deg,
            rgba(168, 85, 247, 0.18),
            rgba(236, 72, 153, 0.18)
          ) !important;
          border: 2px dashed rgba(168, 85, 247, 0.55) !important;
          border-radius: 14px !important;
          opacity: 1 !important;
          transition-duration: 100ms !important;
          animation: dashboard-placeholder-pulse 1.4s ease-in-out infinite;
        }
        @keyframes dashboard-placeholder-pulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.65; }
        }

        /* HANDLE DE RESIZE — más visible y obvio en modo edición */
        .layout.is-readonly .react-resizable-handle {
          display: none;
        }
        .layout.is-editing .react-resizable-handle {
          width: 22px;
          height: 22px;
          background-image: none;
        }
        .layout.is-editing .react-resizable-handle::after {
          content: "";
          position: absolute;
          right: 5px;
          bottom: 5px;
          width: 10px;
          height: 10px;
          border-right: 2px solid rgba(168, 85, 247, 0.5);
          border-bottom: 2px solid rgba(168, 85, 247, 0.5);
          border-bottom-right-radius: 3px;
          transition: border-color 150ms ease;
        }
        .layout.is-editing .dashboard-widget:hover ~ * .react-resizable-handle::after,
        .layout.is-editing .react-grid-item:hover .react-resizable-handle::after {
          border-right-color: rgba(168, 85, 247, 0.9);
          border-bottom-color: rgba(168, 85, 247, 0.9);
        }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Widgets — funciones puras que devuelven JSX dadas las props
// ────────────────────────────────────────────────────────────────────────

type WidgetEntry = { id: string; node: React.ReactNode };

function buildWidgets(data: DashboardData, editing: boolean): WidgetEntry[] {
  return [
    { id: "brands",   node: <BrandsWidget data={data} editing={editing} /> },
    { id: "myTasks",  node: <MyTasksWidget data={data} editing={editing} /> },
    { id: "activity", node: <ActivityWidget data={data} editing={editing} /> },
    { id: "inbox",    node: <InboxWidget data={data} editing={editing} /> },
    { id: "pending",  node: <PendingWidget data={data} editing={editing} /> },
  ];
}

/** Header común de cada widget: título + drag handle + opcional accion right */
function WidgetHeader({
  icon: Icon,
  title,
  right,
  editing,
}: {
  icon: typeof Plus;
  title: string;
  right?: React.ReactNode;
  editing: boolean;
}) {
  return (
    <div className="widget-drag-handle flex flex-shrink-0 items-end justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
        {editing && (
          <GripVertical className="h-3.5 w-3.5 text-fuchsia-400" />
        )}
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h2>
      {right}
    </div>
  );
}

function BrandsWidget({ data, editing }: { data: DashboardData; editing: boolean }) {
  const { brands, perBrand, brandKpis, canCreateBrand } = data;
  return (
    <>
      <WidgetHeader
        icon={Layers}
        title="Marcas"
        editing={editing}
        right={<p className="text-[12px] text-zinc-500 tabular-nums">{brands.length}</p>}
      />
      <div className="mt-3 grid flex-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {brands.map((b, i) => {
          const stats = perBrand[b.id] ?? { total: 0, pending: 0, approved: 0 };
          const kpis = brandKpis[b.id];
          const bg = b.color ?? BRAND_COLORS[i % BRAND_COLORS.length];
          const tone = approvalRateTone(kpis?.approvalRate ?? null);
          return (
            <Link
              key={b.id}
              href={`/brands/${b.id}`}
              className="card group p-3 transition hover:border-zinc-300"
              onClick={(e) => {
                if (editing) e.preventDefault();
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid h-8 w-8 flex-shrink-0 place-items-center overflow-hidden rounded-md text-[12px] font-bold text-white"
                  style={{ background: bg }}
                >
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    b.name[0]?.toUpperCase()
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[13px] font-semibold text-zinc-900">
                    {b.name}
                  </h3>
                  <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-zinc-500">
                    <span className="tabular-nums">{stats.total} posts</span>
                    {stats.pending > 0 && (
                      <>
                        <span className="text-zinc-300">·</span>
                        <span className="flex items-center gap-1 text-rose-600">
                          <span className="h-1 w-1 rounded-full bg-rose-500" />
                          <span className="font-semibold tabular-nums">{stats.pending}</span>
                          <span>pend.</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
              </div>
              {kpis && (
                <div className="mt-2.5 flex items-center justify-between gap-3 border-t divider pt-2">
                  <div className="min-w-0">
                    <p className="text-3xs font-medium uppercase tracking-wider text-zinc-400">
                      Aprob. 7d
                    </p>
                    <p
                      className={`text-[12.5px] font-semibold tabular-nums ${APPROVAL_TONE_TEXT[tone]}`}
                    >
                      {kpis.approvalRate !== null ? `${kpis.approvalRate}%` : "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="text-3xs font-medium uppercase tracking-wider text-zinc-400">
                      Public. 7d · {kpis.publishedTotal}
                    </p>
                    <Sparkline
                      data={kpis.publishedSparkline}
                      stroke={bg}
                      width={70}
                      height={18}
                    />
                  </div>
                </div>
              )}
            </Link>
          );
        })}
        {canCreateBrand && <NewBrandTile />}
      </div>
    </>
  );
}

function MyTasksWidget({ data, editing }: { data: DashboardData; editing: boolean }) {
  const { myTasks, myTasksTotal } = data;
  return (
    <>
      <WidgetHeader
        icon={ListChecks}
        title="Mis tareas"
        editing={editing}
        right={
          <div className="flex items-center gap-2">
            {myTasksTotal > 0 && (
              <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-2xs font-semibold text-fuchsia-600 tabular-nums">
                {myTasksTotal}
              </span>
            )}
            <Link
              href="/tasks"
              className="text-[11.5px] font-semibold text-zinc-500 transition hover:text-zinc-900"
              onClick={(e) => {
                if (editing) e.preventDefault();
              }}
            >
              Ver todas →
            </Link>
          </div>
        }
      />
      <div className="mt-3 flex-1 overflow-y-auto">
        {myTasks.length === 0 ? (
          <div className="card p-5 text-center">
            <CheckSquare className="mx-auto h-6 w-6 text-zinc-300" />
            <p className="mt-2 text-[12.5px] font-medium text-zinc-700">
              No tienes tareas pendientes
            </p>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Cuando te asignen una tarea o crees alguna nueva, va a aparecer aquí.
            </p>
          </div>
        ) : (
          <ExpandableList initialCount={5}>
            {myTasks.map((t) => (
              <li key={t.id}>
                <Link
                  href="/tasks"
                  className="flex items-center gap-3 p-2.5 transition hover:bg-zinc-50"
                  onClick={(e) => {
                    if (editing) e.preventDefault();
                  }}
                >
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${TASK_PRIORITY_DOT[t.priority] ?? "bg-zinc-300"}`}
                    title={TASK_PRIORITY_LABEL[t.priority] ?? t.priority}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-zinc-900">
                      {t.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-2xs text-zinc-500">
                      <span>{TASK_STATUS_DASH_LABEL[t.status] ?? t.status}</span>
                      {t.brand && (
                        <>
                          <span className="text-zinc-300">·</span>
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: t.brand.color ?? "#a1a1aa" }}
                            />
                            <span className="truncate">{t.brand.name}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {t.dueDate && (
                    <span
                      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${dueBadgeClass(t.dueDate)}`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {formatDueShort(t.dueDate)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ExpandableList>
        )}
      </div>
    </>
  );
}

function ActivityWidget({ data, editing }: { data: DashboardData; editing: boolean }) {
  const { recentActivities } = data;
  return (
    <>
      <WidgetHeader icon={RefreshCw} title="Actividad reciente" editing={editing} />
      <div className="mt-3 flex-1 overflow-y-auto">
        {recentActivities.length === 0 ? (
          <div className="card p-5 text-center text-[12px] text-zinc-500">
            Aún no hay actividad
          </div>
        ) : (
          <ExpandableList initialCount={5}>
            {recentActivities.map((a) => {
              let meta: Record<string, unknown> = {};
              try { meta = JSON.parse(a.meta); } catch {}
              const desc = describeActivity(a.type, meta);
              const Icon = desc.icon;
              const actor = a.user?.name ?? a.user?.email ?? "Sistema";
              return (
                <li key={a.id}>
                  <Link
                    href={`/brands/${a.post.brandId}/posts/${a.post.id}`}
                    className="flex items-start gap-2.5 p-2.5 transition hover:bg-zinc-50"
                    onClick={(e) => {
                      if (editing) e.preventDefault();
                    }}
                  >
                    <span
                      className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-zinc-50 ring-1 ring-zinc-100 ${desc.tone}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-tight text-zinc-700">
                        <span className="font-semibold text-zinc-900">{actor}</span>{" "}
                        <span className={desc.tone}>{desc.label}</span>{" "}
                        <span className="text-zinc-500">en</span>{" "}
                        <span className="font-medium text-zinc-700">{a.post.brand.name}</span>
                      </p>
                      <p className="mt-0.5 text-2xs text-zinc-400 tabular-nums">
                        {formatRelative(a.createdAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ExpandableList>
        )}
      </div>
    </>
  );
}

function InboxWidget({ data, editing }: { data: DashboardData; editing: boolean }) {
  const { recentNotifications, unreadNotifCount } = data;
  return (
    <>
      <WidgetHeader
        icon={Bell}
        title="Inbox"
        editing={editing}
        right={
          unreadNotifCount > 0 ? (
            <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-2xs font-semibold text-fuchsia-600 tabular-nums">
              {unreadNotifCount} sin leer
            </span>
          ) : null
        }
      />
      <div className="mt-3 flex-1 overflow-y-auto">
        {recentNotifications.length === 0 ? (
          <div className="card p-5 text-center text-[12px] text-zinc-500">
            Sin notificaciones
          </div>
        ) : (
          <ul className="card divide-y divide-zinc-100/80 overflow-hidden">
            {recentNotifications.slice(0, 3).map((n) => {
              const desc = describeNotification(n.type);
              const Icon = desc.icon;
              const href =
                n.brandId && n.postId
                  ? `/brands/${n.brandId}/posts/${n.postId}`
                  : n.brandId
                    ? `/brands/${n.brandId}`
                    : "/inbox";
              return (
                <li key={n.id}>
                  <Link
                    href={href}
                    className={`flex items-start gap-2.5 p-2.5 transition hover:bg-zinc-50 ${
                      !n.read ? "bg-fuchsia-50/40" : ""
                    }`}
                    onClick={(e) => {
                      if (editing) e.preventDefault();
                    }}
                  >
                    <span
                      className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ring-1 ring-zinc-100 ${desc.tone}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[12px] leading-tight text-zinc-700">
                        {n.body}
                      </p>
                      <p className="mt-0.5 text-2xs text-zinc-400 tabular-nums">
                        {formatRelative(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fuchsia-500" />
                    )}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/inbox"
                className="flex items-center justify-center gap-1 px-3 py-2 text-2xs font-semibold text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                onClick={(e) => {
                  if (editing) e.preventDefault();
                }}
              >
                Ver todo el inbox
                <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          </ul>
        )}
      </div>
    </>
  );
}

function PendingWidget({ data, editing }: { data: DashboardData; editing: boolean }) {
  const { pendingPosts, inReviewCount } = data;
  return (
    <>
      <WidgetHeader
        icon={Clock}
        title="Por revisar"
        editing={editing}
        right={
          inReviewCount > 0 ? (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-2xs font-semibold text-rose-600 tabular-nums">
              {inReviewCount}
            </span>
          ) : null
        }
      />
      <div className="mt-3 flex-1 overflow-y-auto">
        {pendingPosts.length === 0 ? (
          <div className="card p-5 text-center text-[12px] text-zinc-500">
            ✨ Todo al día
          </div>
        ) : (
          <ExpandableList initialCount={5}>
            {pendingPosts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/brands/${p.brandId}/posts/${p.id}`}
                  className="flex items-center gap-2.5 p-2.5 transition hover:bg-zinc-50"
                  onClick={(e) => {
                    if (editing) e.preventDefault();
                  }}
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 text-3xs text-zinc-400">
                      <ImageIcon className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-zinc-900">
                      {p.brand.name}
                    </p>
                    <p className="truncate text-2xs text-zinc-500">
                      {p.caption || "Sin caption"}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-medium ${STATUS_COLOR[p.status] ?? "bg-zinc-200"}`}
                  >
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </Link>
              </li>
            ))}
          </ExpandableList>
        )}
      </div>
    </>
  );
}
