"use client";

/**
 * Tablero Kanban de tareas internas del equipo. 4 columnas fijas con
 * drag-and-drop HTML5 nativo entre ellas.
 *
 * Decisiones de diseño:
 *  - DnD nativo en lugar de @dnd-kit para no agregar 80KB de deps. Funciona
 *    bien para <100 cards por columna. Si en el futuro queremos sortable
 *    keyboard / accesibilidad mejorada, migramos a dnd-kit sin tocar API.
 *  - Estado local optimista: drag → reordena en memoria → POST reorder en
 *    background. Si falla, revierte y muestra toast.
 *  - El detalle de cada tarea se abre en un drawer lateral derecho — no
 *    bloquea la vista del tablero como un modal.
 *  - Crear tarea: botón fijo top-right que abre un modal centrado.
 *  - Filtros viven en una barra encima del board (sticky).
 */

import { useMemo, useState, useEffect, useRef, createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  X,
  Filter,
  User as UserIcon,
  UserPlus,
  Calendar as CalendarIcon,
  Clock,
  Flag,
  Circle,
  ListChecks,
  Trash2,
  CheckCircle2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  Inbox as InboxIcon,
  MoveRight,
  MoreHorizontal,
  MoreVertical,
  Copy,
  ArrowUpDown,
  AlertCircle,
  Eraser,
  CornerDownLeft,
  CalendarDays,
  Repeat,
  Tag,
  Tags,
  GripVertical,
  Search,
  Pencil,
  Settings2,
  Zap,
} from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TASK_COLOR_PALETTE,
  DEFAULT_STATUS_COLORS,
  DEFAULT_TASK_COLUMNS,
  MAX_TASK_COLUMNS,
  makeColumnId,
  type TaskStatus,
  type TaskPriority,
  type TaskColor,
  type TaskColumn,
} from "@/lib/tasks-types";
import { DescriptionEditor } from "./DescriptionEditor";
import { ViewSwitcher, type BoardView } from "./ViewSwitcher";
import { TasksListView } from "./TasksListView";
import { TasksCalendarView } from "./TasksCalendarView";
import { TasksWeekView } from "./TasksWeekView";
import { TeamWorkload } from "./TeamWorkload";
import { TaskTemplatesModal } from "./TaskTemplatesModal";
import { TaskActivityComments } from "./TaskActivityComments";
import { TaskAttachments } from "./TaskAttachments";
import { TrashModal } from "./TrashModal";
import PresenceIndicator from "@/components/PresenceIndicator";
import {
  TaskSpotlight,
  useSpotlight,
  useGlobalShortcuts,
} from "./TaskSpotlight";
import type { TaskItem, TaskUser } from "./types";
import { useModKey } from "@/lib/platform";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  PickerPopover,
  PickerItem,
  PickerSection,
  PickerCreateButton,
  PickerSearchInput,
  PickerEmpty,
  PickerDivider,
  type PickerOption,
} from "@/components/Picker";

type User = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

type Brand = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
};

type Subtask = {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  position: number;
  createdAt: string;
};

type TaskTag = {
  id: string;
  name: string;
  color: string;
};

type Task = {
  id: string;
  agencyId: string;
  brandId: string | null;
  postId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Legacy single assignee — usar `effectiveAssignees(task)` para leer. */
  assigneeId: string | null;
  creatorId: string;
  dueDate: string | null;
  recurrence: string | null;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Legacy single assignee — usar `effectiveAssignees(task)`. */
  assignee: User | null;
  /** Multi-assignee (M2M) — fuente de verdad. */
  assignees: User[];
  creator: User | null;
  brand: Brand | null;
  post: {
    id: string;
    title: string | null;
    caption: string;
    imageUrl: string | null;
    assetType: string;
    platform: string;
    postType: string;
    sourceUrl: string | null;
    images: { url: string }[];
  } | null;
  subtasks: Subtask[];
  tags: TaskTag[];
};

/**
 * Devuelve la lista de assignees efectiva para una task. Si `assignees`
 * (M2M) tiene datos, usa eso. Sino, fallback al legacy single `assignee`.
 * Permite mostrar correctamente tareas creadas antes de la migración a M2M.
 */
function effectiveAssignees(task: Task): User[] {
  if (task.assignees.length > 0) return task.assignees;
  if (task.assignee) return [task.assignee];
  return [];
}

/**
 * Estilo ClickUp: cada estado se representa con un "status pill" en el
 * header de la columna (tinte suave + texto del color), un dot, y el color
 * del botón "+ Nueva tarea". Sin barras de colores en las cards.
 */
/**
 * Map estático de cada color de la paleta → classes Tailwind concretas.
 * NECESITA estar declarado completo para que Tailwind no purgue las classes
 * (no podemos construir `bg-${color}-500` dinámicamente — se borraría en
 * production).
 *
 * Cada entry tiene las 6 variantes que el board necesita: pill, softBg,
 * accent, ring, barFill, shadowHex.
 */
type ColumnMetaEntry = {
  pill: string;
  softBg: string;
  accent: string;
  ring: string;
  barFill: string;
  shadowHex: string;
};

const COLOR_META: Record<TaskColor, ColumnMetaEntry> = {
  slate: { pill: "bg-slate-400", softBg: "bg-slate-100/80", accent: "text-slate-500 hover:bg-slate-200/70", ring: "ring-slate-300", barFill: "bg-gradient-to-r from-slate-300 to-slate-400", shadowHex: "100, 116, 139" },
  red: { pill: "bg-red-500", softBg: "bg-red-50", accent: "text-red-600 hover:bg-red-100/70", ring: "ring-red-300", barFill: "bg-gradient-to-r from-red-400 to-rose-400", shadowHex: "239, 68, 68" },
  orange: { pill: "bg-orange-500", softBg: "bg-orange-50", accent: "text-orange-600 hover:bg-orange-100/70", ring: "ring-orange-300", barFill: "bg-gradient-to-r from-orange-400 to-amber-400", shadowHex: "249, 115, 22" },
  amber: { pill: "bg-amber-500", softBg: "bg-amber-50", accent: "text-amber-600 hover:bg-amber-100/70", ring: "ring-amber-300", barFill: "bg-gradient-to-r from-amber-400 to-yellow-400", shadowHex: "245, 158, 11" },
  yellow: { pill: "bg-yellow-500", softBg: "bg-yellow-50", accent: "text-yellow-700 hover:bg-yellow-100/70", ring: "ring-yellow-300", barFill: "bg-gradient-to-r from-yellow-400 to-amber-400", shadowHex: "234, 179, 8" },
  lime: { pill: "bg-lime-500", softBg: "bg-lime-50", accent: "text-lime-700 hover:bg-lime-100/70", ring: "ring-lime-300", barFill: "bg-gradient-to-r from-lime-400 to-green-400", shadowHex: "132, 204, 22" },
  emerald: { pill: "bg-emerald-500", softBg: "bg-emerald-50", accent: "text-emerald-600 hover:bg-emerald-100/70", ring: "ring-emerald-300", barFill: "bg-gradient-to-r from-emerald-400 to-teal-400", shadowHex: "16, 185, 129" },
  teal: { pill: "bg-teal-500", softBg: "bg-teal-50", accent: "text-teal-600 hover:bg-teal-100/70", ring: "ring-teal-300", barFill: "bg-gradient-to-r from-teal-400 to-cyan-400", shadowHex: "20, 184, 166" },
  cyan: { pill: "bg-cyan-500", softBg: "bg-cyan-50", accent: "text-cyan-600 hover:bg-cyan-100/70", ring: "ring-cyan-300", barFill: "bg-gradient-to-r from-cyan-400 to-sky-400", shadowHex: "6, 182, 212" },
  sky: { pill: "bg-sky-500", softBg: "bg-sky-50", accent: "text-sky-600 hover:bg-sky-100/70", ring: "ring-sky-300", barFill: "bg-gradient-to-r from-sky-400 to-blue-400", shadowHex: "14, 165, 233" },
  blue: { pill: "bg-blue-500", softBg: "bg-blue-50", accent: "text-blue-600 hover:bg-blue-100/70", ring: "ring-blue-300", barFill: "bg-gradient-to-r from-blue-400 to-cyan-400", shadowHex: "59, 130, 246" },
  indigo: { pill: "bg-indigo-500", softBg: "bg-indigo-50", accent: "text-indigo-600 hover:bg-indigo-100/70", ring: "ring-indigo-300", barFill: "bg-gradient-to-r from-indigo-400 to-violet-400", shadowHex: "99, 102, 241" },
  violet: { pill: "bg-violet-500", softBg: "bg-violet-50", accent: "text-violet-600 hover:bg-violet-100/70", ring: "ring-violet-300", barFill: "bg-gradient-to-r from-violet-400 to-fuchsia-400", shadowHex: "139, 92, 246" },
  fuchsia: { pill: "bg-fuchsia-500", softBg: "bg-fuchsia-50", accent: "text-fuchsia-600 hover:bg-fuchsia-100/70", ring: "ring-fuchsia-300", barFill: "bg-gradient-to-r from-fuchsia-400 to-pink-400", shadowHex: "217, 70, 239" },
  pink: { pill: "bg-pink-500", softBg: "bg-pink-50", accent: "text-pink-600 hover:bg-pink-100/70", ring: "ring-pink-300", barFill: "bg-gradient-to-r from-pink-400 to-rose-400", shadowHex: "236, 72, 153" },
  rose: { pill: "bg-rose-500", softBg: "bg-rose-50", accent: "text-rose-600 hover:bg-rose-100/70", ring: "ring-rose-300", barFill: "bg-gradient-to-r from-rose-400 to-red-400", shadowHex: "244, 63, 94" },
};

/** Construye el COLUMN_META (keyed by column id) desde la lista de columnas
 *  activas. Cada columna aporta su color. Memorizado en el componente. */
function buildColumnMeta(
  cols: TaskColumn[],
): Record<string, ColumnMetaEntry> {
  const out: Record<string, ColumnMetaEntry> = {};
  for (const c of cols) {
    out[c.id] = COLOR_META[c.color] ?? COLOR_META.slate;
  }
  return out;
}

/** Map id → label desde la lista de columnas. */
function buildLabelMap(cols: TaskColumn[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cols) out[c.id] = c.label;
  return out;
}

/** Context para que cualquier componente del board acceda al COLUMN_META
 *  activo sin pasarlo como prop por toda la jerarquía. */
const ColumnMetaContext = createContext<Record<string, ColumnMetaEntry>>(
  buildColumnMeta(DEFAULT_TASK_COLUMNS),
);
/** Context con la lista de columnas + helper para resolver labels. Las child
 *  components lo usan para mostrar el nombre de la columna (antes
 *  TASK_STATUS_LABEL fijo). */
const ColumnsListContext = createContext<{
  columns: TaskColumn[];
  labelFor: (id: string) => string;
}>({
  columns: DEFAULT_TASK_COLUMNS,
  labelFor: (id) => id,
});
const StatusColorsContext = createContext<{
  colors: Record<string, TaskColor>;
  setColor: (s: TaskStatus, c: TaskColor) => void;
  canEdit: boolean;
}>({
  colors: {},
  setColor: () => {},
  canEdit: false,
});

export function useColumnMeta() {
  return useContext(ColumnMetaContext);
}
export function useColumnsList() {
  return useContext(ColumnsListContext);
}
function useStatusColors() {
  return useContext(StatusColorsContext);
}

/**
 * Prioridad estilo ClickUp: banderita (Flag icon) de color. Urgente=rojo,
 * Alta=ámbar, Normal=azul, Baja=gris. En las cards solo se muestra la
 * banderita para high/urgent (las normales no ensucian). En el modal/drawer
 * se muestran todas.
 */
const PRIORITY_META: Record<
  TaskPriority,
  { label: string; flag: string; showOnCard: boolean }
> = {
  low: { label: "Baja", flag: "text-zinc-400", showOnCard: false },
  normal: { label: "Normal", flag: "text-blue-500", showOnCard: false },
  high: { label: "Alta", flag: "text-amber-500", showOnCard: true },
  urgent: { label: "Urgente", flag: "text-rose-500", showOnCard: true },
};

/** Estilos de los chips de prioridad clickeables en el header de columna.
 *  `idle` = pill suave; `activeBg` = fondo sólido cuando el filtro está on. */
const PRIORITY_CHIP: Record<
  TaskPriority,
  { label: string; idle: string; activeBg: string }
> = {
  urgent: {
    label: "Urgente",
    idle: "bg-rose-100/80 text-rose-700 hover:bg-rose-200",
    activeBg: "bg-rose-500",
  },
  high: {
    label: "Alta",
    idle: "bg-amber-100/80 text-amber-700 hover:bg-amber-200",
    activeBg: "bg-amber-500",
  },
  normal: {
    label: "Normal",
    idle: "bg-blue-100/80 text-blue-700 hover:bg-blue-200",
    activeBg: "bg-blue-500",
  },
  low: {
    label: "Baja",
    idle: "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
    activeBg: "bg-zinc-500",
  },
};

function initials(u: { name: string | null; email: string } | null): string {
  if (!u) return "?";
  const base = u.name?.trim() || u.email;
  const parts = base.split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function avatarBg(userId: string | null | undefined): string {
  if (!userId) return "bg-zinc-300";
  // Hash simple → 1 de 6 colores sólidos estables por user (estilo ClickUp)
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % 6;
  return [
    "bg-fuchsia-500",
    "bg-violet-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
  ][idx];
}

/**
 * Avatar consistente: usa la foto del user si existe (avatarUrl), sino
 * fallback a iniciales sobre un fondo coloreado estable (hash del id).
 *
 * Tamaños predefinidos para mantener consistencia visual:
 *   xs: 16px  (filtros, popovers chiquitos)
 *   sm: 20px  (avatares apilados del header de columna)
 *   md: 24px  (cards, drawer, default)
 *   lg: 32px  (placeholder futuro — headers grandes)
 */
type AvatarSize = "xs" | "sm" | "md" | "lg";
const AVATAR_SIZES: Record<
  AvatarSize,
  { box: string; text: string; img: number }
> = {
  xs: { box: "h-4 w-4", text: "text-[8px]", img: 16 },
  sm: { box: "h-5 w-5", text: "text-[8px]", img: 20 },
  md: { box: "h-6 w-6", text: "text-[9px]", img: 24 },
  lg: { box: "h-8 w-8", text: "text-2xs", img: 32 },
};

function Avatar({
  user,
  size = "md",
  ring = false,
  className = "",
  title,
}: {
  user: User | null;
  size?: AvatarSize;
  /** Si true, agrega ring-2 ring-white (útil cuando van apilados). */
  ring?: boolean;
  className?: string;
  title?: string;
}) {
  const s = AVATAR_SIZES[size];
  const ringCls = ring ? "ring-2 ring-white" : "";
  const tooltipText = title ?? user?.name ?? user?.email ?? undefined;

  if (user?.avatarUrl) {
    // Usamos <img> en lugar de next/image para evitar el overhead de
    // optimización en avatares chiquitos (24px) y porque las URLs pueden
    // ser de Cloudflare R2 con paths variados. Lazy + objet-cover.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={tooltipText ?? "Avatar"}
        title={tooltipText}
        loading="lazy"
        width={s.img}
        height={s.img}
        className={`flex-shrink-0 rounded-full object-cover ${s.box} ${ringCls} ${className}`}
      />
    );
  }
  return (
    <span
      className={`grid flex-shrink-0 place-items-center rounded-full font-bold text-white ${s.box} ${s.text} ${avatarBg(user?.id)} ${ringCls} ${className}`}
      title={tooltipText}
    >
      {initials(user)}
    </span>
  );
}

