/**
 * Constantes + tipos del sistema de tareas. NO importa nada del server.
 * Seguro para client components.
 *
 * Las funciones que tocan DB (getUserTaskAgency, sanitizeTaskTitle, etc.)
 * viven en `./tasks.ts` y solo deben usarse server-side.
 */

/** Ids de las 4 columnas default. Existen siempre en agencies nuevas y son
 *  los ids de las tareas legacy (creadas antes de columnas custom). */
export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "review",
  "done",
] as const;

/**
 * Antes era un union fijo. Ahora las columnas son dinámicas por agency, así
 * que un status es cualquier string (el id de la columna). Mantenemos el
 * nombre del tipo para no tocar las ~12 referencias existentes.
 */
export type TaskStatus = string;

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}
export function isTaskPriority(v: unknown): v is TaskPriority {
  return (
    typeof v === "string" && (TASK_PRIORITIES as readonly string[]).includes(v)
  );
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Por hacer",
  in_progress: "En progreso",
  review: "En revisión",
  done: "Hechas",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

/** Color de fondo (dot/pill) por prioridad. Compartido por spotlight,
 *  papelera, etc. — antes estaba duplicado en cada archivo. */
export const TASK_PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  normal: "bg-blue-500",
  low: "bg-zinc-400",
};

/**
 * Paleta de colores Tailwind permitidos para customizar las columnas del
 * Kanban. Limitado a las familias que combinan bien con bg-blanco + texto
 * blanco/oscuro. NO incluye grays neutros (zinc/stone) — para usar "neutro"
 * deja el default `slate` en la columna `todo`.
 */
export const TASK_COLOR_PALETTE = [
  "slate",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "fuchsia",
  "pink",
  "rose",
] as const;
export type TaskColor = (typeof TASK_COLOR_PALETTE)[number];

export function isTaskColor(v: unknown): v is TaskColor {
  return typeof v === "string" && (TASK_COLOR_PALETTE as readonly string[]).includes(v);
}

/** Default por status si la agency no lo customizó. */
export const DEFAULT_STATUS_COLORS: Record<TaskStatus, TaskColor> = {
  todo: "slate",
  in_progress: "blue",
  review: "violet",
  done: "emerald",
};

/** Shape persistido en Agency.taskStatusColors. */
export type StatusColorsMap = Partial<Record<TaskStatus, TaskColor>>;

/** Resuelve color final mergeando custom con defaults. Tolera valores
 *  inválidos en DB (legacy / corrupto) volviendo al default. */
export function resolveStatusColors(
  raw: unknown,
): Record<TaskStatus, TaskColor> {
  const out = { ...DEFAULT_STATUS_COLORS };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const s of TASK_STATUSES) {
    const v = obj[s];
    if (isTaskColor(v)) out[s] = v;
  }
  return out;
}

// ============================================================================
// Columnas dinámicas del Kanban
// ============================================================================

/**
 * Regla de auto-movimiento de una columna. Cuando una tarea cumple TODAS las
 * condiciones definidas (AND), se mueve automáticamente a esta columna. Las
 * condiciones `undefined`/`null` se ignoran. Una regla sin ninguna condición
 * no matchea nada (evita auto-mover todo).
 *
 * Ejemplo del user: "completadas del cliente Posicionados" →
 *   { brandId: "<id>", whenDone: true }
 */
export type ColumnRule = {
  /** La tarea pertenece a esta marca. */
  brandId?: string | null;
  /** La tarea está completada (en una columna final). */
  whenDone?: boolean;
  /** La tarea tiene esta prioridad. */
  priority?: TaskPriority | null;
  /** La tarea está asignada a este user. */
  assigneeId?: string | null;
  /** La tarea viene de (está en) esta columna/estado. Cuando una tarea entra
   *  a esta columna, se rutea a la columna dueña de la regla. */
  fromStatus?: string | null;
};

/**
 * Una columna del tablero. `id` es estable (lo referencian las tareas vía
 * Task.status). `isDone` marca la columna "final" — las tareas que entran ahí
 * se consideran completadas (setean completedAt).
 *
 * Campos de automatización (todos opcionales):
 *  - `rule`: auto-mover tareas que cumplan condiciones.
 *  - `wipLimit`: máximo de tareas recomendado (aviso visual, no bloqueo).
 *  - `autoArchiveDays`: tareas completadas con más de N días aquí se mandan
 *    solas a la papelera. Solo tiene sentido en columnas `isDone`.
 */
export type TaskColumn = {
  id: string;
  label: string;
  color: TaskColor;
  isDone: boolean;
  rule?: ColumnRule | null;
  wipLimit?: number | null;
  autoArchiveDays?: number | null;
};

/** Estado mínimo de una tarea para evaluar reglas. */
export type TaskRuleState = {
  brandId: string | null;
  priority: TaskPriority;
  assigneeIds: string[];
  isDone: boolean;
  /** Columna actual de la tarea (para la condición fromStatus). */
  status: string;
};

/** ¿La regla tiene al menos una condición activa? */
export function ruleHasConditions(rule: ColumnRule | null | undefined): boolean {
  if (!rule) return false;
  return (
    (rule.brandId != null && rule.brandId !== "") ||
    rule.whenDone === true ||
    (rule.priority != null && rule.priority !== undefined) ||
    (rule.assigneeId != null && rule.assigneeId !== "") ||
    (rule.fromStatus != null && rule.fromStatus !== "")
  );
}

/** ¿La tarea cumple TODAS las condiciones de la regla? */
export function taskMatchesRule(
  rule: ColumnRule | null | undefined,
  state: TaskRuleState,
): boolean {
  if (!ruleHasConditions(rule)) return false;
  const r = rule!;
  if (r.brandId != null && r.brandId !== "" && state.brandId !== r.brandId)
    return false;
  if (r.whenDone === true && !state.isDone) return false;
  if (r.priority != null && state.priority !== r.priority) return false;
  if (
    r.assigneeId != null &&
    r.assigneeId !== "" &&
    !state.assigneeIds.includes(r.assigneeId)
  )
    return false;
  if (
    r.fromStatus != null &&
    r.fromStatus !== "" &&
    state.status !== r.fromStatus
  )
    return false;
  return true;
}

/**
 * Devuelve el id de la PRIMERA columna (en orden) cuya regla matchea la
 * tarea, o null si ninguna. Si el match es la columna donde ya está, igual
 * lo devuelve (el caller decide si es no-op).
 */
export function resolveAutoColumn(
  columns: TaskColumn[],
  state: TaskRuleState,
  opts?: { onlyFromStatus?: boolean },
): string | null {
  for (const c of columns) {
    // En triggers de "solo cambió el estado" evaluamos únicamente reglas que
    // dependen de fromStatus, para no re-snapear reglas de marca/prioridad
    // cuando el user simplemente arrastra entre columnas normales.
    if (opts?.onlyFromStatus) {
      const hasFrom = c.rule?.fromStatus != null && c.rule.fromStatus !== "";
      if (!hasFrom) continue;
    }
    if (taskMatchesRule(c.rule, state)) return c.id;
  }
  return null;
}

/**
 * Resuelve el status FINAL de una tarea aplicando reglas de auto-movimiento.
 * Lo usan los endpoints después de una mutación.
 *
 * `triggered`: solo evaluamos reglas si cambió un campo relevante (marca,
 * prioridad, asignado o se completó). Así un drag manual a una columna normal
 * NO se "revierte" solo. La completación SÍ dispara (para el caso "completadas
 * del cliente X → columna X").
 *
 * Devuelve el status resultante + si esa columna es final (para completedAt).
 */
export function computeAutoStatus(
  columns: TaskColumn[],
  opts: {
    baseStatus: string;
    brandId: string | null;
    priority: TaskPriority;
    assigneeIds: string[];
    /** Tipo de disparo:
     *  - "field": cambió marca/prioridad/asignado o se completó → todas las reglas.
     *  - "status": solo cambió el estado → solo reglas con fromStatus.
     *  - "none": no evaluar. */
    trigger: "field" | "status" | "none";
  },
): { status: string; isDone: boolean } {
  const baseCol = columns.find((c) => c.id === opts.baseStatus);
  const baseIsDone = baseCol?.isDone ?? false;
  if (opts.trigger === "none")
    return { status: opts.baseStatus, isDone: baseIsDone };
  const auto = resolveAutoColumn(
    columns,
    {
      brandId: opts.brandId,
      priority: opts.priority,
      assigneeIds: opts.assigneeIds,
      isDone: baseIsDone,
      status: opts.baseStatus,
    },
    { onlyFromStatus: opts.trigger === "status" },
  );
  if (auto && auto !== opts.baseStatus) {
    const autoCol = columns.find((c) => c.id === auto);
    return { status: auto, isDone: autoCol?.isDone ?? false };
  }
  return { status: opts.baseStatus, isDone: baseIsDone };
}