function dueDateLabel(iso: string | null): {
  label: string;
  tone: "neutral" | "warn" | "danger";
} | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / (60 * 60 * 1000);
  const diffD = diffH / 24;
  if (diffMs < 0)
    return { label: `Venció ${formatShort(d)}`, tone: "danger" };
  if (diffH < 24)
    return { label: `Vence hoy`, tone: "warn" };
  if (diffD < 2) return { label: `Vence mañana`, tone: "warn" };
  return { label: formatShort(d), tone: "neutral" };
}
function formatShort(d: Date): string {
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** Tiempo relativo compacto: "ahora", "hace 5m", "hace 3h", "hace 2d", o fecha. */
function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${Math.floor(diffMin)}m`;
  const h = diffMin / 60;
  if (h < 24) return `hace ${Math.floor(h)}h`;
  const days = h / 24;
  if (days < 7) return `hace ${Math.floor(days)}d`;
  return formatShort(d);
}

/** Ref corta tipo Linear/ClickUp a partir del id (últimos 4 chars). */
function taskRef(id: string): string {
  return id.slice(-4).toUpperCase();
}

/** Convierte HTML (de TipTap) a texto plano para previews compactos
 *  (cards del Kanban). Decodifica entidades básicas y colapsa whitespace.
 *  Si el input ya es texto plano, lo devuelve tal cual. */
function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  // Rápido: sin tags HTML, no toca nada
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** True si un color hex es oscuro (luma < 130). Usado para decidir si un
 *  color de marca sirve como texto sobre fondo claro o necesita fallback. */
function isDarkHex(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length < 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // Luma perceptual (Rec. 709)
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 130;
}

export default function TasksBoard({
  currentUserId,
  initialTasks,
  brands: initialBrands,
  members,
  canWrite,
  canAssign,
  initialStatusColors,
  initialColumns,
  initialTags,
}: {
  currentUserId: string;
  currentUserName: string;
  initialTasks: Task[];
  brands: Brand[];
  members: User[];
  canWrite: boolean;
  canAssign: boolean;
  initialStatusColors: Record<TaskStatus, TaskColor>;
  initialColumns: TaskColumn[];
  initialTags: TaskTag[];
}) {
  const { confirm, alert } = useConfirm();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [brands, setBrands] = useState<Brand[]>(initialBrands);
  const [allTags, setAllTags] = useState<TaskTag[]>(initialTags);

  /** Agrega una marca nueva a la lista local sin re-fetch. Llamado desde el
   *  BrandPopover cuando el user crea una. */
  function handleBrandCreated(b: Brand) {
    setBrands((cur) => {
      if (cur.some((x) => x.id === b.id)) return cur;
      return [...cur, b].sort((a, c) => a.name.localeCompare(c.name));
    });
  }
  /** Agrega una tag nueva a la lista local. */
  function handleTagCreated(t: TaskTag) {
    setAllTags((cur) => {
      if (cur.some((x) => x.id === t.id)) return cur;
      return [...cur, t].sort((a, b) => a.name.localeCompare(b.name));
    });
  }
  /** Reemplaza una tag en la lista local + en cada tarea que la tenía
   *  (porque el nombre o color cambió). */
  function handleTagUpdated(t: TaskTag) {
    setAllTags((cur) =>
      cur
        .map((x) => (x.id === t.id ? t : x))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setTasks((cur) =>
      cur.map((task) => ({
        ...task,
        tags: task.tags.map((tg) => (tg.id === t.id ? t : tg)),
      })),
    );
  }
  /** Quita una tag de la lista local + de cada tarea que la usaba. Si era
   *  el filtro activo, lo resetea para no dejar el board vacío. */
  function handleTagDeleted(tagId: string) {
    setAllTags((cur) => cur.filter((x) => x.id !== tagId));
    setTasks((cur) =>
      cur.map((task) => ({
        ...task,
        tags: task.tags.filter((tg) => tg.id !== tagId),
      })),
    );
    if (filterTag === tagId) setFilterTag("all");
  }
  /** Reemplaza el set de assignees de una tarea (multi). Optimistic + PUT. */
  async function setTaskAssignees(taskId: string, userIds: string[]) {
    const assigneesForTask = members.filter((m) => userIds.includes(m.id));
    const prev = tasks;
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId
          ? {
              ...t,
              assignees: assigneesForTask,
              assigneeId: userIds[0] ?? null,
              assignee: userIds[0] ? assigneesForTask[0] ?? null : null,
            }
          : t,
      ),
    );
    try {
      const res = await fetch(`/api/tasks/${taskId}/assignees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      // El server puede haber auto-movido la tarea (regla por asignado).
      const movedStatus = typeof j.status === "string" ? j.status : undefined;
      setTasks((cur) =>
        cur.map((t) =>
          t.id === taskId
            ? {
                ...t,
                assignees: j.assignees,
                assigneeId: j.assignees[0]?.id ?? null,
                assignee: j.assignees[0] ?? null,
                ...(movedStatus
                  ? { status: movedStatus, completedAt: j.completedAt ?? null }
                  : {}),
              }
            : t,
        ),
      );
      if (movedStatus) {
        const col = columns.find((c) => c.id === movedStatus);
        if (col) toast.success(`Movida a "${col.label}" por una regla`);
      }
    } catch {
      setTasks(prev);
      toast.error("No se pudo guardar asignados");
    }
  }

  /** Reemplaza el set de tags de una tarea (optimistic + PUT). */
  async function setTaskTags(taskId: string, tagIds: string[]) {
    const tagsForTask = allTags.filter((t) => tagIds.includes(t.id));
    const prev = tasks;
    setTasks((cur) =>
      cur.map((t) => (t.id === taskId ? { ...t, tags: tagsForTask } : t)),
    );
    try {
      const res = await fetch(`/api/tasks/${taskId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      setTasks((cur) =>
        cur.map((t) => (t.id === taskId ? { ...t, tags: j.tags } : t)),
      );
    } catch {
      setTasks(prev);
      toast.error("No se pudo guardar etiquetas");
    }
  }
  // === Columnas dinámicas ===
  const [columns, setColumns] = useState<TaskColumn[]>(initialColumns);
  // Derivados: COLUMN_META (keyed by id), label map, colors map.
  const COLUMN_META = useMemo(() => buildColumnMeta(columns), [columns]);
  const labelMap = useMemo(() => buildLabelMap(columns), [columns]);
  const statusColors = useMemo(() => {
    const out: Record<string, TaskColor> = {};
    for (const c of columns) out[c.id] = c.color;
    return out;
  }, [columns]);
  const labelFor = useMemo(
    () => (id: string) => labelMap[id] ?? TASK_STATUS_LABEL[id] ?? id,
    [labelMap],
  );

  /**
   * Persiste el set completo de columnas (optimistic). `reassign` mapea ids
   * de columnas eliminadas → destino para mover sus tareas. Si el server
   * responde 409 (columna con tareas sin reasignar), revierte y avisa.
   */
  async function saveColumns(
    next: TaskColumn[],
    reassign?: Record<string, string>,
  ): Promise<boolean> {
    const prev = columns;
    setColumns(next);
    try {
      const res = await fetch("/api/agency/task-columns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: next, reassign }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "No se pudo guardar");
      }
      const j = await res.json();
      if (Array.isArray(j.columns)) setColumns(j.columns);
      return true;
    } catch (e) {
      setColumns(prev);
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      return false;
    }
  }

  /** Cambia el color de una columna (va a través de saveColumns). */
  async function setStatusColor(s: TaskStatus, c: TaskColor) {
    const next = columns.map((col) =>
      col.id === s ? { ...col, color: c } : col,
    );
    await saveColumns(next);
  }

  /** Crea una columna nueva al final (antes de la "final" si existe). */
  async function addColumn() {
    if (columns.length >= MAX_TASK_COLUMNS) {
      toast.error(`Máximo ${MAX_TASK_COLUMNS} columnas`);
      return;
    }
    const palette: TaskColor[] = [
      "violet", "cyan", "amber", "rose", "lime", "indigo", "pink", "teal",
    ];
    const used = new Set(columns.map((c) => c.color));
    const color = palette.find((c) => !used.has(c)) ?? "violet";
    const col: TaskColumn = {
      id: makeColumnId(),
      label: "Nueva columna",
      color,
      isDone: false,
    };
    // Insertar antes de la primera columna "final" para que "Hechas" quede
    // siempre al final.
    const doneIdx = columns.findIndex((c) => c.isDone);
    const next =
      doneIdx === -1
        ? [...columns, col]
        : [...columns.slice(0, doneIdx), col, ...columns.slice(doneIdx)];
    await saveColumns(next);
  }

  /** Renombra una columna. */
  async function renameColumn(id: string, label: string) {
    const clean = label.trim().slice(0, 30);
    if (!clean) return;
    const next = columns.map((c) => (c.id === id ? { ...c, label: clean } : c));
    await saveColumns(next);
  }

  /** Marca/desmarca una columna como "final" (completado). Garantiza que
   *  siempre quede al menos una final. */
  async function toggleColumnDone(id: string) {
    const target = columns.find((c) => c.id === id);
    if (!target) return;
    if (target.isDone && columns.filter((c) => c.isDone).length === 1) {
      toast.error("Debe quedar al menos una columna final");
      return;
    }
    const next = columns.map((c) =>
      c.id === id ? { ...c, isDone: !c.isDone } : c,
    );
    await saveColumns(next);
  }

  /** Reemplaza una columna completa (desde el modal de configuración). */
  async function updateColumn(next: TaskColumn) {
    const replaced = columns.map((c) => (c.id === next.id ? next : c));
    // Si esta columna pasó a ser final y era la única, garantizar consistencia
    // (el server también lo valida).
    await saveColumns(replaced);
  }

  /** Crea una columna "por cliente": "[Marca] · Hechas" con regla
   *  { brandId, whenDone } ya configurada + marcada como final. */
  async function addClientColumn(brand: Brand) {
    if (columns.length >= MAX_TASK_COLUMNS) {
      toast.error(`Máximo ${MAX_TASK_COLUMNS} columnas`);
      return;
    }
    const palette: TaskColor[] = [
      "emerald", "teal", "cyan", "lime", "violet", "indigo", "pink", "amber",
    ];
    const used = new Set(columns.map((c) => c.color));
    const color = palette.find((c) => !used.has(c)) ?? "emerald";
    const col: TaskColumn = {
      id: makeColumnId(),
      label: `${brand.name} · Hechas`.slice(0, 30),
      color,
      isDone: true,
      rule: { brandId: brand.id, whenDone: true, priority: null, assigneeId: null },
      wipLimit: null,
      autoArchiveDays: null,
    };
    await saveColumns([...columns, col]);
    toast.success(`Columna para ${brand.name} creada`);
  }

  /** Reordena columnas: mueve `id` a la posición `toIndex`. */
  async function reorderColumns(id: string, toIndex: number) {
    const fromIndex = columns.findIndex((c) => c.id === id);
    if (fromIndex === -1 || fromIndex === toIndex) return;
    const next = [...columns];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await saveColumns(next);
  }

  /**
   * Elimina una columna. SOLO si está vacía — si tiene tareas, muestra un
   * alert pidiendo vaciarla primero. Bloquea borrar la última columna.
   */
  async function deleteColumn(id: string) {
    if (columns.length <= 1) {
      await alert({
        title: "No se puede eliminar",
        description: "Tiene que quedar al menos una columna en el tablero.",
        variant: "warning",
      });
      return;
    }
    const col = columns.find((c) => c.id === id);
    if (!col) return;
    const tasksInCol = tasks.filter((t) => t.status === id).length;

    // Bloquear si tiene tareas — el user debe moverlas o completarlas primero.
    if (tasksInCol > 0) {
      await alert({
        title: "La columna tiene tareas",
        description: `"${col.label}" tiene ${tasksInCol} ${
          tasksInCol === 1 ? "tarea" : "tareas"
        }. Movelas a otra columna (o eliminalas) antes de borrar la columna. Solo se pueden eliminar columnas vacías.`,
        variant: "warning",
      });
      return;
    }

    const ok = await confirm({
      title: `¿Eliminar la columna "${col.label}"?`,
      description: "La columna está vacía. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    await saveColumns(columns.filter((c) => c.id !== id));
  }
  const [filterMine, setFilterMine] = useState(false);
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [trashOpen, setTrashOpen] = useState(false);
  // Columna cuyo modal de configuración está abierto.
  const [settingsColId, setSettingsColId] = useState<string | null>(null);

  /** Re-fetch las tareas activas (sin papelera). Lo llamamos después de
   *  restaurar una tarea desde el TrashModal — más simple que pegar GET por
   *  id y mergear. */
  async function refetchTasks() {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) return;
      const j = await res.json();
      if (Array.isArray(j.tasks)) setTasks(j.tasks);
    } catch {}
  }
  // Vista del board: Kanban (default), Lista o Calendario.
  const [view, setView] = useState<BoardView>("kanban");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tasks-view");
      if (raw === "kanban" || raw === "list" || raw === "calendar" || raw === "week")
        setView(raw);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("tasks-view", view);
    } catch {}
  }, [view]);
  // Estado por columna: collapsed + sortBy. Persiste en localStorage para que
  // las preferencias del user se mantengan entre sesiones.
  type ColSort = "position" | "priority" | "due" | "alpha";
  const [collapsed, setCollapsed] = useState<Record<TaskStatus, boolean>>({
    todo: false,
    in_progress: false,
    review: false,
    done: false,
  });
  const [sortBy, setSortBy] = useState<Record<TaskStatus, ColSort>>({
    todo: "position",
    in_progress: "position",
    review: "position",
    done: "position",
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tasks-col-prefs");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          collapsed?: Record<TaskStatus, boolean>;
          sortBy?: Record<TaskStatus, ColSort>;
        };
        if (parsed.collapsed) setCollapsed(parsed.collapsed);
        if (parsed.sortBy) setSortBy(parsed.sortBy);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "tasks-col-prefs",
        JSON.stringify({ collapsed, sortBy }),
      );
    } catch {}
  }, [collapsed, sortBy]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Abrir una tarea directo desde la URL (?open=<taskId>). Lo usan las
  // notificaciones (campana, toast, email) para el click-through a la tarea.
  // OJO: depende de useSearchParams (no de window.location en mount) para
  // que funcione TAMBIÉN con navegación client-side — antes, si ya estabas
  // en /tasks y clickeabas una notificación, el efecto no se re-ejecutaba y
  // la tarea no se abría. Limpiamos el param después para que un refresh no
  // la re-abra.
  const searchParams = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    // &draft=1: la tarea se creó en otra pantalla (ej. "Crear tarea" desde
    // un post) y todavía está vacía — entra al mismo flujo de borrador que
    // createAndOpen: si se cierra sin llenar nada, se descarta sola.
    if (searchParams.get("draft") === "1") draftIdsRef.current.add(openId);
    setOpenTaskId(openId);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("open");
    params.delete("draft");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    );
  }, [searchParams]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const assignees = effectiveAssignees(t);
      const assigneeIds = assignees.map((a) => a.id);
      if (filterMine && !assigneeIds.includes(currentUserId)) return false;
      if (filterBrand === "none" && t.brandId !== null) return false;
      else if (
        filterBrand !== "all" &&
        filterBrand !== "none" &&
        t.brandId !== filterBrand
      )
        return false;
      if (filterAssignee === "none" && assigneeIds.length > 0) return false;
      else if (
        filterAssignee !== "all" &&
        filterAssignee !== "none" &&
        !assigneeIds.includes(filterAssignee)
      )
        return false;
      if (filterPriority !== "all" && t.priority !== filterPriority)
        return false;
      // Filtro por etiqueta: la tarea debe TENER la tag seleccionada.
      // "none" = tareas sin ninguna etiqueta.
      if (filterTag === "none" && t.tags.length > 0) return false;
      else if (
        filterTag !== "all" &&
        filterTag !== "none" &&
        !t.tags.some((tg) => tg.id === filterTag)
      )
        return false;
      return true;
    });
  }, [
    tasks,
    filterMine,
    filterBrand,
    filterAssignee,
    filterPriority,
    filterTag,
    currentUserId,
  ]);

  const tasksByCol = useMemo(() => {
    // Map dinámico: una entrada por columna activa. Las tareas con un status
    // que ya no existe como columna (edge: columna borrada en otra sesión)
    // caen en un bucket extra que no se renderiza.
    const map: Record<string, Task[]> = {};
    for (const c of columns) map[c.id] = [];
    for (const t of filteredTasks) {
      (map[t.status] ??= []).push(t);
    }
    const prioRank: Record<TaskPriority, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3,
    };
    for (const c of columns) {
      const k = c.id;
      const mode = sortBy[k];
      map[k].sort((a, b) => {
        if (mode === "priority") {
          const ra = prioRank[a.priority] ?? 99;
          const rb = prioRank[b.priority] ?? 99;
          if (ra !== rb) return ra - rb;
          return a.position - b.position;
        }
        if (mode === "due") {
          // Sin due al final
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          if (da !== db) return da - db;
          return a.position - b.position;
        }
        if (mode === "alpha") {
          return a.title.localeCompare(b.title, "es");
        }
        return a.position - b.position;
      });
    }
    return map;
  }, [filteredTasks, sortBy]);

  // === DRAG-AND-DROP ===
  const dragRef = useRef<{ taskId: string; sourceStatus: TaskStatus } | null>(
    null,
  );
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Reordenar columnas: id de la columna que se está arrastrando.
  const [colDragId, setColDragId] = useState<string | null>(null);
  // Índice destino (en el array SIN la columna arrastrada) donde caería.
  const [colDropIndex, setColDropIndex] = useState<number | null>(null);
  // Ancho de un "slot" de columna (ancho + gap) — medido al iniciar el drag,
  // para calcular cuánto se corre cada columna y abrir el hueco.
  const colSlotRef = useRef<number>(316);
  // Centros X (clientX) de cada columna capturados al iniciar el drag, SIN
  // transform. Usarlos (en vez de getBoundingClientRect en vivo) evita el
  // bucle: si midiéramos las columnas ya desplazadas, el índice oscilaría.
  const colCentersRef = useRef<number[]>([]);
  // Ghost flotante custom: en vez del drag-image nativo (que sale borroso /
  // recortado), ocultamos el nativo y renderizamos NUESTRA card flotante
  // que sigue al mouse. Se ve nítida, completa, con sombra de "lift".
  const [dragGhost, setDragGhost] = useState<{
    html: string; // outerHTML del elemento al momento de agarrarlo
    width: number;
    grabX: number; // offset del cursor dentro del elemento (x)
    grabY: number; // offset del cursor dentro del elemento (y)
    kind: "task" | "column"; // para estilar distinto (la columna se capa en alto)
  } | null>(null);
  // Posición vive en un ref + se aplica vía DOM directo (rAF) para que el
  // ghost siga al mouse sin re-render por cada pixel.
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const ghostPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const ghostRafRef = useRef<number | null>(null);

  // 1x1 GIF transparente para anular el drag-image nativo del browser.
  const TRANSPARENT_PIXEL =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  // Mientras hay ghost, escuchamos dragover global para trackear el cursor.
  // (El evento `drag` del source da clientX/Y inconsistente entre browsers;
  // dragover a nivel window es confiable.)
  useEffect(() => {
    if (!dragGhost) return;
    function applyPos() {
      ghostRafRef.current = null;
      const el = ghostElRef.current;
      if (!el || !dragGhost) return;
      const { x, y } = ghostPosRef.current;
      el.style.transform = `translate(${x - dragGhost.grabX}px, ${y - dragGhost.grabY}px) rotate(2deg)`;
    }
    function onDragOverWin(e: DragEvent) {
      // clientX/Y === 0 en el último evento de algunos browsers → ignorar
      if (e.clientX === 0 && e.clientY === 0) return;
      ghostPosRef.current = { x: e.clientX, y: e.clientY };
      if (ghostRafRef.current == null) {
        ghostRafRef.current = requestAnimationFrame(applyPos);
      }
    }
    window.addEventListener("dragover", onDragOverWin);
    return () => {
      window.removeEventListener("dragover", onDragOverWin);
      if (ghostRafRef.current != null) cancelAnimationFrame(ghostRafRef.current);
    };
  }, [dragGhost]);

  // === Tiempo real (SSE) ===
  // Nos suscribimos a /api/events/tasks: cuando OTRA persona crea/edita/mueve/
  // borra una tarea, o cambian las columnas, el server lo emite y aquí hacemos
  // upsert/remove en el estado local — sin recargar la página.
  // Usamos un ref para draggingId para no pisar una tarea que el user está
  // arrastrando justo en ese momento.
  const draggingIdRef = useRef<string | null>(null);
  useEffect(() => {
    draggingIdRef.current = draggingId;
  }, [draggingId]);
  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    function connect() {
      if (stopped) return;
      es = new EventSource("/api/events/tasks");
      es.addEventListener("task", (e) => {
        try {
          const t = JSON.parse((e as MessageEvent).data) as Task;
          if (draggingIdRef.current === t.id) return; // no pisar el drag activo
          setTasks((cur) => {
            const idx = cur.findIndex((x) => x.id === t.id);
            if (idx === -1) return [...cur, t];
            const next = [...cur];
            next[idx] = t;
            return next;
          });
        } catch {}
      });
      es.addEventListener("removed", (e) => {
        try {
          const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
          setTasks((cur) => cur.filter((x) => x.id !== id));
        } catch {}
      });
      es.addEventListener("columns", (e) => {
        try {
          const { columns: cols } = JSON.parse((e as MessageEvent).data) as {
            columns: TaskColumn[];
          };
          if (Array.isArray(cols) && cols.length > 0) setColumns(cols);
        } catch {}
      });
      // El server cierra a los ~50s (límite serverless); EventSource
      // reconecta solo. Si hay error de red, también reintenta.
      es.onerror = () => {
        es?.close();
        if (!stopped) setTimeout(connect, 1_500);
      };
    }
    connect();
    return () => {
      stopped = true;
      es?.close();
    };
  }, []);

  /**
   * Setup compartido del ghost flotante (lo usan tareas y columnas):
   * - oculta el drag-image nativo con un pixel transparente
   * - captura el outerHTML del elemento + el offset del cursor
   * - guarda la posición inicial
   */
  function setupGhost(
    e: React.DragEvent,
    sourceEl: HTMLElement,
    kind: "task" | "column",
  ) {
    const img = new Image();
    img.src = TRANSPARENT_PIXEL;
    try {
      e.dataTransfer.setDragImage(img, 0, 0);
    } catch {}
    const rect = sourceEl.getBoundingClientRect();
    ghostPosRef.current = { x: e.clientX, y: e.clientY };
    const cleanHtml = sourceEl.outerHTML
      .replace(/animate-task-card-in/g, "")
      .replace(/cursor-pointer/g, "cursor-grabbing")
      .replace(/cursor-grab/g, "cursor-grabbing");
    setDragGhost({
      html: cleanHtml,
      width: rect.width,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      kind,
    });
  }

  function onDragStart(e: React.DragEvent, task: Task) {
    if (!canWrite) {
      e.preventDefault();
      return;
    }
    dragRef.current = { taskId: task.id, sourceStatus: task.status };
    setDraggingId(task.id);
    e.dataTransfer.effectAllowed = "move";
    // Necesario para Firefox
    e.dataTransfer.setData("text/plain", task.id);
    setupGhost(e, e.currentTarget as HTMLElement, "task");
  }
  function onDragEnd() {
    setDraggingId(null);
    setDragOverColumn(null);
    setDragGhost(null);
    dragRef.current = null;
  }

  /** Inicia el drag de una columna con el mismo ghost flotante. `el` es el
   *  elemento raíz de la columna (lo pasa el grip de la columna). */
  function startColumnDrag(
    e: React.DragEvent,
    colId: string,
    el: HTMLElement | null,
  ) {
    setColDragId(colId);
    setColDropIndex(null);
    if (el) {
      setupGhost(e, el, "column");
      // Medir el ancho de slot (columna + gap del contenedor) para los shifts.
      const parent = el.parentElement;
      const gap = parent
        ? parseFloat(getComputedStyle(parent).columnGap || "16") || 16
        : 16;
      colSlotRef.current = el.offsetWidth + gap;
      // Capturar los centros X originales de TODAS las columnas (los primeros
      // N hijos del contenedor son columnas; el último es "+ Agregar").
      if (parent) {
        const centers: number[] = [];
        const kids = Array.from(parent.children);
        for (let i = 0; i < columns.length && i < kids.length; i++) {
          const r = (kids[i] as HTMLElement).getBoundingClientRect();
          centers.push(r.left + r.width / 2);
        }
        colCentersRef.current = centers;
      }
    }
  }
  function endColumnDrag() {
    setColDragId(null);
    setColDropIndex(null);
    setDragGhost(null);
  }
  /** Calcula el índice destino (reducido) según el clientX del cursor contra
   *  los centros ORIGINALES capturados al iniciar. Estable → sin bucle. */
  function updateColDropIndex(clientX: number) {
    const from = colDragId ? columns.findIndex((c) => c.id === colDragId) : -1;
    if (from === -1) return;
    const centers = colCentersRef.current;
    let pos = 0;
    while (pos < centers.length && clientX > centers[pos]) pos++;
    // pos = índice de inserción en el array completo (0..n)
    let reduced = pos > from ? pos - 1 : pos;
    reduced = Math.max(0, Math.min(columns.length - 1, reduced));
    setColDropIndex((cur) => (cur === reduced ? cur : reduced));
  }
  function onDragOverColumn(e: React.DragEvent, status: TaskStatus) {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== status) setDragOverColumn(status);
  }
  function onDragLeaveColumn(status: TaskStatus) {
    if (dragOverColumn === status) setDragOverColumn(null);
  }
  async function onDropColumn(e: React.DragEvent, targetStatus: TaskStatus) {
    e.preventDefault();
    setDragOverColumn(null);
    setDraggingId(null);
    setDragGhost(null);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const task = tasks.find((t) => t.id === drag.taskId);
    if (!task) return;
    if (task.status === targetStatus) return; // no-op reorden mismo col (V1 simple)

    // Optimistic: actualizar status + ponerlo al final de la columna destino
    const prevTasks = tasks;
    const targetIsDone =
      columns.find((c) => c.id === targetStatus)?.isDone ?? false;
    const sourceIsDone =
      columns.find((c) => c.id === task.status)?.isDone ?? false;
    const targetCol = tasks
      .filter((t) => t.status === targetStatus)
      .sort((a, b) => a.position - b.position);
    const newPosition = (targetCol[targetCol.length - 1]?.position ?? 0) + 1000;
    const next = tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            status: targetStatus,
            position: newPosition,
            completedAt: targetIsDone
              ? new Date().toISOString()
              : sourceIsDone
                ? null
                : t.completedAt,
          }
        : t,
    );
    setTasks(next);

    try {
      const res = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: task.id, status: targetStatus, position: newPosition }],
        }),
      });
      if (!res.ok) throw new Error("falló");
      // Una regla pudo auto-mover la tarea (por completar o por entrar a una
      // columna con fromStatus). Refetch para reflejarlo. Solo cuando hay
      // reglas, para no refetchear de gusto.
      if (columns.some((c) => c.rule)) {
        refetchTasks();
      }
    } catch {
      setTasks(prevTasks);
      toast.error("No se pudo mover la tarea");
    }
  }

  function handleTaskUpdated(updated: Task) {
    setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
  }
  function handleTaskDeleted(id: string) {
    setTasks((cur) => cur.filter((t) => t.id !== id));
    setOpenTaskId(null);
  }

  // === Quick actions desde la card (sin abrir el drawer) ===
  // PATCH optimista de una tarea. `optimistic` es la versión local ya
  // aplicada para feedback inmediato; si el server falla, revierte.
  async function quickPatch(
    taskId: string,
    data: Record<string, unknown>,
    optimistic: (t: Task) => Task,
  ) {
    const prev = tasks;
    setTasks((cur) => cur.map((t) => (t.id === taskId ? optimistic(t) : t)));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Error");
      }
      const j = await res.json();
      setTasks((cur) => cur.map((t) => (t.id === taskId ? j.task : t)));
    } catch (e) {
      setTasks(prev);
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  async function quickDelete(taskId: string) {
    const prev = tasks;
    const deleted = tasks.find((t) => t.id === taskId);
    setTasks((cur) => cur.filter((t) => t.id !== taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      // Soft delete → toast con "Deshacer" durante 5s. Restaurar pega el
      // POST /restore y vuelve a meter la tarea en memoria.
      toast.success("Tarea movida a papelera", {
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              const r = await fetch(`/api/tasks/${taskId}/restore`, {
                method: "POST",
              });
              if (!r.ok) throw new Error();
              if (deleted) setTasks((cur) => [...cur, deleted]);
              toast.success("Tarea restaurada");
            } catch {
              toast.error("No se pudo restaurar");
            }
          },
        },
        duration: 5000,
      });
    } catch {
      setTasks(prev);
      toast.error("No se pudo borrar");
    }
  }

  async function quickDuplicate(task: Task) {
    try {
      const sourceAssignees = effectiveAssignees(task);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${task.title} (copia)`,
          description: task.description,
          status: task.status,
          priority: task.priority,
          brandId: task.brandId,
          assigneeId: sourceAssignees[0]?.id ?? null,
          dueDate: task.dueDate,
          subtasks: task.subtasks.map((s) => ({ title: s.title })),
        }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      // Si la fuente tenía múltiples assignees, copiarlos al duplicado
      if (sourceAssignees.length > 1) {
        await fetch(`/api/tasks/${j.task.id}/assignees`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds: sourceAssignees.map((a) => a.id),
          }),
        }).catch(() => null);
      }
      setTasks((cur) => [
        ...cur,
        { ...j.task, assignees: sourceAssignees },
      ]);
      toast.success("Tarea duplicada");
    } catch {
      toast.error("No se pudo duplicar");
    }
  }

  /** Inline add: crea tarea simple desde el footer de la columna (solo title). */
  async function quickCreate(status: TaskStatus, title: string) {
    if (!title.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          status,
          assigneeId: currentUserId,
        }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      setTasks((cur) => [...cur, j.task]);
    } catch {
      toast.error("No se pudo crear");
    }
  }

  /**
   * "Nueva tarea": crea al instante y abre el DRAWER completo — así la
   * creación tiene exactamente las mismas opciones que ver una tarea
   * (enlaces, comentarios, repetir, todo). Reemplaza al modal intermedio.
   */
  const draftIdsRef = useRef<Set<string>>(new Set());
  async function createAndOpen(status?: TaskStatus) {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Nueva tarea",
          status: status ?? columns.find((c) => !c.isDone)?.id ?? "todo",
          // Sin asignado: la tarea nace 100% vacía y el user decide todo
          // en el drawer.
        }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      setTasks((cur) => [...cur, j.task]);
      draftIdsRef.current.add(j.task.id);
      setOpenTaskId(j.task.id);
    } catch {
      toast.error("No se pudo crear");
    }
  }

  /**
   * Cierra el drawer. Si la tarea era un borrador recién creado y sigue
   * VACÍA (el server lo verifica: título sin cambiar, sin descripción,
   * subtareas, comentarios, enlaces, etiquetas ni fecha), se descarta sola.
   * Si le agregó cualquier cosa, queda creada normal.
   */
  function closeDraftAware() {
    const id = openTaskId;
    setOpenTaskId(null);
    if (!id || !draftIdsRef.current.has(id)) return;
    draftIdsRef.current.delete(id);
    fetch(`/api/tasks/${id}?draftOnly=1`, { method: "DELETE" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.deleted) setTasks((cur) => cur.filter((t) => t.id !== id));
      })
      .catch(() => {});
  }

  /** Bulk: borrar todas las tareas done de la agency. Confirmación obligada. */
  async function clearDone() {
    const doneTasks = tasks.filter((t) => t.status === "done");
    if (doneTasks.length === 0) return;
    const ok = await confirm({
      title: `¿Limpiar ${doneTasks.length} ${doneTasks.length === 1 ? "tarea completada" : "tareas completadas"}?`,
      description:
        "Se mueven a la papelera. Puedes restaurarlas desde ahí si te arrepientes.",
      confirmLabel: "Mover a papelera",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    const prev = tasks;
    setTasks((cur) => cur.filter((t) => t.status !== "done"));
    try {
      await Promise.all(
        doneTasks.map((t) =>
          fetch(`/api/tasks/${t.id}`, { method: "DELETE" }).catch(() => null),
        ),
      );
      toast.success(`${doneTasks.length} tareas borradas`);
    } catch {
      setTasks(prev);
      toast.error("Error al borrar");
    }
  }

  function toggleCollapse(s: TaskStatus) {
    setCollapsed((c) => ({ ...c, [s]: !c[s] }));
  }
  function setColSort(s: TaskStatus, mode: ColSort) {
    setSortBy((c) => ({ ...c, [s]: mode }));
  }

  // Spotlight (Cmd+K) + atajos globales
  const spotlight = useSpotlight();
  const modKey = useModKey();
  useGlobalShortcuts({
    onCreate: () => canWrite && createAndOpen(),
  });

  const openTask = openTaskId
    ? tasks.find((t) => t.id === openTaskId) ?? null
    : null;

  return (
    <ColumnMetaContext.Provider value={COLUMN_META}>
    <ColumnsListContext.Provider value={{ columns, labelFor }}>
    <StatusColorsContext.Provider value={{ colors: statusColors, setColor: setStatusColor, canEdit: canWrite }}>
      {/* Header con filtros. En mobile NO es sticky (scrollea con el
          contenido, queda arriba de las tarjetas); en desktop sí queda fijo. */}
      <div className="relative z-20 -mx-4 -mt-5 mb-4 border-b divider bg-white/75 px-4 pb-3 pt-5 backdrop-blur-xl sm:sticky sm:top-0 sm:-mx-6 sm:-mt-6 sm:mb-5 sm:px-6 sm:pb-4 sm:pt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
              Tareas del equipo
            </h1>
            <p className="mt-1 hidden text-sm text-zinc-500 sm:block">
              {view === "kanban" &&
                "Arrastra las tarjetas entre columnas para cambiar el estado."}
              {view === "list" &&
                "Vista compacta — todas las tareas agrupadas por estado."}
              {view === "calendar" &&
                "Tareas con fecha límite en un calendario mensual."}
            </p>
          </div>
          {/* flex-wrap: en móvil esta fila es más ancha que la pantalla
              (switcher de 4 vistas + carga + buscar + papelera + nueva) y sin
              wrap desbordaba la página entera horizontalmente. */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ViewSwitcher view={view} onChange={setView} />
            <TeamWorkload
              tasks={tasks as unknown as TaskItem[]}
              members={members as unknown as TaskUser[]}
              doneStatusIds={new Set(columns.filter((c) => c.isDone).map((c) => c.id))}
            />
            {canWrite && (
              <TaskTemplatesModal
                brands={brands.map((b) => ({ id: b.id, name: b.name }))}
              />
            )}
            <button
              type="button"
              onClick={() => spotlight.setOpen(true)}
              title={`Buscar tareas (${modKey}+K)`}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-2.5 text-[12px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 sm:py-1.5 sm:pl-3 sm:pr-1.5"
            >
              <Search className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Buscar</span>
              <kbd className="ml-2 hidden items-center gap-0.5 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-3xs font-semibold leading-none text-zinc-500 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:inline-flex">
                {modKey}
                <span className="text-zinc-300">+</span>
                K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setTrashOpen(true)}
              title="Papelera"
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
              aria-label="Abrir papelera"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {canWrite && (
              <button
                type="button"
                onClick={() => createAndOpen()}
                className="btn-gradient group inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold sm:px-4 sm:text-sm"
              >
                <Plus className="h-4 w-4 transition group-hover:rotate-90" />
                <span className="hidden sm:inline">Nueva tarea</span>
                <span className="sm:hidden">Nueva</span>
              </button>
            )}
          </div>
        </div>
        <FiltersBar
          filterMine={filterMine}
          setFilterMine={setFilterMine}
          filterBrand={filterBrand}
          setFilterBrand={setFilterBrand}
          filterAssignee={filterAssignee}
          setFilterAssignee={setFilterAssignee}
          filterPriority={filterPriority}
          setFilterPriority={setFilterPriority}
          filterTag={filterTag}
          setFilterTag={setFilterTag}
          brands={brands}
          members={members}
          allTags={allTags}
        />
      </div>

      {/* === Render condicional según vista activa === */}
      {view === "kanban" &&
        (() => {
          // Pre-cálculo de los desplazamientos durante el reorden de columnas:
          // construimos el orden "preview" (sin la arrastrada, reinsertada en
          // colDropIndex) y derivamos cuánto se corre cada columna. Se aplica
          // vía translateX con transición → las columnas se deslizan y abren
          // el hueco donde va a caer.
          const fromIdx = colDragId
            ? columns.findIndex((c) => c.id === colDragId)
            : -1;
          let shiftFor: (i: number) => number = () => 0;
          if (fromIdx !== -1 && colDropIndex != null) {
            const order = columns.map((_, i) => i).filter((i) => i !== fromIdx);
            order.splice(colDropIndex, 0, fromIdx);
            const slotW = colSlotRef.current;
            const newSlot = new Map<number, number>();
            order.forEach((origI, slot) => newSlot.set(origI, slot));
            shiftFor = (i) => ((newSlot.get(i) ?? i) - i) * slotW;
          }
          return (
        <div
          onDragOver={(e) => {
            // Reorden de columnas: manejado a nivel contenedor con los centros
            // originales (estable). El drop también va aquí.
            if (colDragId) {
              e.preventDefault();
              updateColDropIndex(e.clientX);
            }
          }}
          onDrop={(e) => {
            if (colDragId) {
              e.preventDefault();
              if (colDropIndex != null) reorderColumns(colDragId, colDropIndex);
              endColumnDrag();
            }
          }}
          className="-mx-4 flex flex-1 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-6 sm:mx-0 sm:snap-none sm:gap-4 sm:px-0 lg:-mx-6 lg:px-6 xl:mx-0 xl:px-0"
        >
          {columns.map((col, colIdx) => (
            <KanbanColumn
              key={col.id}
              column={col}
              colShiftX={shiftFor(colIdx)}
              colReordering={colDragId != null}
              tasks={tasksByCol[col.id] ?? []}
              isCollapsed={collapsed[col.id]}
              sortMode={sortBy[col.id]}
              isDragOver={dragOverColumn === col.id}
              draggingId={draggingId}
              canWrite={canWrite}
              canAssign={canAssign}
              canManageColumns={canWrite}
              columnCount={columns.length}
              members={members}
              currentUserId={currentUserId}
              onToggleCollapse={() => toggleCollapse(col.id)}
              onChangeSort={(m) => setColSort(col.id, m)}
              onClearDone={col.isDone ? clearDone : undefined}
              onOpenModal={() => createAndOpen(col.id)}
              onQuickCreate={(title) => quickCreate(col.id, title)}
              onDragOverColumn={(e) => onDragOverColumn(e, col.id)}
              onDragLeaveColumn={() => onDragLeaveColumn(col.id)}
              onDropColumn={(e) => onDropColumn(e, col.id)}
              onDragStart={(e, t) => onDragStart(e, t)}
              onDragEnd={onDragEnd}
              onOpenTask={(id) => setOpenTaskId(id)}
              onPatch={quickPatch}
              onDelete={quickDelete}
              onDuplicate={quickDuplicate}
              onAssigneesChanged={setTaskAssignees}
              onRenameColumn={(label) => renameColumn(col.id, label)}
              onDeleteColumn={() => deleteColumn(col.id)}
              onToggleColumnDone={() => toggleColumnDone(col.id)}
              onSetColumnColor={(c) => setStatusColor(col.id, c)}
              onOpenSettings={() => setSettingsColId(col.id)}
              activePriorityFilter={filterPriority}
              onTogglePriorityFilter={(p) =>
                setFilterPriority((cur) => (cur === p ? "all" : p))
              }
              colDragId={colDragId}
              onColDragStart={(e, el) => startColumnDrag(e, col.id, el)}
              onColDragEnd={endColumnDrag}
            />
          ))}
          {/* Botón agregar columna (con menú: vacía / por cliente) */}
          {canWrite && columns.length < MAX_TASK_COLUMNS && (
            <AddColumnButton
              brands={brands}
              onAddEmpty={addColumn}
              onAddClient={addClientColumn}
            />
          )}
        </div>
          );
        })()}

      {view === "list" && (
        <TasksListView
          tasks={filteredTasks as unknown as TaskItem[]}
          canWrite={canWrite}
          onOpenTask={(id) => setOpenTaskId(id)}
          onPatch={(id, data, optimistic) =>
            quickPatch(id, data, optimistic as never)
          }
        />
      )}

      {view === "calendar" && (
        <TasksCalendarView
          tasks={filteredTasks as unknown as TaskItem[]}
          canWrite={canWrite}
          onOpenTask={(id) => setOpenTaskId(id)}
          onPatch={(id, data, optimistic) =>
            quickPatch(id, data, optimistic as never)
          }
        />
      )}

      {view === "week" && (
        <TasksWeekView
          // OJO: usa `tasks` (no filteredTasks) — "Mi semana" es personal,
          // ignora los filtros del board y filtra por el usuario actual.
          tasks={tasks as unknown as TaskItem[]}
          currentUserId={currentUserId}
          doneStatusIds={new Set(columns.filter((c) => c.isDone).map((c) => c.id))}
          onOpenTask={(id) => setOpenTaskId(id)}
        />
      )}

      {openTask && (
        <TaskDrawer
          task={openTask}
          brands={brands}
          members={members}
          canWrite={canWrite}
          canAssign={canAssign}
          currentUserId={currentUserId}
          onClose={closeDraftAware}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
          onBrandCreated={handleBrandCreated}
          allTags={allTags}
          onTagCreated={handleTagCreated}
          onTagsChanged={(tagIds) => setTaskTags(openTask.id, tagIds)}
          onAssigneesChanged={(userIds) => setTaskAssignees(openTask.id, userIds)}
          onTagUpdated={handleTagUpdated}
          onTagDeleted={handleTagDeleted}
        />
      )}

      {/* Cmd+K Spotlight */}
      <TaskSpotlight
        open={spotlight.open}
        onClose={() => spotlight.setOpen(false)}
        tasks={tasks as unknown as TaskItem[]}
        onOpenTask={(id) => setOpenTaskId(id)}
        actions={
          canWrite
            ? [
                {
                  id: "create-task",
                  label: "Crear nueva tarea",
                  shortcut: "C",
                  icon: Plus,
                  onSelect: () => createAndOpen(),
                },
              ]
            : []
        }
      />
      <TrashModal
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onRestored={refetchTasks}
      />
      {/* Modal de configuración de columna (reglas auto / WIP / archivar) */}
      {settingsColId &&
        (() => {
          const col = columns.find((c) => c.id === settingsColId);
          if (!col) return null;
          return (
            <ColumnSettingsModal
              column={col}
              brands={brands}
              members={members}
              allColumns={columns}
              onSave={updateColumn}
              onClose={() => setSettingsColId(null)}
            />
          );
        })()}

      {/* Ghost flotante custom — un elemento REAL (card o columna) siguiendo
          el cursor. Reemplaza el drag-image nativo (que sale borroso).
          - position fixed, sigue al mouse vía transform (rAF, sin re-render).
          - pointer-events none para no robar los eventos de drop.
          - Si es columna, capamos el alto (una columna larga sería un ghost
            gigante) con un fade abajo. */}
      {dragGhost && (
        <div
          ref={ghostElRef}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-[9999] will-change-transform"
          style={{
            width: dragGhost.width,
            transform: `translate(${ghostPosRef.current.x - dragGhost.grabX}px, ${ghostPosRef.current.y - dragGhost.grabY}px) rotate(${dragGhost.kind === "column" ? 1.5 : 2}deg)`,
          }}
        >
          <div
            className="relative overflow-hidden rounded-[14px] bg-white"
            style={{
              border: "1.5px solid rgba(168, 85, 247, 0.9)",
              boxShadow:
                "0 24px 48px -12px rgba(168, 85, 247, 0.45), 0 12px 24px -6px rgba(15, 23, 42, 0.2)",
              maxHeight: dragGhost.kind === "column" ? 440 : undefined,
            }}
            // El snapshot del elemento. Contenido inerte (sin handlers), solo
            // visual. Seguro: es nuestro propio markup.
            dangerouslySetInnerHTML={{ __html: dragGhost.html }}
          />
          {/* Fade inferior cuando la columna se capa en alto */}
          {dragGhost.kind === "column" && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-[14px]"
              style={{
                background:
                  "linear-gradient(to bottom, transparent, rgba(255,255,255,0.95))",
              }}
            />
          )}
        </div>
      )}
    </StatusColorsContext.Provider>
    </ColumnsListContext.Provider>
    </ColumnMetaContext.Provider>
  );
}

// ============================================================================
// Filtros
// ============================================================================

function FiltersBar({
  filterMine,
  setFilterMine,
  filterBrand,
  setFilterBrand,
  filterAssignee,
  setFilterAssignee,
  filterPriority,
  setFilterPriority,
  filterTag,
  setFilterTag,
  brands,
  members,
  allTags,
}: {
  filterMine: boolean;
  setFilterMine: (b: boolean) => void;
  filterBrand: string;
  setFilterBrand: (s: string) => void;
  filterAssignee: string;
  setFilterAssignee: (s: string) => void;
  filterPriority: string;
  setFilterPriority: (s: string) => void;
  filterTag: string;
  setFilterTag: (s: string) => void;
  brands: Brand[];
  members: User[];
  allTags: TaskTag[];
}) {
  return (
    // Mobile: fila con scroll horizontal (no se amontona en 3 filas).
    // Desktop (sm+): wrap normal.
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 text-xs [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => setFilterMine(!filterMine)}
        className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ${
          filterMine ? "btn-gradient" : "btn-secondary"
        }`}
      >
        <UserIcon className="h-3 w-3" />
        Solo mías
      </button>
      <FilterPicker
        icon={Filter}
        value={filterBrand}
        onChange={setFilterBrand}
        defaultLabel="Todas las marcas"
        options={[
          { value: "none", label: "Sin marca (agencia)", leading: <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-200" /> },
          ...brands.map((b) => ({
            value: b.id,
            label: b.name,
            leading: (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white"
                style={{ background: b.color ?? "#a1a1aa" }}
              />
            ),
          })),
        ]}
      />
      <FilterPicker
        icon={UserIcon}
        value={filterAssignee}
        onChange={setFilterAssignee}
        defaultLabel="Todos los miembros"
        options={[
          { value: "none", label: "Sin asignar", leading: <span className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-zinc-300 text-zinc-300"><X className="h-2.5 w-2.5" /></span> },
          ...members.map((m) => ({
            value: m.id,
            label: m.name ?? m.email,
            leading: <Avatar user={m} size="sm" />,
          })),
        ]}
      />
      <FilterPicker
        icon={Flag}
        value={filterPriority}
        onChange={setFilterPriority}
        defaultLabel="Toda prioridad"
        options={[
          { value: "urgent", label: "Urgente", leading: <Flag className="h-3 w-3 text-rose-500" fill="currentColor" /> },
          { value: "high", label: "Alta", leading: <Flag className="h-3 w-3 text-amber-500" fill="currentColor" /> },
          { value: "normal", label: "Normal", leading: <Flag className="h-3 w-3 text-blue-500" fill="currentColor" /> },
          { value: "low", label: "Baja", leading: <Flag className="h-3 w-3 text-zinc-400" fill="currentColor" /> },
        ]}
      />
      {allTags.length > 0 && (
        <FilterPicker
          icon={Tags}
          value={filterTag}
          onChange={setFilterTag}
          defaultLabel="Todas las etiquetas"
          options={[
            {
              value: "none",
              label: "Sin etiquetas",
              leading: (
                <span className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-zinc-300 text-zinc-300">
                  <X className="h-2.5 w-2.5" />
                </span>
              ),
            },
            ...allTags.map((t) => ({
              value: t.id,
              label: t.name,
              leading: (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white"
                  style={{ background: t.color }}
                />
              ),
            })),
          ]}
        />
      )}
    </div>
  );
}

/**
 * Chip de filtro estilo "pill" en el header del board.
 * Usa <PickerPopover> directamente (no <Picker>) porque necesitamos trigger
 * con shape rounded-full + padding compacto, no el trigger tipo "input".
 * Mantenemos "all" como sentinel para "sin filtro" para compat con la API
 * de filtros que esperaba string.
 */
function FilterPicker({
  icon: Icon,
  value,
  onChange,
  defaultLabel,
  options,
}: {
  icon: typeof Filter;
  value: string;
  onChange: (v: string) => void;
  defaultLabel: string;
  options: PickerOption<string>[];
}) {
  const [open, setOpen] = useState(false);
  const isFiltering = value !== "all";
  const selectedOption = isFiltering
    ? options.find((o) => o.value === value)
    : null;
  function close() {
    setOpen(false);
  }
  return (
    <div className="flex-shrink-0">
      <PickerPopover
        open={open}
        onOpenChange={(b) => (b ? setOpen(true) : close())}
        width="lg"
        align="left"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              isFiltering
                ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 hover:border-fuchsia-400"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            } ${open ? "ring-2 ring-fuchsia-200" : ""}`}
          >
            <Icon className={`h-3 w-3 ${isFiltering ? "text-fuchsia-500" : "text-zinc-400"}`} />
            <span>{selectedOption?.label ?? defaultLabel}</span>
            <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""} ${isFiltering ? "text-fuchsia-500" : "text-zinc-400"}`} />
          </button>
        )}
      >
        <div className="max-h-64 overflow-y-auto py-1">
          <PickerItem
            selected={value === "all"}
            onClick={() => {
              onChange("all");
              close();
            }}
          >
            <Icon className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-zinc-700">{defaultLabel}</span>
          </PickerItem>
          <PickerDivider />
          {options.map((o) => (
            <PickerItem
              key={o.value}
              selected={value === o.value}
              disabled={o.disabled}
              onClick={() => {
                onChange(o.value);
                close();
              }}
            >
              {o.leading}
              <span className="truncate text-zinc-700">{o.label}</span>
            </PickerItem>
          ))}
        </div>
      </PickerPopover>
    </div>
  );
}

// ============================================================================
// Kanban Column — header rico, sort, collapse, inline add, empty state CTA
// ============================================================================

type ColSortMode = "position" | "priority" | "due" | "alpha";

function KanbanColumn({
  column,
  tasks,
  isCollapsed,
  sortMode,
  isDragOver,
  draggingId,
  canWrite,
  canAssign,
  canManageColumns,
  columnCount,
  members,
  currentUserId,
  onToggleCollapse,
  onChangeSort,
  onClearDone,
  onOpenModal,
  onQuickCreate,
  onDragOverColumn,
  onDragLeaveColumn,
  onDropColumn,
  onDragStart,
  onDragEnd,
  onOpenTask,
  onPatch,
  onDelete,
  onDuplicate,
  onAssigneesChanged,
  onRenameColumn,
  onDeleteColumn,
  onToggleColumnDone,
  onSetColumnColor,
  onOpenSettings,
  activePriorityFilter,
  onTogglePriorityFilter,
  colShiftX,
  colReordering,
  colDragId,
  onColDragStart,
  onColDragEnd,
}: {
  column: TaskColumn;
  tasks: Task[];
  isCollapsed: boolean;
  sortMode: ColSortMode;
  isDragOver: boolean;
  draggingId: string | null;
  canWrite: boolean;
  canAssign: boolean;
  canManageColumns: boolean;
  columnCount: number;
  members: User[];
  currentUserId: string;
  onToggleCollapse: () => void;
  onChangeSort: (mode: ColSortMode) => void;
  onClearDone?: () => void;
  onOpenModal: () => void;
  onQuickCreate: (title: string) => Promise<void>;
  onDragOverColumn: (e: React.DragEvent) => void;
  onDragLeaveColumn: () => void;
  onDropColumn: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, t: Task) => void;
  onDragEnd: () => void;
  onOpenTask: (id: string) => void;
  onPatch: (
    id: string,
    data: Record<string, unknown>,
    optimistic: (t: Task) => Task,
  ) => void;
  onDelete: (id: string) => void;
  onDuplicate: (t: Task) => void;
  onAssigneesChanged: (taskId: string, userIds: string[]) => void;
  onRenameColumn: (label: string) => void;
  onDeleteColumn: () => void;
  onToggleColumnDone: () => void;
  onSetColumnColor: (c: TaskColor) => void;
  onOpenSettings: () => void;
  activePriorityFilter: string;
  onTogglePriorityFilter: (p: TaskPriority) => void;
  colShiftX: number;
  colReordering: boolean;
  colDragId: string | null;
  onColDragStart: (e: React.DragEvent, el: HTMLElement | null) => void;
  onColDragEnd: () => void;
}) {
  const status = column.id;
  const COLUMN_META = useColumnMeta();
  const meta = COLUMN_META[status] ?? COLUMN_META[Object.keys(COLUMN_META)[0]];
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  // Rename inline: cuando true, el pill se vuelve input.
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(column.label);

  // Counts por prioridad presente en la columna (para chips clickeables).
  const priorityCounts: Record<TaskPriority, number> = {
    urgent: 0,
    high: 0,
    normal: 0,
    low: 0,
  };
  for (const t of tasks) {
    if (t.priority in priorityCounts)
      priorityCounts[t.priority as TaskPriority]++;
  }
  const overdueCount = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).getTime() < Date.now() && !column.isDone,
  ).length;
  // Avatares apilados de TODOS los assignees únicos en esta columna (multi)
  const assignees = (() => {
    const seen = new Map<string, User>();
    for (const t of tasks) {
      for (const a of effectiveAssignees(t)) {
        if (!seen.has(a.id)) seen.set(a.id, a);
      }
    }
    return Array.from(seen.values());
  })();

  async function submitQuick() {
    const t = addTitle.trim();
    if (!t) return;
    setAddTitle("");
    await onQuickCreate(t);
  }

  // ¿Hay un drag de columna activo? → el div es drop-target para reorden.
  const isColReorderActive = colDragId != null;
  const isBeingColDragged = colDragId === status;
  // Ref a la raíz de la columna — la usa el grip para capturar el ghost.
  const colRootRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={colRootRef}
      onDragOver={(e) => {
        // El reorden de columnas lo maneja el contenedor; aquí solo el drop de
        // tareas (cuando NO se está reordenando columnas).
        if (!isColReorderActive) onDragOverColumn(e);
      }}
      onDragLeave={() => {
        if (!isColReorderActive) onDragLeaveColumn();
      }}
      onDrop={(e) => {
        if (!isColReorderActive) onDropColumn(e);
      }}
      style={
        // Durante el reorden, cada columna se corre con translateX para abrir
        // el hueco. La arrastrada se hace invisible (el ghost la representa).
        colReordering
          ? {
              transform: colShiftX ? `translateX(${colShiftX}px)` : undefined,
              transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }
          : undefined
      }
      className={`card group/col flex w-[82vw] max-w-[320px] flex-shrink-0 snap-start flex-col overflow-hidden p-0 transition-all duration-200 sm:w-[300px] sm:max-w-none ${
        isDragOver && !isColReorderActive
          ? `scale-[1.01] ring-2 ${meta.ring} shadow-lg ${meta.softBg}`
          : ""
      } ${
        isBeingColDragged ? "opacity-0" : ""
      } ${isCollapsed ? "min-h-0" : "min-h-[480px]"}`}
    >
      {/* === Header === */}
      <div className="px-5 pt-4 pb-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {/* Grip de reorden de columna (drag handle) — solo si gestiona */}
            {canManageColumns && (
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", `col:${status}`);
                  onColDragStart(e, colRootRef.current);
                }}
                onDragEnd={onColDragEnd}
                title="Arrastrar para reordenar la columna"
                className="flex-shrink-0 cursor-grab text-zinc-300 opacity-0 transition group-hover/col:opacity-100 active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isCollapsed ? "Expandir" : "Colapsar"}
              className="flex flex-shrink-0 items-center gap-2"
            >
              <span
                className={`grid h-4 w-4 flex-shrink-0 place-items-center text-zinc-400 transition ${
                  isCollapsed ? "" : "rotate-90"
                }`}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
            {/* Pill del nombre — editable inline al hacer doble click */}
            {renaming ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onRenameColumn(renameDraft);
                    setRenaming(false);
                  } else if (e.key === "Escape") {
                    setRenameDraft(column.label);
                    setRenaming(false);
                  }
                }}
                onBlur={() => {
                  if (renameDraft.trim() && renameDraft.trim() !== column.label) {
                    onRenameColumn(renameDraft);
                  }
                  setRenaming(false);
                }}
                maxLength={30}
                className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-2xs font-bold uppercase tracking-wide outline-none focus:border-fuchsia-400"
              />
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                onDoubleClick={() => {
                  if (canManageColumns) {
                    setRenameDraft(column.label);
                    setRenaming(true);
                  }
                }}
                title={canManageColumns ? "Doble click para renombrar" : column.label}
                className={`inline-flex max-w-[160px] items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-bold uppercase tracking-wide text-white shadow-sm ${meta.pill}`}
              >
                <span className="truncate">{column.label}</span>
                {column.isDone && (
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0 opacity-90" />
                )}
              </button>
            )}
            {/* Contador — si hay WIP limit muestra count/limit, rojo si se
                pasa, ámbar si está al borde. */}
            {column.wipLimit ? (
              <span
                key={tasks.length}
                className={`animate-task-count-pop flex-shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-bold tabular-nums ${
                  tasks.length > column.wipLimit
                    ? "bg-rose-100 text-rose-700"
                    : tasks.length === column.wipLimit
                      ? "bg-amber-100 text-amber-700"
                      : "text-zinc-400"
                }`}
                title={`${tasks.length} de ${column.wipLimit} (límite WIP)`}
              >
                {tasks.length}/{column.wipLimit}
              </span>
            ) : (
              <span
                key={tasks.length}
                className="animate-task-count-pop flex-shrink-0 text-[12px] font-semibold tabular-nums text-zinc-400"
              >
                {tasks.length}
              </span>
            )}
            {/* Badge de regla automática */}
            {column.rule && (
              <span
                className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-md bg-fuchsia-100 px-1 py-0.5 text-[9px] font-bold uppercase text-fuchsia-700"
                title="Esta columna recibe tareas automáticamente por una regla"
              >
                <Zap className="h-2.5 w-2.5" fill="currentColor" />
                Auto
              </span>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-0.5">
            {canWrite && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                title="Agregar rápido"
                className={`grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition ${meta.accent}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
            <ColumnMenu
              status={status}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              sortMode={sortMode}
              onChangeSort={onChangeSort}
              onClearDone={onClearDone}
              hasDone={column.isDone && tasks.length > 0}
              canManageColumns={canManageColumns}
              isDoneColumn={column.isDone}
              canDelete={columnCount > 1}
              onRename={() => {
                setRenameDraft(column.label);
                setRenaming(true);
              }}
              onDeleteColumn={onDeleteColumn}
              onToggleColumnDone={onToggleColumnDone}
              onSetColumnColor={onSetColumnColor}
              currentColor={column.color}
              onOpenSettings={onOpenSettings}
              hasRule={!!column.rule}
            />
          </div>
        </div>

        {/* Chips (scroll horizontal propio) a la izquierda + avatares del
            equipo FIJOS a la derecha (siempre visibles, con "+N" si hay más
            de 3). Sin padding izquierdo. `overscroll-x-contain` evita que el
            scroll de los chips se escape al board. */}
        {!isCollapsed && (tasks.length > 0 || assignees.length > 0) && (
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain text-[10.5px] font-semibold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(["urgent", "high", "normal", "low"] as const).map((p) => {
                const n = priorityCounts[p];
                if (n === 0) return null;
                const active = activePriorityFilter === p;
                const st = PRIORITY_CHIP[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePriorityFilter(p);
                    }}
                    className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 transition ${
                      active ? `${st.activeBg} text-white shadow-sm` : st.idle
                    }`}
                    title={
                      active
                        ? `Quitar filtro de ${st.label.toLowerCase()}`
                        : `Filtrar por ${st.label.toLowerCase()}`
                    }
                  >
                    <Flag className="h-2.5 w-2.5 flex-shrink-0" fill="currentColor" />
                    <span className="tabular-nums">{n}</span>
                    <span className="font-medium opacity-80">{st.label}</span>
                  </button>
                );
              })}
              {overdueCount > 0 && (
                <span
                  className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-amber-100/80 px-1.5 py-0.5 text-amber-700"
                  title={`${overdueCount} vencida${overdueCount === 1 ? "" : "s"}`}
                >
                  <AlertCircle className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="tabular-nums">{overdueCount}</span>
                  <span className="font-medium opacity-80">
                    vencida{overdueCount === 1 ? "" : "s"}
                  </span>
                </span>
              )}
              {sortMode !== "position" && (
                <span
                  className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-zinc-100 px-1.5 py-0.5 text-zinc-500"
                  title={`Ordenado por ${SORT_LABEL[sortMode]}`}
                >
                  <ArrowUpDown className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="font-medium opacity-80">{SORT_LABEL[sortMode]}</span>
                </span>
              )}
            </div>
            {/* Avatares del equipo — fijos a la derecha, no scrollean */}
            {assignees.length > 0 && (
              <div
                className="flex flex-shrink-0 items-center -space-x-1.5"
                title={`${assignees.length} en esta columna`}
              >
                {assignees.slice(0, 3).map((m) => (
                  <Avatar key={m.id} user={m} size="sm" ring />
                ))}
                {assignees.length > 3 && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-zinc-200 text-[8px] font-bold text-zinc-600 ring-2 ring-white">
                    +{assignees.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* === Lista de cards === */}
      {!isCollapsed && (
        <>
          <div className="flex flex-1 flex-col gap-3 px-5 pb-4 pt-1">
            {tasks.length === 0 ? (
              <EmptyColumnState
                status={status}
                isDoneColumn={column.isDone}
                isDragOver={isDragOver}
                canWrite={canWrite}
                onAdd={() => setAdding(true)}
              />
            ) : (
              tasks.map((task, i) => (
                <TaskCardItem
                  key={task.id}
                  task={task}
                  index={i}
                  colMeta={meta}
                  isDragging={draggingId === task.id}
                  draggable={canWrite}
                  canWrite={canWrite}
                  canAssign={canAssign}
                  members={members}
                  currentUserId={currentUserId}
                  onDragStart={(e) => onDragStart(e, task)}
                  onDragEnd={onDragEnd}
                  onClick={() => onOpenTask(task.id)}
                  onPatch={(data, optimistic) => onPatch(task.id, data, optimistic)}
                  onDelete={() => onDelete(task.id)}
                  onDuplicate={() => onDuplicate(task)}
                  onAssigneesChanged={(ids) => onAssigneesChanged(task.id, ids)}
                />
              ))
            )}
          </div>

          {/* === Footer: inline add === */}
          {canWrite && (
            <div className="border-t divider px-5 py-3">
              {adding ? (
                <div className="flex items-start gap-1.5">
                  <input
                    autoFocus
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (e.shiftKey) {
                          // Shift+Enter abre el modal completo con el title actual
                          onOpenModal();
                          setAdding(false);
                          setAddTitle("");
                        } else {
                          submitQuick();
                        }
                      } else if (e.key === "Escape") {
                        setAdding(false);
                        setAddTitle("");
                      }
                    }}
                    onBlur={() => {
                      if (!addTitle.trim()) setAdding(false);
                      else submitQuick();
                    }}
                    placeholder="Título de la tarea…"
                    className="input-soft flex-1 rounded-md px-2 py-1.5 text-[12.5px]"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAdding(false);
                      onOpenModal();
                    }}
                    title="Abrir modal completo"
                    className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-zinc-400 transition ${meta.accent}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nueva tarea
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-white/0 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                    <CornerDownLeft className="h-2.5 w-2.5" />
                  </span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const SORT_LABEL: Record<ColSortMode, string> = {
  position: "Manual",
  priority: "Prioridad",
  due: "Fecha",
  alpha: "A-Z",
};

function ColumnMenu({
  status,
  open,
  onOpenChange,
  sortMode,
  onChangeSort,
  onClearDone,
  hasDone,
  canManageColumns,
  isDoneColumn,
  canDelete,
  onRename,
  onDeleteColumn,
  onToggleColumnDone,
  onOpenSettings,
  hasRule,
}: {
  status: TaskStatus;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  sortMode: ColSortMode;
  onChangeSort: (mode: ColSortMode) => void;
  onClearDone?: () => void;
  hasDone: boolean;
  canManageColumns: boolean;
  isDoneColumn: boolean;
  canDelete: boolean;
  onRename: () => void;
  onDeleteColumn: () => void;
  onToggleColumnDone: () => void;
  onSetColumnColor: (c: TaskColor) => void;
  currentColor: TaskColor;
  onOpenSettings: () => void;
  hasRule: boolean;
}) {
  const { colors, setColor, canEdit } = useStatusColors();
  const activeColor = colors[status];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        title="Más"
        className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => onOpenChange(false)} />
          <div className="absolute right-0 top-7 z-20 w-56 card overflow-hidden py-1 shadow-lg">
            {/* === COLOR PALETTE === */}
            {canEdit && (
              <>
                <PickerSection>Color de la columna</PickerSection>
                <div className="grid grid-cols-8 gap-1 px-3 py-1.5">
                  {TASK_COLOR_PALETTE.map((c) => {
                    const isActive = activeColor === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setColor(status, c);
                          // No cerramos el menú — el user puede querer probar
                          // varios colores rápido sin reabrir el menú.
                        }}
                        title={c}
                        className={`relative grid h-5 w-5 place-items-center rounded-full transition hover:scale-110 ${COLOR_META[c].pill} ${
                          isActive
                            ? "ring-2 ring-zinc-900 ring-offset-2"
                            : ""
                        }`}
                      >
                        {isActive && (
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <PickerDivider />
              </>
            )}

            <PickerSection>Ordenar por</PickerSection>
            {(["position", "priority", "due", "alpha"] as const).map((m) => (
              <PickerItem
                key={m}
                selected={sortMode === m}
                onClick={() => {
                  onChangeSort(m);
                  onOpenChange(false);
                }}
              >
                {SORT_LABEL[m]}
              </PickerItem>
            ))}
            {hasDone && onClearDone && (
              <>
                <PickerDivider />
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onClearDone();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-rose-600 transition hover:bg-rose-50"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Limpiar completadas
                </button>
              </>
            )}

            {/* === Gestión de la columna === */}
            {canManageColumns && (
              <>
                <PickerDivider />
                <PickerSection>Columna</PickerSection>
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onOpenSettings();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-700 transition hover:bg-zinc-50"
                >
                  <Settings2 className="h-3.5 w-3.5 text-fuchsia-500" />
                  Configurar / Reglas
                  {hasRule && (
                    <span className="ml-auto rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-fuchsia-700">
                      Auto
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onRename();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-700 transition hover:bg-zinc-50"
                >
                  <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                  Renombrar
                </button>
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onToggleColumnDone();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-700 transition hover:bg-zinc-50"
                >
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${isDoneColumn ? "text-emerald-500" : "text-zinc-400"}`}
                  />
                  {isDoneColumn ? "Quitar como final" : "Marcar como final"}
                </button>
                {canDelete && (
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      onDeleteColumn();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-rose-600 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar columna
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyColumnState({
  status,
  isDoneColumn,
  isDragOver,
  canWrite,
  onAdd,
}: {
  status: TaskStatus;
  isDoneColumn: boolean;
  isDragOver: boolean;
  canWrite: boolean;
  onAdd: () => void;
}) {
  if (isDragOver) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 bg-white/40 px-3 py-10 text-center">
        <CornerDownLeft className="h-5 w-5 text-zinc-400" />
        <span className="text-[12px] font-semibold text-zinc-500">Suelta la tarea aquí</span>
      </div>
    );
  }
  const msg =
    status === "todo"
      ? "Lista vacía. Agrega la primera tarea."
      : status === "in_progress"
        ? "Nada en progreso por ahora."
        : status === "review"
          ? "Sin tareas en revisión."
          : isDoneColumn
            ? "Aún no hay tareas completadas."
            : "Columna vacía.";
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg px-3 py-10 text-center">
      <InboxIcon className="h-6 w-6 text-zinc-300" />
      <span className="max-w-[160px] text-[11.5px] font-medium text-zinc-400">{msg}</span>
      {canWrite && !isDoneColumn && (
        <button
          type="button"
          onClick={onAdd}
          className="btn-secondary mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold"
        >
          <Plus className="h-3 w-3" />
          Agregar tarea
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Card
// ============================================================================

function TaskCardItem({
  task,
  index,
  colMeta,
  isDragging,
  draggable,
  canWrite,
  canAssign,
  members,
  currentUserId,
  onDragStart,
  onDragEnd,
  onClick,
  onPatch,
  onDelete,
  onDuplicate,
  onAssigneesChanged,
}: {
  task: Task;
  index: number;
  colMeta: ColumnMetaEntry;
  isDragging: boolean;
  draggable: boolean;
  canWrite: boolean;
  canAssign: boolean;
  members: User[];
  currentUserId: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
  onPatch: (data: Record<string, unknown>, optimistic: (t: Task) => Task) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAssigneesChanged: (userIds: string[]) => void;
}) {
  const taskAssignees = effectiveAssignees(task);
  const prio = PRIORITY_META[task.priority];
  const due = dueDateLabel(task.dueDate);
  const completedSubs = task.subtasks.filter((s) => s.completed).length;
  const totalSubs = task.subtasks.length;
  const subPct = totalSubs > 0 ? (completedSubs / totalSubs) * 100 : 0;
  const COLUMN_META = useColumnMeta();
  const { columns: boardColumns } = useColumnsList();
  const isDone =
    boardColumns.find((c) => c.id === task.status)?.isDone ?? false;

  // Popover abierto dentro de la card: asignar / mover estado / más.
  const [menu, setMenu] = useState<null | "assign" | "status" | "more">(null);
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  function toggleDone(e: React.MouseEvent) {
    stop(e);
    if (!canWrite) return;
    // Toggle: si está en una columna final → vuelve a la primera columna NO
    // final; si no → va a la primera columna final.
    const firstDone = boardColumns.find((c) => c.isDone);
    const firstOpen = boardColumns.find((c) => !c.isDone);
    const next = (isDone ? firstOpen : firstDone)?.id ?? boardColumns[0]?.id;
    if (!next) return;
    const nextIsDone = boardColumns.find((c) => c.id === next)?.isDone ?? false;
    onPatch({ status: next }, (t) => ({
      ...t,
      status: next,
      completedAt: nextIsDone ? new Date().toISOString() : null,
    }));
  }
  function setStatus(s: TaskStatus, e: React.MouseEvent) {
    stop(e);
    setMenu(null);
    const nextIsDone = boardColumns.find((c) => c.id === s)?.isDone ?? false;
    onPatch({ status: s }, (t) => ({
      ...t,
      status: s,
      completedAt: nextIsDone ? new Date().toISOString() : null,
    }));
  }
  /** Toggle multi: agrega o quita un user de la lista de assignees. */
  function toggleAssignee(userId: string, e: React.MouseEvent) {
    stop(e);
    const currentIds = taskAssignees.map((a) => a.id);
    const nextIds = currentIds.includes(userId)
      ? currentIds.filter((id) => id !== userId)
      : [...currentIds, userId];
    onAssigneesChanged(nextIds);
    // No cerramos el menu — el user puede querer agregar/quitar varios sin reabrir
  }
  function clearAssignees(e: React.MouseEvent) {
    stop(e);
    setMenu(null);
    onAssigneesChanged([]);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable && menu === null}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        animationDelay: `${Math.min(index * 40, 360)}ms`,
      }}
      className={`card card-interactive group animate-task-card-in relative cursor-pointer p-4 text-left transition-all duration-200 ${
        isDragging
          ? "scale-[0.98] opacity-30 grayscale outline-dashed outline-2 outline-offset-2 outline-fuchsia-300"
          : ""
      } ${isDone ? "opacity-60" : ""} ${menu ? "z-30" : ""}`}
    >
      {/* Top row: tag de marca + toolbar de acciones rápidas (hover) */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        {task.brand ? (
          (() => {
            // Si el color de marca es muy oscuro (luma bajo), no funciona como
            // texto sobre fondo claro — usamos zinc-700 de fallback.
            const c = task.brand.color ?? "#8b5cf6";
            const isDark = isDarkHex(c);
            const bg = isDark ? "#f4f4f5" : `${c}1f`;
            const fg = isDark ? "#3f3f46" : c;
            return (
              <span
                className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-bold uppercase tracking-wide"
                style={{ background: bg, color: fg }}
                title={`Marca: ${task.brand.name}`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ring-2 ring-white/70"
                  style={{ background: c }}
                />
                <span className="truncate">{task.brand.name}</span>
              </span>
            );
          })()
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-2xs font-bold uppercase tracking-wide text-zinc-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-400" />
            Agencia
          </span>
        )}

        {/* Indicador: tarea vinculada a un post — pastilla con miniatura
            (si el post tiene imagen) para que se note de un vistazo. */}
        {task.post && (
          <span
            className="mr-auto inline-flex h-6 items-center gap-1 rounded-md bg-violet-50 pl-0.5 pr-1.5 font-semibold text-violet-600 ring-1 ring-violet-200/70"
            title={`Vinculada al post: ${task.post.title?.trim() || task.post.caption?.trim().slice(0, 60) || "post"}`}
          >
            {task.post.imageUrl || task.post.images?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={task.post.imageUrl || task.post.images[0].url}
                alt=""
                className="h-5 w-5 rounded object-cover"
              />
            ) : (
              <Link2 className="ml-0.5 h-3 w-3" />
            )}
            <span className="text-2xs uppercase tracking-wide">Post</span>
          </span>
        )}

        {/* Cluster derecho: ref id (default) ↔ toolbar (hover) */}
        <div className="relative flex h-6 flex-shrink-0 items-center">
          {/* Ref id tipo Linear — se desvanece al hover */}
          <span
            className={`font-mono text-3xs font-medium text-zinc-300 transition ${
              menu ? "opacity-0" : "opacity-100 group-hover:opacity-0"
            }`}
          >
            #{taskRef(task.id)}
          </span>
          {/* Toolbar de acciones rápidas — aparece al hover */}
          {canWrite && (
            <div
              className={`absolute right-0 flex items-center gap-0.5 rounded-lg bg-white/90 backdrop-blur-sm transition ${
                menu ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
              }`}
            >
              <QuickBtn
                title="Mover de estado"
                onClick={(e) => {
                  stop(e);
                  setMenu(menu === "status" ? null : "status");
                }}
              >
                <MoveRight className="h-3.5 w-3.5" />
              </QuickBtn>
              <QuickBtn
                title="Asignar"
                disabled={!canAssign && !(task.assigneeId === currentUserId || !task.assigneeId)}
                onClick={(e) => {
                  stop(e);
                  setMenu(menu === "assign" ? null : "assign");
                }}
              >
                <UserPlus className="h-3.5 w-3.5" />
              </QuickBtn>
              <QuickBtn
                title="Más"
                onClick={(e) => {
                  stop(e);
                  setMenu(menu === "more" ? null : "more");
                }}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </QuickBtn>
            </div>
          )}
        </div>
      </div>

      {/* Tags de la tarea (si tiene) */}
      {task.tags.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {task.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </div>
      )}

      {/* Title row: círculo de completar + título */}
      <div className="flex items-start gap-2.5">
        {canWrite && (
          <button
            type="button"
            onClick={toggleDone}
            title={isDone ? "Marcar pendiente" : "Marcar completada"}
            className="mt-0.5 flex-shrink-0 text-zinc-300 transition hover:text-emerald-500"
          >
            {isDone ? (
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
          </button>
        )}
        <p
          className={`flex-1 text-[14px] font-semibold leading-snug tracking-tight text-zinc-900 ${
            isDone ? "text-zinc-400 line-through decoration-zinc-300" : ""
          }`}
        >
          {task.title}
        </p>
      </div>

      {/* Description (1 línea, sin HTML) */}
      {task.description && stripHtml(task.description) && (
        <p className="mt-1.5 line-clamp-1 pl-[26px] text-[12px] leading-snug text-zinc-500">
          {stripHtml(task.description)}
        </p>
      )}

      {/* Linked post */}
      {task.post && (
        <p className="mt-2 inline-flex max-w-full items-center gap-1 pl-[26px] text-2xs font-medium text-zinc-500">
          <Link2 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            {task.post.title ?? task.post.caption.slice(0, 36) ?? "Post"}
          </span>
        </p>
      )}

      {/* Progress bar de subtareas — gradiente del color del estado de la columna */}
      {totalSubs > 0 && (
        <div className="mt-3 flex items-center gap-2 pl-[26px]">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`task-progress-fill h-full rounded-full ${
                subPct === 100
                  ? "bg-gradient-to-r from-emerald-400 to-teal-400"
                  : colMeta.barFill
              }`}
              style={{ width: `${subPct}%` }}
            />
          </div>
          <span
            className={`text-2xs font-bold tabular-nums ${
              subPct === 100 ? "text-emerald-600" : "text-zinc-600"
            }`}
          >
            {completedSubs}/{totalSubs}
          </span>
        </div>
      )}

      {/* Footer SIEMPRE presente (da estructura aunque la tarea sea simple):
          prioridad + fecha/creado a la izq · avatar a la der. */}
      <div className="mt-3.5 flex items-start justify-between gap-2 border-t divider pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-2xs">
          {/* Banderita de prioridad como pill con tinte */}
          <span
            className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 font-bold ${
              task.priority === "urgent"
                ? "bg-rose-50 text-rose-600"
                : task.priority === "high"
                  ? "bg-amber-50 text-amber-700"
                  : task.priority === "normal"
                    ? "bg-blue-50 text-blue-600"
                    : "bg-zinc-100 text-zinc-500"
            }`}
            title={`Prioridad: ${prio.label}`}
          >
            <Flag className="h-3 w-3" fill="currentColor" />
            {prio.showOnCard && <span>{prio.label}</span>}
          </span>
          {/* Fecha límite (si hay) o tiempo de creación con icono Clock */}
          {due ? (
            <span
              className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 font-bold ${
                due.tone === "danger"
                  ? "bg-rose-50 text-rose-600"
                  : due.tone === "warn"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-zinc-100 text-zinc-600"
              }`}
            >
              <CalendarIcon className="h-3 w-3 flex-shrink-0" />
              {due.label}
            </span>
          ) : (
            <span className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-zinc-100 px-1.5 py-1 font-semibold text-zinc-600">
              <Clock className="h-3 w-3 flex-shrink-0" />
              {relativeTime(task.createdAt)}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={!canWrite}
          onClick={(e) => {
            stop(e);
            if (canWrite) setMenu(menu === "assign" ? null : "assign");
          }}
          title={
            taskAssignees.length === 0
              ? "Asignar a alguien"
              : taskAssignees.length === 1
                ? `${taskAssignees[0].name ?? taskAssignees[0].email} · cambiar`
                : `${taskAssignees.length} asignados · cambiar`
          }
          className="flex-shrink-0 transition hover:scale-105 disabled:cursor-default disabled:hover:scale-100"
        >
          {taskAssignees.length === 0 ? (
            <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-zinc-300 text-zinc-300 transition group-hover:border-fuchsia-300 group-hover:text-fuchsia-400">
              <UserPlus className="h-3 w-3" />
            </span>
          ) : (
            <span className="flex items-center -space-x-1.5">
              {taskAssignees.slice(0, 3).map((a) => (
                <Avatar key={a.id} user={a} size="md" ring />
              ))}
              {taskAssignees.length > 3 && (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-600 ring-2 ring-white">
                  +{taskAssignees.length - 3}
                </span>
              )}
            </span>
          )}
        </button>
      </div>

      {/* ===== Popovers ===== */}
      {menu && (
        <>
          {/* Overlay para cerrar al click afuera */}
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              stop(e);
              setMenu(null);
            }}
          />
          {menu === "status" && (
            <div className="absolute right-2 top-9 z-20 w-44 card overflow-hidden py-1 shadow-lg">
              <p className="px-3 py-1 text-3xs font-bold uppercase tracking-wider text-zinc-400">
                Mover a
              </p>
              {boardColumns.map((col) => (
                <button
                  key={col.id}
                  onClick={(e) => setStatus(col.id, e)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition hover:bg-zinc-50 ${
                    col.id === task.status ? "font-semibold text-zinc-900" : "text-zinc-600"
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${(COLUMN_META[col.id] ?? COLUMN_META[Object.keys(COLUMN_META)[0]]).pill}`}
                  />
                  {col.label}
                  {col.id === task.status && (
                    <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          )}
          {menu === "assign" && (
            <div className="card absolute right-2 top-9 z-20 max-h-72 w-56 overflow-y-auto py-1 shadow-lg">
              <PickerSection>
                Asignar a {taskAssignees.length > 0 && `(${taskAssignees.length})`}
              </PickerSection>
              {taskAssignees.length > 0 && (
                <button
                  onClick={clearAssignees}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-rose-600 transition hover:bg-rose-50"
                >
                  <X className="h-3 w-3" />
                  Quitar todos
                </button>
              )}
              {members.map((m) => {
                const isMe = m.id === currentUserId;
                const disabled = !isMe && !canAssign;
                const selected = taskAssignees.some((a) => a.id === m.id);
                return (
                  <button
                    key={m.id}
                    disabled={disabled}
                    onClick={(e) => toggleAssignee(m.id, e)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected ? "bg-fuchsia-50/40 font-semibold text-zinc-900" : "text-zinc-700"
                    }`}
                  >
                    <Avatar user={m} size="sm" />
                    <span className="truncate flex-1">
                      {isMe ? "Yo" : m.name ?? m.email}
                    </span>
                    {selected && (
                      <CheckCircle2 className="ml-auto h-4 w-4 flex-shrink-0 text-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {menu === "more" && (
            <div className="absolute right-2 top-9 z-20 w-40 card overflow-hidden py-1 shadow-lg">
              <button
                onClick={(e) => {
                  stop(e);
                  setMenu(null);
                  onDuplicate();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-600 transition hover:bg-zinc-50"
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicar
              </button>
              <button
                onClick={(e) => {
                  stop(e);
                  setMenu(null);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-rose-600 transition hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Borrar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Botón chico de la toolbar de acciones rápidas en la card. */
function QuickBtn({
  children,
  title,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// ============================================================================
// Drawer detalle
// ============================================================================

function TaskDrawer({
  task,
  brands,
  members,
  canWrite,
  canAssign,
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
  onBrandCreated,
  allTags,
  onTagCreated,
  onTagUpdated,
  onTagDeleted,
  onTagsChanged,
  onAssigneesChanged,
}: {
  task: Task;
  brands: Brand[];
  members: User[];
  canWrite: boolean;
  canAssign: boolean;
  currentUserId: string;
  onClose: () => void;
  onUpdated: (t: Task) => void;
  onDeleted: (id: string) => void;
  onBrandCreated?: (b: Brand) => void;
  allTags: TaskTag[];
  onTagCreated: (t: TaskTag) => void;
  onTagUpdated?: (t: TaskTag) => void;
  onTagDeleted?: (tagId: string) => void;
  onTagsChanged: (tagIds: string[]) => void;
  onAssigneesChanged: (userIds: string[]) => void;
}) {
  const { confirm } = useConfirm();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [busy, setBusy] = useState(false);
  const [newSub, setNewSub] = useState("");
  const drawerAssignees = effectiveAssignees(task);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
  }, [task.id, task.title, task.description]);

  async function patch(data: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Error al guardar");
      return;
    }
    const j = await res.json();
    onUpdated(j.task);
  }

  async function saveTitle() {
    if (!title.trim() || title === task.title) return;
    await patch({ title: title.trim() });
  }
  async function saveDescription() {
    if (description === (task.description ?? "")) return;
    await patch({ description: description.trim() || null });
  }
  async function deleteTask() {
    // Soft delete: la tarea va a la papelera, se puede restaurar desde ahí
    // o desde el toast con "Deshacer" durante 5s.
    const ok = await confirm({
      title: "¿Mover esta tarea a la papelera?",
      description:
        "Vas a poder restaurarla desde la papelera o desde el toast.",
      confirmLabel: "Mover a papelera",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    setBusy(true);
    const taskId = task.id;
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      onDeleted(taskId);
      toast.success("Tarea movida a papelera", {
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              const r = await fetch(`/api/tasks/${taskId}/restore`, {
                method: "POST",
              });
              if (!r.ok) throw new Error();
              toast.success("Tarea restaurada. Recarga para verla.");
            } catch {
              toast.error("No se pudo restaurar");
            }
          },
        },
        duration: 5000,
      });
    } else {
      toast.error("No se pudo borrar");
    }
  }

  async function addSub() {
    const t = newSub.trim();
    if (!t) return;
    setNewSub("");
    const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    if (!res.ok) {
      toast.error("No se pudo agregar");
      return;
    }
    const j = await res.json();
    onUpdated({ ...task, subtasks: [...task.subtasks, j.subtask] });
  }
  async function toggleSub(s: Subtask) {
    // Optimistic
    onUpdated({
      ...task,
      subtasks: task.subtasks.map((x) =>
        x.id === s.id ? { ...x, completed: !x.completed } : x,
      ),
    });
    const res = await fetch(`/api/subtasks/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !s.completed }),
    });
    if (!res.ok) {
      onUpdated(task); // revert
      toast.error("Error");
    }
  }
  async function deleteSub(s: Subtask) {
    onUpdated({
      ...task,
      subtasks: task.subtasks.filter((x) => x.id !== s.id),
    });
    const res = await fetch(`/api/subtasks/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      onUpdated(task); // revert
      toast.error("Error");
    }
  }

  const completedSubs = task.subtasks.filter((s) => s.completed).length;
  const subProgress =
    task.subtasks.length > 0
      ? (completedSubs / task.subtasks.length) * 100
      : 0;
  const due = dueDateLabel(task.dueDate);
  const prio = PRIORITY_META[task.priority];

  const COLUMN_META = useColumnMeta();
  const { labelFor } = useColumnsList();
  const colMeta =
    COLUMN_META[task.status] ?? COLUMN_META[Object.keys(COLUMN_META)[0]];

  // === Popovers state ===
  type DrawerMenu = null | "assignee" | "priority" | "brand" | "status" | "due" | "tags" | "recurrence";
  const [drawerMenu, setDrawerMenu] = useState<DrawerMenu>(null);
  function closeDrawerMenu() {
    setDrawerMenu(null);
  }

  // === Checklist: edit inline + drag-and-drop ===
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubDraft, setEditSubDraft] = useState("");
  const [dragSubId, setDragSubId] = useState<string | null>(null);
  const [dragOverSubId, setDragOverSubId] = useState<string | null>(null);

  /** PATCH del título de una subtarea. Optimista. */
  async function editSub(s: Subtask, newTitle: string) {
    const trimmed = newTitle.trim();
    setEditingSubId(null);
    if (!trimmed || trimmed === s.title) return;
    // Optimistic
    onUpdated({
      ...task,
      subtasks: task.subtasks.map((x) =>
        x.id === s.id ? { ...x, title: trimmed } : x,
      ),
    });
    const res = await fetch(`/api/subtasks/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (!res.ok) {
      onUpdated(task);
      toast.error("No se pudo guardar");
    }
  }

  /** Reordena subtasks moviendo `fromId` antes de `toId` (o al final si null).
   *  Recalcula la position del item movido al promedio entre vecinos.
   *  Optimista con revert si el PATCH falla. */
  async function reorderSubs(fromId: string, toId: string | null) {
    if (fromId === toId) return;
    const sorted = [...task.subtasks].sort((a, b) => a.position - b.position);
    const fromIdx = sorted.findIndex((s) => s.id === fromId);
    if (fromIdx < 0) return;
    const [moved] = sorted.splice(fromIdx, 1);
    const toIdx = toId ? sorted.findIndex((s) => s.id === toId) : sorted.length;
    if (toIdx < 0) return;
    sorted.splice(toIdx, 0, moved);

    // Calcular nueva position: promedio entre vecino prev y next (o offsets)
    const prev = toIdx > 0 ? sorted[toIdx - 1] : null;
    const next = toIdx < sorted.length - 1 ? sorted[toIdx + 1] : null;
    let newPos: number;
    if (prev && next) newPos = (prev.position + next.position) / 2;
    else if (prev) newPos = prev.position + 1000;
    else if (next) newPos = next.position - 1000;
    else newPos = 1000;

    const updatedMoved = { ...moved, position: newPos };
    const newSubs = sorted.map((s) =>
      s.id === fromId ? updatedMoved : s,
    );

    // Optimistic
    onUpdated({ ...task, subtasks: newSubs });

    const res = await fetch(`/api/subtasks/${fromId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: newPos }),
    });
    if (!res.ok) {
      onUpdated(task);
      toast.error("No se pudo reordenar");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden p-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con tinte sutil del estado */}
        <header
          className={`relative flex items-center justify-between gap-3 border-b divider px-5 py-3.5`}
        >
          {/* Acento de color del estado a la izquierda */}
          <span
            aria-hidden
            className={`absolute left-0 top-0 h-full w-1 ${colMeta.pill}`}
          />
          <div className="flex flex-1 flex-wrap items-center gap-1.5 pl-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white shadow-sm ${colMeta.pill}`}
            >
              {labelFor(task.status)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-zinc-600">
              <Flag className={`h-3 w-3 ${prio.flag}`} fill="currentColor" />
              {prio.label}
            </span>
            {task.brand && (
              <span
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide"
                style={{
                  background: `${task.brand.color ?? "#a1a1aa"}1a`,
                  color: isDarkHex(task.brand.color ?? "") ? "#3f3f46" : task.brand.color ?? "#71717a",
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: task.brand.color ?? "#a1a1aa" }}
                />
                {task.brand.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Presencia: quién más está viendo esta tarea ahora mismo */}
            <PresenceIndicator taskId={task.id} hideWhenAlone />
            {canWrite && (
              <button
                onClick={deleteTask}
                disabled={busy}
                className="rounded-full p-1.5 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600"
                title="Borrar tarea"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Title editable */}
          {canWrite ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="-mx-2 w-[calc(100%+1rem)] rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 px-2 py-1.5 text-[22px] font-bold tracking-tight text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50 focus:border-solid focus:border-fuchsia-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-fuchsia-100"
            />
          ) : (
            <h2 className="-mx-2 px-2 text-[22px] font-bold tracking-tight text-zinc-900">
              {task.title}
            </h2>
          )}

          {/* Zona de VÍNCULOS — "de dónde viene / qué está vinculado a esta
              tarea": el post de origen (banner con miniatura) + los enlaces
              externos (Drive, Figma, sitio…), todo con el mismo lenguaje
              visual. Va arriba, antes de las propiedades. */}
          <TaskAttachments
            taskId={task.id}
            canWrite={canWrite}
            post={task.post}
            brandId={task.brandId}
          />

          {/* Properties rows — rich pickers (clickeables, no tabla) */}
          <div className="mt-5 space-y-1.5">
            {/* Asignado */}
            <PropertyRow label="Asignado a" icon={UserIcon}>
              <PropertyPicker
                onClick={() => canWrite && setDrawerMenu(drawerMenu === "assignee" ? null : "assignee")}
                disabled={!canWrite}
                open={drawerMenu === "assignee"}
                onClose={closeDrawerMenu}
                width="w-64"
                popover={
                  <MultiAssigneePopover
                    members={members}
                    canAssign={canAssign}
                    currentUserId={currentUserId}
                    selectedIds={drawerAssignees.map((a) => a.id)}
                    onChange={onAssigneesChanged}
                  />
                }
              >
                {drawerAssignees.length === 0 ? (
                  <span className="flex items-center gap-2 text-[13px] text-zinc-400">
                    <UserPlus className="h-4 w-4" />
                    Sin asignar
                  </span>
                ) : drawerAssignees.length === 1 ? (
                  <span className="flex items-center gap-2">
                    <Avatar user={drawerAssignees[0]} size="md" ring />
                    <span className="text-[13px] font-medium text-zinc-800">
                      {drawerAssignees[0].id === currentUserId
                        ? "Yo"
                        : drawerAssignees[0].name ?? drawerAssignees[0].email}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="flex items-center -space-x-1.5">
                      {drawerAssignees.slice(0, 3).map((a) => (
                        <Avatar key={a.id} user={a} size="md" ring />
                      ))}
                      {drawerAssignees.length > 3 && (
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-600 ring-2 ring-white">
                          +{drawerAssignees.length - 3}
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] font-medium text-zinc-800">
                      {drawerAssignees.length} personas
                    </span>
                  </span>
                )}
              </PropertyPicker>
            </PropertyRow>

            {/* Prioridad */}
            <PropertyRow label="Prioridad" icon={Flag}>
              <PropertyPicker
                onClick={() => canWrite && setDrawerMenu(drawerMenu === "priority" ? null : "priority")}
                disabled={!canWrite}
                open={drawerMenu === "priority"}
                onClose={closeDrawerMenu}
                width="w-48"
                popover={
                  <PriorityPopover
                    selected={task.priority}
                    onSelect={(p) => {
                      onUpdated({ ...task, priority: p });
                      patch({ priority: p });
                      closeDrawerMenu();
                    }}
                  />
                }
              >
                <span className="flex items-center gap-2">
                  <Flag
                    className={`h-3.5 w-3.5 ${prio.flag}`}
                    fill="currentColor"
                  />
                  <span className="text-[13px] font-medium text-zinc-800">
                    {prio.label}
                  </span>
                </span>
              </PropertyPicker>
            </PropertyRow>

            {/* Marca */}
            <PropertyRow label="Marca" icon={Tag}>
              <PropertyPicker
                onClick={() => canWrite && setDrawerMenu(drawerMenu === "brand" ? null : "brand")}
                disabled={!canWrite}
                open={drawerMenu === "brand"}
                onClose={closeDrawerMenu}
                width="w-64"
                popover={
                  <BrandPopover
                    brands={brands}
                    selectedId={task.brandId}
                    onCreate={onBrandCreated}
                    onSelect={(id) => {
                      const brand = id ? brands.find((b) => b.id === id) ?? null : null;
                      onUpdated({ ...task, brandId: id, brand });
                      patch({ brandId: id });
                      closeDrawerMenu();
                    }}
                  />
                }
              >
                {task.brand ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
                      style={{ background: task.brand.color ?? "#a1a1aa" }}
                    />
                    <span className="text-[13px] font-medium text-zinc-800">
                      {task.brand.name}
                    </span>
                  </span>
                ) : (
                  <span className="text-[13px] text-zinc-400">
                    Sin marca (agencia)
                  </span>
                )}
              </PropertyPicker>
            </PropertyRow>

            {/* (El vínculo al post se muestra como banner destacado arriba,
                no como una fila más entre las propiedades.) */}

            {/* Etiquetas */}
            <PropertyRow label="Etiquetas" icon={Tags}>
              <PropertyPicker
                onClick={() => canWrite && setDrawerMenu(drawerMenu === "tags" ? null : "tags")}
                disabled={!canWrite}
                open={drawerMenu === "tags"}
                onClose={closeDrawerMenu}
                width="w-72"
                popover={
                  <TagsPopover
                    allTags={allTags}
                    selectedIds={task.tags.map((t) => t.id)}
                    onChange={onTagsChanged}
                    onCreate={onTagCreated}
                    onUpdate={onTagUpdated}
                    onDelete={onTagDeleted}
                  />
                }
              >
                {task.tags.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-1">
                    {task.tags.map((t) => (
                      <TagChip key={t.id} tag={t} />
                    ))}
                  </span>
                ) : (
                  <span className="text-[13px] text-zinc-400">
                    Sin etiquetas
                  </span>
                )}
              </PropertyPicker>
            </PropertyRow>

            {/* Fecha límite — react-day-picker */}
            <PropertyRow label="Fecha límite" icon={CalendarDays}>
              <PropertyPicker
                onClick={() => canWrite && setDrawerMenu(drawerMenu === "due" ? null : "due")}
                disabled={!canWrite}
                open={drawerMenu === "due"}
                onClose={closeDrawerMenu}
                width="w-[320px]"
                popover={
                  <DueDatePopover
                    selected={task.dueDate ? new Date(task.dueDate) : undefined}
                    onSelect={(d) => {
                      const iso = d ? d.toISOString() : null;
                      onUpdated({ ...task, dueDate: iso });
                      patch({ dueDate: iso });
                      closeDrawerMenu();
                    }}
                  />
                }
              >
                {task.dueDate ? (
                  <span className="flex items-center gap-2">
                    <CalendarDays
                      className={`h-3.5 w-3.5 ${
                        due?.tone === "danger"
                          ? "text-rose-500"
                          : due?.tone === "warn"
                            ? "text-amber-500"
                            : "text-zinc-400"
                      }`}
                    />
                    <span
                      className={`text-[13px] font-medium ${
                        due?.tone === "danger"
                          ? "text-rose-600"
                          : due?.tone === "warn"
                            ? "text-amber-600"
                            : "text-zinc-800"
                      }`}
                    >
                      {new Date(task.dueDate).toLocaleDateString("es-CO", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    {due && (due.tone === "danger" || due.tone === "warn") && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide ${
                          due.tone === "danger"
                            ? "bg-rose-50 text-rose-600"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {due.label}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-[13px] text-zinc-400">Sin fecha</span>
                )}
              </PropertyPicker>
            </PropertyRow>

            {/* Recurrencia — al completar, se crea la próxima ocurrencia */}
            <PropertyRow label="Repetir" icon={Repeat}>
              <PropertyPicker
                onClick={() =>
                  canWrite &&
                  setDrawerMenu(drawerMenu === "recurrence" ? null : "recurrence")
                }
                disabled={!canWrite}
                open={drawerMenu === "recurrence"}
                onClose={closeDrawerMenu}
                width="w-52"
                popover={
                  <div className="p-1">
                    {(
                      [
                        [null, "No se repite"],
                        ["daily", "Cada día"],
                        ["weekly", "Cada semana"],
                        ["biweekly", "Cada 2 semanas"],
                        ["monthly", "Cada mes"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          onUpdated({ ...task, recurrence: value });
                          patch({ recurrence: value });
                          closeDrawerMenu();
                        }}
                        className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition hover:bg-zinc-50 ${
                          (task.recurrence ?? null) === value
                            ? "font-semibold text-zinc-900"
                            : "text-zinc-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                {task.recurrence ? (
                  <span className="flex items-center gap-2">
                    <Repeat className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-[13px] font-medium text-zinc-800">
                      {{
                        daily: "Cada día",
                        weekly: "Cada semana",
                        biweekly: "Cada 2 semanas",
                        monthly: "Cada mes",
                      }[task.recurrence] ?? task.recurrence}
                    </span>
                  </span>
                ) : (
                  <span className="text-[13px] text-zinc-400">No se repite</span>
                )}
              </PropertyPicker>
            </PropertyRow>

            {/* Estado */}
            <PropertyRow label="Estado" icon={CheckCircle2}>
              <PropertyPicker
                onClick={() => canWrite && setDrawerMenu(drawerMenu === "status" ? null : "status")}
                disabled={!canWrite}
                open={drawerMenu === "status"}
                onClose={closeDrawerMenu}
                width="w-52"
                popover={
                  <StatusPopover
                    selected={task.status}
                    onSelect={(s, sIsDone) => {
                      onUpdated({
                        ...task,
                        status: s,
                        completedAt: sIsDone ? new Date().toISOString() : null,
                      });
                      patch({ status: s });
                      closeDrawerMenu();
                    }}
                  />
                }
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white ${colMeta.pill}`}
                  >
                    {labelFor(task.status)}
                  </span>
                </span>
              </PropertyPicker>
            </PropertyRow>
          </div>

          {/* Description — edit-in-place con markdown simple */}
          <div className="mt-5">
            <DescriptionEditor
              value={description}
              onSave={async (next) => {
                setDescription(next);
                if (next === (task.description ?? "")) return;
                await patch({ description: next.trim() || null });
              }}
              canWrite={canWrite}
            />
          </div>

          {/* Subtasks */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-zinc-500">
                <ListChecks className="h-3.5 w-3.5" />
                Checklist
              </label>
              {task.subtasks.length > 0 && (
                <span
                  className={`rounded-md px-2 py-0.5 text-2xs font-bold tabular-nums ${
                    subProgress === 100
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {completedSubs}/{task.subtasks.length}
                </span>
              )}
            </div>
            {task.subtasks.length > 0 && (
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`task-progress-fill h-full rounded-full ${
                    subProgress === 100
                      ? "bg-gradient-to-r from-emerald-400 to-teal-400"
                      : colMeta.barFill
                  }`}
                  style={{ width: `${subProgress}%` }}
                />
              </div>
            )}
            <ul className="space-y-0.5">
              {task.subtasks.map((s) => {
                const isDragging = dragSubId === s.id;
                const isDragOver = dragOverSubId === s.id && dragSubId !== s.id;
                const isEditing = editingSubId === s.id;
                return (
                  <li
                    key={s.id}
                    draggable={canWrite && !isEditing}
                    onDragStart={(e) => {
                      if (!canWrite || isEditing) {
                        e.preventDefault();
                        return;
                      }
                      setDragSubId(s.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", s.id);
                    }}
                    onDragEnd={() => {
                      setDragSubId(null);
                      setDragOverSubId(null);
                    }}
                    onDragOver={(e) => {
                      if (!dragSubId || dragSubId === s.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverSubId !== s.id) setDragOverSubId(s.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverSubId === s.id) setDragOverSubId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverSubId(null);
                      if (dragSubId && dragSubId !== s.id) {
                        reorderSubs(dragSubId, s.id);
                      }
                      setDragSubId(null);
                    }}
                    className={`group/sub relative flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition ${
                      isDragging ? "opacity-40" : "hover:bg-zinc-50"
                    } ${
                      isDragOver
                        ? "before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:bg-gradient-to-r before:from-fuchsia-400 before:to-violet-500"
                        : ""
                    }`}
                  >
                    {/* Drag handle (solo si canWrite) */}
                    {canWrite && (
                      <span
                        className="cursor-grab text-zinc-300 opacity-0 transition active:cursor-grabbing group-hover/sub:opacity-100"
                        title="Arrastrar para reordenar"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    )}

                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => canWrite && toggleSub(s)}
                      disabled={!canWrite}
                      className="flex-shrink-0"
                      title={s.completed ? "Marcar pendiente" : "Marcar hecha"}
                    >
                      {s.completed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-zinc-300 transition hover:text-emerald-500" />
                      )}
                    </button>

                    {/* Title — edit inline al click */}
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editSubDraft}
                        onChange={(e) => setEditSubDraft(e.target.value)}
                        onBlur={() => editSub(s, editSubDraft)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            editSub(s, editSubDraft);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingSubId(null);
                          }
                        }}
                        className="input-soft flex-1 rounded-md px-2 py-1 text-[13px]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canWrite) return;
                          setEditSubDraft(s.title);
                          setEditingSubId(s.id);
                        }}
                        disabled={!canWrite}
                        className={`flex-1 truncate rounded-md px-1.5 py-0.5 text-left text-[13px] transition ${
                          s.completed
                            ? "text-zinc-400 line-through"
                            : "text-zinc-700"
                        } ${canWrite ? "hover:bg-white hover:ring-1 hover:ring-zinc-200" : ""}`}
                        title={canWrite ? "Click para editar" : undefined}
                      >
                        {s.title}
                      </button>
                    )}

                    {/* Delete (hover) */}
                    {canWrite && !isEditing && (
                      <button
                        type="button"
                        onClick={() => deleteSub(s)}
                        className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-zinc-300 opacity-0 transition group-hover/sub:opacity-100 hover:bg-rose-50 hover:text-rose-500"
                        title="Borrar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {canWrite && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSub();
                    }
                  }}
                  placeholder="Agregar paso… (Enter para crear)"
                  className="input-soft flex-1 rounded-lg px-2.5 py-1.5 text-[12.5px]"
                />
                <button
                  onClick={addSub}
                  disabled={!newSub.trim()}
                  className="btn-secondary inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                  Agregar
                </button>
              </div>
            )}
          </div>

          {/* Comentarios + Activity log */}
          <TaskActivityComments
            taskId={task.id}
            currentUserId={currentUserId}
            canWrite={canWrite}
          />

          {/* Meta info */}
          <div className="mt-5 border-t divider pt-3 text-2xs text-zinc-400">
            Creado por <strong className="text-zinc-600">{task.creator?.name ?? task.creator?.email ?? "?"}</strong>{" "}
            el {new Date(task.createdAt).toLocaleDateString("es-CO")}
            {task.completedAt && (
              <>
                {" · "}Completada el{" "}
                {new Date(task.completedAt).toLocaleDateString("es-CO")}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Drawer helpers — PropertyRow, PropertyPicker, popovers
// ============================================================================

/** Row tipo Linear/Notion: label fijo a la izq, valor clickeable a la derecha. */
function PropertyRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Flag;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="flex w-32 flex-shrink-0 items-center gap-2 text-[12px] font-semibold text-zinc-500">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Trigger clickeable estilo "chip selector" — claramente interactivo:
 *  - Borde visible siempre (no fantasma)
 *  - Hover: bg + borde más fuerte
 *  - Chevron más oscuro y obvio
 *  - Indicador "✏️ click to edit" sutil al hover en cursor pointer
 */
function PropertyPicker({
  children,
  onClick,
  disabled,
  open,
  onClose,
  popover,
  width,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  open: boolean;
  onClose: () => void;
  popover: React.ReactNode;
  width: string;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`group/pick flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left transition disabled:cursor-default disabled:opacity-70 ${
          open
            ? "border-fuchsia-300 shadow-[0_0_0_3px_rgba(217,70,239,0.12)]"
            : "border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/60 disabled:hover:bg-white disabled:hover:border-zinc-200"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center">{children}</span>
        {!disabled && (
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition group-hover/pick:text-zinc-700 ${
              open ? "rotate-180 text-fuchsia-500" : ""
            }`}
          />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} />
          <div
            className={`card absolute right-0 top-full z-40 mt-1.5 ${width} overflow-hidden p-0 shadow-xl`}
          >
            {popover}
          </div>
        </>
      )}
    </div>
  );
}

function AssigneePopover({
  members,
  canAssign,
  currentUserId,
  selectedId,
  onSelect,
}: {
  members: User[];
  canAssign: boolean;
  currentUserId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="max-h-64 overflow-y-auto py-1">
      <PickerSection>Asignar a</PickerSection>
      <PickerItem onClick={() => onSelect(null)}>
        <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-zinc-300 text-zinc-300">
          <X className="h-3 w-3" />
        </span>
        Sin asignar
      </PickerItem>
      {members.map((m) => {
        const isMe = m.id === currentUserId;
        return (
          <PickerItem
            key={m.id}
            disabled={!isMe && !canAssign}
            selected={selectedId === m.id}
            onClick={() => onSelect(m.id)}
          >
            <Avatar user={m} size="md" />
            <span className="truncate">{isMe ? "Yo" : m.name ?? m.email}</span>
          </PickerItem>
        );
      })}
    </div>
  );
}

/** Versión multi-select del AssigneePopover: cada click toggle in/out de
 *  la lista. NO cierra el popover automáticamente — el user puede
 *  agregar/quitar varios sin reabrir. */
function MultiAssigneePopover({
  members,
  canAssign,
  currentUserId,
  selectedIds,
  onChange,
}: {
  members: User[];
  canAssign: boolean;
  currentUserId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(uid: string) {
    if (selectedIds.includes(uid)) {
      onChange(selectedIds.filter((id) => id !== uid));
    } else {
      onChange([...selectedIds, uid]);
    }
  }
  return (
    <div className="max-h-72 overflow-y-auto py-1">
      <PickerSection>
        Asignados {selectedIds.length > 0 && `(${selectedIds.length})`}
      </PickerSection>
      {selectedIds.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-rose-600 transition hover:bg-rose-50"
        >
          <X className="h-3 w-3" />
          Quitar todos
        </button>
      )}
      {members.map((m) => {
        const isMe = m.id === currentUserId;
        return (
          <PickerItem
            key={m.id}
            disabled={!isMe && !canAssign}
            selected={selectedIds.includes(m.id)}
            onClick={() => toggle(m.id)}
          >
            <Avatar user={m} size="md" />
            <span className="truncate">{isMe ? "Yo" : m.name ?? m.email}</span>
          </PickerItem>
        );
      })}
    </div>
  );
}

function PriorityPopover({
  selected,
  onSelect,
}: {
  selected: TaskPriority;
  onSelect: (p: TaskPriority) => void;
}) {
  const opts: Array<{ value: TaskPriority; label: string; flagColor: string }> = [
    { value: "urgent", label: "Urgente", flagColor: "text-rose-500" },
    { value: "high", label: "Alta", flagColor: "text-amber-500" },
    { value: "normal", label: "Normal", flagColor: "text-blue-500" },
    { value: "low", label: "Baja", flagColor: "text-zinc-400" },
  ];
  return (
    <div className="py-1">
      <PickerSection>Prioridad</PickerSection>
      {opts.map((o) => (
        <PickerItem
          key={o.value}
          selected={selected === o.value}
          onClick={() => onSelect(o.value)}
        >
          <Flag className={`h-3.5 w-3.5 ${o.flagColor}`} fill="currentColor" />
          {o.label}
        </PickerItem>
      ))}
    </div>
  );
}

/** Paleta sugerida para marcas nuevas — colores distintivos no-conflictivos
 *  con los del Kanban (que también usa Tailwind 500s). */
const BRAND_COLOR_PRESETS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
] as const;

function BrandPopover({
  brands,
  selectedId,
  onSelect,
  onCreate,
}: {
  brands: Brand[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate?: (b: Brand) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(BRAND_COLOR_PRESETS[0]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "No se pudo crear");
        if (j.suggestedPlan) {
          toast.info(`Sube al plan ${j.suggestedPlan} para más marcas`);
        }
        return;
      }
      const brand: Brand = {
        id: j.brand.id,
        name: j.brand.name,
        color: j.brand.color,
        logoUrl: j.brand.logoUrl,
      };
      onCreate?.(brand);
      onSelect(brand.id);
      toast.success(`Marca "${brand.name}" creada`);
      // Reset form
      setNewName("");
      setNewColor(BRAND_COLOR_PRESETS[0]);
      setCreating(false);
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-3xs font-bold uppercase tracking-wider text-zinc-400">
            Nueva marca
          </p>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="text-zinc-400 hover:text-zinc-700"
            title="Cancelar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setCreating(false);
              setNewName("");
            }
          }}
          placeholder="Nombre de la marca"
          maxLength={80}
          className="input-soft w-full rounded-md px-2.5 py-1.5 text-[13px]"
        />
        <div className="mt-2.5">
          <p className="mb-1.5 text-3xs font-semibold uppercase tracking-wider text-zinc-400">
            Color
          </p>
          <div className="flex flex-wrap gap-1.5">
            {BRAND_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`h-6 w-6 rounded-full transition hover:scale-110 ${
                  newColor === c ? "ring-2 ring-zinc-900 ring-offset-2" : ""
                }`}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!newName.trim() || busy}
            className="btn-gradient inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Crear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto py-1">
      <p className="px-3 py-1 text-3xs font-bold uppercase tracking-wider text-zinc-400">
        Marca
      </p>
      <button
        onClick={() => onSelect(null)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-zinc-600 transition hover:bg-zinc-50"
      >
        <span className="inline-block h-3 w-3 rounded-full bg-zinc-200" />
        Sin marca (agencia)
      </button>
      {brands.map((b) => {
        const selected = selectedId === b.id;
        return (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition hover:bg-zinc-50 ${
              selected ? "bg-fuchsia-50/40 font-semibold text-zinc-900" : "text-zinc-700"
            }`}
          >
            <span
              className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
              style={{ background: b.color ?? "#a1a1aa" }}
            />
            <span className="truncate">{b.name}</span>
            {selected && (
              <CheckCircle2 className="ml-auto h-4 w-4 flex-shrink-0 text-emerald-500" />
            )}
          </button>
        );
      })}
      {onCreate && (
        <>
          <div className="my-1 border-t divider" />
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-semibold text-fuchsia-600 transition hover:bg-fuchsia-50/40"
          >
            <span className="grid h-3 w-3 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">
              <Plus className="h-2.5 w-2.5" />
            </span>
            Crear marca nueva
          </button>
        </>
      )}
    </div>
  );
}

/** Chip visual de una tag (color de fondo teñido + texto del color). */
function TagChip({ tag, onRemove }: { tag: TaskTag; onRemove?: () => void }) {
  const isDark = isDarkHex(tag.color);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold"
      style={{
        background: `${tag.color}22`,
        color: isDark ? "#3f3f46" : tag.color,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ background: tag.color }}
      />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 grid h-3 w-3 place-items-center rounded-full opacity-60 transition hover:bg-black/10 hover:opacity-100"
          title="Quitar"
        >
          <X className="h-2 w-2" />
        </button>
      )}
    </span>
  );
}

const TAG_COLOR_PRESETS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
  "#0ea5e9", "#84cc16", "#06b6d4", "#71717a",
] as const;

function TagsPopover({
  allTags,
  selectedIds,
  onChange,
  onCreate,
  onUpdate,
  onDelete,
}: {
  allTags: TaskTag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreate: (t: TaskTag) => void;
  onUpdate?: (t: TaskTag) => void;
  onDelete?: (tagId: string) => void;
}) {
  const { confirm } = useConfirm();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TAG_COLOR_PRESETS[0]);
  const [busy, setBusy] = useState(false);
  // Edit inline: id de la tag siendo editada + drafts
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(TAG_COLOR_PRESETS[0]);

  function toggle(tagId: string) {
    if (selectedIds.includes(tagId)) {
      onChange(selectedIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedIds, tagId]);
    }
  }

  function startEdit(t: TaskTag) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditColor(t.color);
  }

  async function submitEdit() {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/task-tags/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: editColor }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "No se pudo guardar");
        return;
      }
      onUpdate?.(j.tag);
      setEditingId(null);
      toast.success("Etiqueta actualizada");
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function submitDelete(t: TaskTag) {
    const ok = await confirm({
      title: `¿Borrar la etiqueta "${t.name}"?`,
      description: "Se quitará de todas las tareas que la usan.",
      confirmLabel: "Borrar etiqueta",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/task-tags/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDelete?.(t.id);
      // Si estaba seleccionada, removerla del set actual de la tarea abierta
      if (selectedIds.includes(t.id)) {
        onChange(selectedIds.filter((id) => id !== t.id));
      }
      toast.success("Etiqueta borrada");
    } catch {
      toast.error("No se pudo borrar");
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/task-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "No se pudo crear");
        return;
      }
      onCreate(j.tag);
      // Auto-asignar a la tarea recién creando la etiqueta
      onChange([...selectedIds, j.tag.id]);
      setNewName("");
      setNewColor(TAG_COLOR_PRESETS[0]);
      setCreating(false);
      setQuery("");
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filteredTags = q
    ? allTags.filter((t) => t.name.toLowerCase().includes(q))
    : allTags;
  const exactMatch = allTags.some((t) => t.name.toLowerCase() === q);

  if (creating) {
    return (
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-3xs font-bold uppercase tracking-wider text-zinc-400">
            Nueva etiqueta
          </p>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="text-zinc-400 hover:text-zinc-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitCreate();
            } else if (e.key === "Escape") {
              setCreating(false);
              setNewName("");
            }
          }}
          placeholder="Nombre de la etiqueta"
          maxLength={40}
          className="input-soft w-full rounded-md px-2.5 py-1.5 text-[13px]"
        />
        <div className="mt-2.5">
          <p className="mb-1.5 text-3xs font-semibold uppercase tracking-wider text-zinc-400">
            Color
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`h-6 w-6 rounded-full transition hover:scale-110 ${
                  newColor === c ? "ring-2 ring-zinc-900 ring-offset-2" : ""
                }`}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </div>
        {/* Preview */}
        {newName.trim() && (
          <div className="mt-3">
            <p className="mb-1 text-3xs font-semibold uppercase tracking-wider text-zinc-400">
              Preview
            </p>
            <TagChip tag={{ id: "preview", name: newName.trim(), color: newColor }} />
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submitCreate}
            disabled={!newName.trim() || busy}
            className="btn-gradient inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Crear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-80 flex-col">
      <div className="border-b divider p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar o crear etiqueta…"
          className="input-soft w-full rounded-md px-2 py-1 text-[12.5px]"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filteredTags.length === 0 && q && (
          <p className="px-3 py-2 text-[12px] text-zinc-400">
            No hay etiquetas que coincidan.
          </p>
        )}
        {filteredTags.length === 0 && !q && (
          <p className="px-3 py-2 text-[12px] text-zinc-400">
            Sin etiquetas todavía. Crea la primera.
          </p>
        )}
        {filteredTags.map((t) => {
          const isSelected = selectedIds.includes(t.id);
          const isEditing = editingId === t.id;

          // Form de edición inline (reemplaza la row normal)
          if (isEditing) {
            return (
              <div
                key={t.id}
                className="border-y divider bg-zinc-50/60 px-3 py-2.5"
              >
                <p className="mb-2 text-3xs font-bold uppercase tracking-wider text-zinc-500">
                  Editar etiqueta
                </p>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitEdit();
                    } else if (e.key === "Escape") {
                      setEditingId(null);
                    }
                  }}
                  maxLength={40}
                  className="input-soft mb-2 w-full rounded-md px-2 py-1 text-[12.5px]"
                />
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {TAG_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`h-5 w-5 rounded-full transition hover:scale-110 ${
                        editColor === c
                          ? "ring-2 ring-zinc-900 ring-offset-2"
                          : ""
                      }`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
                {editName.trim() && (
                  <div className="mb-2">
                    <TagChip
                      tag={{
                        id: "preview",
                        name: editName.trim(),
                        color: editColor,
                      }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-500 hover:bg-zinc-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={submitEdit}
                    disabled={!editName.trim() || busy}
                    className="btn-gradient inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Guardar
                  </button>
                </div>
              </div>
            );
          }

          // Row normal con acciones inline al hover
          return (
            <div
              key={t.id}
              className={`group/tag flex w-full items-center gap-2 px-3 py-1.5 transition hover:bg-zinc-50 ${
                isSelected ? "bg-fuchsia-50/40" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className="flex flex-1 items-center gap-2 text-left"
              >
                <TagChip tag={t} />
              </button>
              {isSelected && (
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              )}
              {/* Acciones inline (solo al hover si onUpdate/onDelete están) */}
              {(onUpdate || onDelete) && (
                <span className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition group-hover/tag:opacity-100">
                  {onUpdate && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(t);
                      }}
                      title="Editar"
                      className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        submitDelete(t);
                      }}
                      title="Borrar"
                      className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Crear nueva */}
      {!exactMatch && (
        <div className="border-t divider">
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              if (q) setNewName(q);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-semibold text-fuchsia-600 transition hover:bg-fuchsia-50/40"
          >
            <span className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">
              <Plus className="h-3 w-3" />
            </span>
            {q ? `Crear "${q}"` : "Crear etiqueta nueva"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPopover({
  selected,
  onSelect,
}: {
  selected: TaskStatus;
  onSelect: (s: TaskStatus, isDone: boolean) => void;
}) {
  const COLUMN_META = useColumnMeta();
  const { columns } = useColumnsList();
  const fallback = COLUMN_META[Object.keys(COLUMN_META)[0]];
  return (
    <div className="py-1">
      <PickerSection>Estado</PickerSection>
      {columns.map((col) => {
        const m = COLUMN_META[col.id] ?? fallback;
        return (
          <PickerItem
            key={col.id}
            selected={selected === col.id}
            onClick={() => onSelect(col.id, col.isDone)}
          >
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-white ${m.pill}`}
            >
              {col.label}
            </span>
          </PickerItem>
        );
      })}
    </div>
  );
}

// ============================================================================
// Botón "Agregar columna" con menú: vacía o por cliente
// ============================================================================

function AddColumnButton({
  brands,
  onAddEmpty,
  onAddClient,
}: {
  brands: Brand[];
  onAddEmpty: () => void;
  onAddClient: (brand: Brand) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative w-[82vw] max-w-[320px] flex-shrink-0 snap-start sm:w-[300px] sm:max-w-none">
      <button
        type="button"
        onClick={() => (brands.length > 0 ? setOpen((v) => !v) : onAddEmpty())}
        className="group flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 text-[13px] font-semibold text-zinc-400 transition hover:border-fuchsia-300 hover:bg-fuchsia-50/40 hover:text-fuchsia-500"
      >
        <Plus className="h-4 w-4 transition group-hover:rotate-90" />
        Agregar columna
        {brands.length > 0 && (
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-14 z-20 w-full card overflow-hidden py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddEmpty();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <Plus className="h-3.5 w-3.5 text-zinc-400" />
              Columna vacía
            </button>
            <PickerDivider />
            <PickerSection>Columna por cliente (auto-recibe completadas)</PickerSection>
            <div className="max-h-52 overflow-y-auto">
              {brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAddClient(b);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-700 transition hover:bg-fuchsia-50/50"
                >
                  <span
                    className="h-3 w-3 flex-shrink-0 rounded-full ring-2 ring-white"
                    style={{ background: b.color ?? "#a1a1aa" }}
                  />
                  <span className="truncate">{b.name}</span>
                  <Zap className="ml-auto h-3 w-3 flex-shrink-0 text-fuchsia-400" fill="currentColor" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Modal de configuración de columna — reglas auto, WIP, auto-archivar
// ============================================================================

function ColumnSettingsModal({
  column,
  brands,
  members,
  allColumns,
  onSave,
  onClose,
}: {
  column: TaskColumn;
  brands: Brand[];
  members: User[];
  allColumns: TaskColumn[];
  onSave: (next: TaskColumn) => void;
  onClose: () => void;
}) {
  // Draft local — se aplica al guardar.
  const [label, setLabel] = useState(column.label);
  const [color, setColor] = useState<TaskColor>(column.color);
  const [isDone, setIsDone] = useState(column.isDone);
  const [ruleOn, setRuleOn] = useState(!!column.rule);
  const [ruleBrand, setRuleBrand] = useState<string>(column.rule?.brandId ?? "");
  const [ruleWhenDone, setRuleWhenDone] = useState(column.rule?.whenDone ?? false);
  const [rulePriority, setRulePriority] = useState<string>(
    column.rule?.priority ?? "",
  );
  const [ruleAssignee, setRuleAssignee] = useState<string>(
    column.rule?.assigneeId ?? "",
  );
  const [ruleFromStatus, setRuleFromStatus] = useState<string>(
    column.rule?.fromStatus ?? "",
  );
  const [wipLimit, setWipLimit] = useState<string>(
    column.wipLimit ? String(column.wipLimit) : "",
  );
  const [archiveDays, setArchiveDays] = useState<string>(
    column.autoArchiveDays ? String(column.autoArchiveDays) : "",
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ruleHasCond =
    ruleOn &&
    (!!ruleBrand ||
      ruleWhenDone ||
      !!rulePriority ||
      !!ruleAssignee ||
      !!ruleFromStatus);

  function save() {
    const rule =
      ruleOn && ruleHasCond
        ? {
            brandId: ruleBrand || null,
            whenDone: ruleWhenDone,
            priority: (rulePriority || null) as TaskPriority | null,
            assigneeId: ruleAssignee || null,
            fromStatus: ruleFromStatus || null,
          }
        : null;
    onSave({
      ...column,
      label: label.trim() || column.label,
      color,
      isDone,
      rule,
      wipLimit: wipLimit ? Math.max(0, parseInt(wipLimit, 10)) || null : null,
      autoArchiveDays: archiveDays
        ? Math.max(0, parseInt(archiveDays, 10)) || null
        : null,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border divider bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b divider px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-3 w-3 rounded-full ${COLOR_META[color].pill}`}
            />
            <h2 className="text-[15px] font-bold text-zinc-900">
              Configurar columna
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Nombre */}
          <div>
            <label className="mb-1.5 block text-2xs font-bold uppercase tracking-wider text-zinc-500">
              Nombre
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={30}
              className="input-soft w-full rounded-lg px-3 py-2 text-[13px]"
            />
          </div>

          {/* Color */}
          <div>
            <label className="mb-1.5 block text-2xs font-bold uppercase tracking-wider text-zinc-500">
              Color
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {TASK_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className={`grid h-6 w-6 place-items-center rounded-full transition hover:scale-110 ${COLOR_META[c].pill} ${
                    color === c ? "ring-2 ring-zinc-900 ring-offset-2" : ""
                  }`}
                >
                  {color === c && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Marcar como final */}
          <ToggleRow
            label="Columna final (completado)"
            help="Las tareas que entren aquí cuentan como completadas."
            checked={isDone}
            onChange={setIsDone}
          />

          {/* === Regla automática === */}
          <div className="rounded-xl border divider bg-zinc-50/60 p-3.5">
            <ToggleRow
              label="Mover tareas aquí automáticamente"
              help="Cuando una tarea cumpla TODAS las condiciones, se mueve sola a esta columna."
              checked={ruleOn}
              onChange={setRuleOn}
              accent
            />
            {ruleOn && (
              <div className="mt-3 space-y-2.5 border-t divider pt-3">
                {/* Viene del estado (columna actual) */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-zinc-700">
                    Viene del estado
                  </span>
                  <select
                    value={ruleFromStatus}
                    onChange={(e) => setRuleFromStatus(e.target.value)}
                    className="input-soft max-w-[55%] rounded-md px-2 py-1 text-[12px]"
                  >
                    <option value="">Cualquiera</option>
                    {allColumns
                      .filter((c) => c.id !== column.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                </div>
                {/* Marca */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-zinc-700">
                    Marca / cliente
                  </span>
                  <select
                    value={ruleBrand}
                    onChange={(e) => setRuleBrand(e.target.value)}
                    className="input-soft max-w-[55%] rounded-md px-2 py-1 text-[12px]"
                  >
                    <option value="">Cualquiera</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Completada */}
                <ToggleRow
                  label="Está completada"
                  checked={ruleWhenDone}
                  onChange={setRuleWhenDone}
                  compact
                />
                {/* Prioridad */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-zinc-700">
                    Prioridad
                  </span>
                  <select
                    value={rulePriority}
                    onChange={(e) => setRulePriority(e.target.value)}
                    className="input-soft max-w-[55%] rounded-md px-2 py-1 text-[12px]"
                  >
                    <option value="">Cualquiera</option>
                    <option value="urgent">Urgente</option>
                    <option value="high">Alta</option>
                    <option value="normal">Normal</option>
                    <option value="low">Baja</option>
                  </select>
                </div>
                {/* Asignado */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-zinc-700">
                    Asignado a
                  </span>
                  <select
                    value={ruleAssignee}
                    onChange={(e) => setRuleAssignee(e.target.value)}
                    className="input-soft max-w-[55%] rounded-md px-2 py-1 text-[12px]"
                  >
                    <option value="">Cualquiera</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? m.email}
                      </option>
                    ))}
                  </select>
                </div>
                {ruleOn && !ruleHasCond && (
                  <p className="flex items-center gap-1.5 text-2xs font-medium text-amber-600">
                    <AlertCircle className="h-3 w-3" />
                    Elige al menos una condición.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Límite WIP */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[12.5px] font-semibold text-zinc-800">
                Límite de tareas (WIP)
              </p>
              <p className="text-2xs text-zinc-500">
                Aviso visual al superarlo. 0 = sin límite.
              </p>
            </div>
            <input
              type="number"
              min={0}
              max={999}
              value={wipLimit}
              onChange={(e) => setWipLimit(e.target.value)}
              placeholder="0"
              className="input-soft w-16 rounded-md px-2 py-1 text-center text-[13px]"
            />
          </div>

          {/* Auto-archivar — solo tiene sentido en columnas finales */}
          {isDone && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-semibold text-zinc-800">
                  Auto-archivar después de
                </p>
                <p className="text-2xs text-zinc-500">
                  Tareas completadas con más de N días van a la papelera. 0 = off.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={3650}
                  value={archiveDays}
                  onChange={(e) => setArchiveDays(e.target.value)}
                  placeholder="0"
                  className="input-soft w-16 rounded-md px-2 py-1 text-center text-[13px]"
                />
                <span className="text-[12px] text-zinc-500">días</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t divider bg-zinc-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            className="btn-gradient rounded-lg px-4 py-1.5 text-[12.5px] font-semibold"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Fila con toggle switch reutilizable para el modal de columna. */
function ToggleRow({
  label,
  help,
  checked,
  onChange,
  accent,
  compact,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <div className="min-w-0">
        <p
          className={`${compact ? "text-[12.5px]" : "text-[13px]"} font-semibold text-zinc-800`}
        >
          {label}
        </p>
        {help && <p className="mt-0.5 text-2xs text-zinc-500">{help}</p>}
      </div>
      <span
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition ${
          checked ? (accent ? "bg-fuchsia-500" : "bg-emerald-500") : "bg-zinc-300"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Calendar custom — minimalista, gradient brand en el día seleccionado.
 * Sin librería externa de UI, solo date-fns que ya usabamos para tiempos.
 * Decisiones de diseño:
 *  - Lunes primero (formato es-CO)
 *  - Días circulares (rounded-full)
 *  - Hover violeta sutil (8% alpha)
 *  - Día actual: dot de gradient debajo + texto violeta
 *  - Día seleccionado: gradient brand + sombra de color + scale 1.05
 *  - Días outside del mes muy sutiles (zinc-200)
 */
function DueDatePopover({
  selected,
  onSelect,
}: {
  selected: Date | undefined;
  onSelect: (d: Date | undefined) => void;
}) {
  const [viewDate, setViewDate] = useState(selected ?? new Date());

  // Rejilla 7x6: desde el lunes de la semana del 1° del mes hasta el domingo
  // de la semana del último día. Usamos `weekStartsOn: 1` (lunes).
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekdays = ["L", "M", "X", "J", "V", "S", "D"];

  function setQuickDate(daysFromNow: number) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + daysFromNow);
    onSelect(d);
  }

  return (
    <div className="w-[300px] p-3">
      {/* Quick shortcuts */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <QuickDateBtn onClick={() => setQuickDate(0)}>Hoy</QuickDateBtn>
        <QuickDateBtn onClick={() => setQuickDate(1)}>Mañana</QuickDateBtn>
        <QuickDateBtn onClick={() => setQuickDate(7)}>En 7 días</QuickDateBtn>
      </div>

      {/* Header: mes/año + flechas */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-bold capitalize tracking-tight text-zinc-900">
          {format(viewDate, "MMMM yyyy", { locale: es })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewDate((d) => subMonths(d, 1))}
            className="grid h-7 w-7 place-items-center rounded-full text-zinc-400 transition hover:bg-fuchsia-50 hover:text-fuchsia-600"
            title="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewDate(new Date())}
            className="rounded-full px-2 py-1 text-[10.5px] font-semibold text-zinc-500 transition hover:bg-fuchsia-50 hover:text-fuchsia-600"
            title="Ir a hoy"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setViewDate((d) => addMonths(d, 1))}
            className="grid h-7 w-7 place-items-center rounded-full text-zinc-400 transition hover:bg-fuchsia-50 hover:text-fuchsia-600"
            title="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Días de la semana */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {weekdays.map((d, i) => (
          <div
            key={i}
            className="grid h-7 place-items-center text-3xs font-bold uppercase tracking-wider text-zinc-400"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewDate);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              className={`relative grid h-9 w-9 place-items-center rounded-full text-[13px] transition ${
                isSelected
                  ? "btn-gradient scale-105 font-bold text-white shadow-lg shadow-fuchsia-500/30"
                  : today
                    ? "font-bold text-fuchsia-600 hover:bg-fuchsia-50"
                    : inMonth
                      ? "font-medium text-zinc-700 hover:bg-fuchsia-50 hover:text-fuchsia-600"
                      : "font-normal text-zinc-300 hover:bg-zinc-50 hover:text-zinc-500"
              }`}
            >
              {day.getDate()}
              {today && !isSelected && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full brand-gradient" />
              )}
            </button>
          );
        })}
      </div>

      {/* Quitar fecha */}
      {selected && (
        <div className="mt-3 border-t divider pt-2">
          <button
            onClick={() => onSelect(undefined)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-rose-600 transition hover:bg-rose-50"
          >
            <X className="h-3.5 w-3.5" />
            Quitar fecha
          </button>
        </div>
      )}
    </div>
  );
}

function QuickDateBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-zinc-100 px-2.5 py-1 text-2xs font-semibold text-zinc-700 transition hover:bg-gradient-to-r hover:from-fuchsia-100 hover:to-violet-100 hover:text-fuchsia-700"
    >
      {children}
    </button>
  );
}