/** Límite sano de columnas para no romper el layout del board. */
export const MAX_TASK_COLUMNS = 10;

/** Las 4 columnas default — derivadas de los constantes legacy. Sirven para
 *  sembrar agencies que nunca customizaron. */
export const DEFAULT_TASK_COLUMNS: TaskColumn[] = TASK_STATUSES.map((id) => ({
  id,
  label: TASK_STATUS_LABEL[id],
  color: DEFAULT_STATUS_COLORS[id],
  isDone: id === "done",
}));

/** Genera un id de columna nuevo (custom). Prefijo `col_` para distinguir de
 *  los 4 default. NO usa Math.random crudo para que sea legible. */
export function makeColumnId(): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `col_${rand}`;
}

/** Slugify simple para derivar id legible de un label (no se usa para
 *  unicidad — siempre validamos colisión aparte). */
export function isValidColumnLabel(v: unknown): v is string {
  return typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 30;
}

/**
 * Resuelve las columnas finales de una agency desde el JSON persistido.
 * - Si `rawColumns` es un array válido → lo usa (sanitizado/ordenado).
 * - Si falta → siembra desde DEFAULT_TASK_COLUMNS, mergeando los colores
 *   legacy de `rawColors` (Agency.taskStatusColors) para no perder lo que el
 *   user ya había customizado antes de esta feature.
 * Garantiza: al menos 1 columna, y al menos 1 marcada isDone.
 */
export function resolveTaskColumns(
  rawColumns: unknown,
  rawColors?: unknown,
): TaskColumn[] {
  if (Array.isArray(rawColumns) && rawColumns.length > 0) {
    const seen = new Set<string>();
    const cols: TaskColumn[] = [];
    for (const c of rawColumns) {
      if (!c || typeof c !== "object") continue;
      const obj = c as Record<string, unknown>;
      const id = typeof obj.id === "string" ? obj.id : null;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      // Parsear regla (si existe + es objeto válido).
      let rule: ColumnRule | null = null;
      if (obj.rule && typeof obj.rule === "object") {
        const ro = obj.rule as Record<string, unknown>;
        rule = {
          brandId: typeof ro.brandId === "string" ? ro.brandId : null,
          whenDone: ro.whenDone === true,
          priority: isTaskPriority(ro.priority) ? ro.priority : null,
          assigneeId: typeof ro.assigneeId === "string" ? ro.assigneeId : null,
          fromStatus: typeof ro.fromStatus === "string" ? ro.fromStatus : null,
        };
        if (!ruleHasConditions(rule)) rule = null;
      }
      const wipLimit =
        typeof obj.wipLimit === "number" && obj.wipLimit > 0
          ? Math.floor(obj.wipLimit)
          : null;
      const autoArchiveDays =
        typeof obj.autoArchiveDays === "number" && obj.autoArchiveDays > 0
          ? Math.floor(obj.autoArchiveDays)
          : null;
      cols.push({
        id,
        label: isValidColumnLabel(obj.label) ? obj.label.trim() : id,
        color: isTaskColor(obj.color) ? obj.color : "slate",
        isDone: obj.isDone === true,
        rule,
        wipLimit,
        autoArchiveDays,
      });
    }
    if (cols.length > 0) {
      // Garantizar al menos una columna "final".
      if (!cols.some((c) => c.isDone)) cols[cols.length - 1].isDone = true;
      return cols;
    }
  }
  // Fallback: defaults + merge de colores legacy.
  const colors = resolveStatusColors(rawColors);
  return DEFAULT_TASK_COLUMNS.map((c) => ({ ...c, color: colors[c.id] ?? c.color }));
}
