"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { STATUS_COLOR } from "@/lib/utils";

type CalPost = {
  id: string;
  number: number | null;
  imageUrl: string | null;
  status: string;
  scheduledAt: Date | null;
  caption: string;
};

type CalTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  priority: string;
  done: boolean;
};

const DAY_NAMES_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAY_NAMES_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function parseYM(s: string | undefined): Date {
  if (!s) return startOfMonth(new Date());
  const m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!m) return startOfMonth(new Date());
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

function startOfWeekMonday(d: Date) {
  const day = d.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // shift so Mon=0
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  return start;
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function ymdKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYMD(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function Calendar({
  brandId,
  posts: initialPosts,
  tasks = [],
  monthParam,
  view: initialView = "month",
  weekParam,
  canEdit = false,
}: {
  brandId: string;
  posts: CalPost[];
  tasks?: CalTask[];
  monthParam?: string;
  view?: "month" | "week";
  weekParam?: string;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "week">(initialView);
  const [posts, setPosts] = useState<CalPost[]>(initialPosts);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => parseYM(monthParam), [monthParam]);
  const weekStart = useMemo(
    () => startOfWeekMonday(parseYMD(weekParam) ?? today),
    [weekParam, today],
  );

  // Build cells based on view
  const cells = useMemo(() => buildCells(view, monthStart, weekStart), [view, monthStart, weekStart]);

  // Group posts by day key (full YMD so it works across month/week)
  const byKey = useMemo(() => {
    const m = new Map<string, CalPost[]>();
    for (const p of posts) {
      if (!p.scheduledAt) continue;
      const k = ymdKey(p.scheduledAt);
      const arr = m.get(k) ?? [];
      arr.push(p);
      m.set(k, arr);
    }
    return m;
  }, [posts]);

  // Group tasks by day key (solo las que tienen dueDate)
  const tasksByKey = useMemo(() => {
    const m = new Map<string, CalTask[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const k = ymdKey(t.dueDate);
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    return m;
  }, [tasks]);

  function navigate(direction: -1 | 1) {
    if (view === "month") {
      const next = ymKey(addMonths(monthStart, direction));
      router.push(`/brands/${brandId}?view=calendar&month=${next}&calView=month`);
    } else {
      const next = ymdKey(addDays(weekStart, direction * 7));
      router.push(`/brands/${brandId}?view=calendar&week=${next}&calView=week`);
    }
  }
  function goToday() {
    if (view === "month") {
      router.push(`/brands/${brandId}?view=calendar&calView=month`);
    } else {
      router.push(`/brands/${brandId}?view=calendar&calView=week`);
    }
  }

  async function handleDrop(targetDate: Date) {
    if (!dragId) return;
    const post = posts.find((p) => p.id === dragId);
    setOverKey(null);
    setDragId(null);
    if (!post) return;

    // Conserva hora/minuto si existía; si no, default 09:00
    const newDate = new Date(targetDate);
    if (post.scheduledAt) {
      newDate.setHours(post.scheduledAt.getHours(), post.scheduledAt.getMinutes(), 0, 0);
    } else {
      newDate.setHours(9, 0, 0, 0);
    }
    if (post.scheduledAt && sameDay(newDate, post.scheduledAt)) return;

    // Optimistic update
    const previous = posts;
    setPosts((arr) => arr.map((p) => (p.id === dragId ? { ...p, scheduledAt: newDate } : p)));
    setSavingId(dragId);

    try {
      const res = await fetch(`/api/posts/${dragId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: newDate.toISOString() }),
      });
      if (!res.ok) throw new Error("save failed");
      router.refresh();
    } catch {
      setPosts(previous);
    } finally {
      setSavingId(null);
    }
  }

  const headerLabel =
    view === "month"
      ? `${MONTH_NAMES[monthStart.getMonth()]} ${monthStart.getFullYear()}`
      : weekRangeLabel(weekStart);

  const dayNames = view === "week" ? DAY_NAMES_LONG : DAY_NAMES_SHORT;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-zinc-900">{headerLabel}</h3>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <div className="flex gap-1.5">
            <button
              onClick={() => navigate(-1)}
              className="grid h-8 w-8 place-items-center rounded-lg border divider bg-white text-zinc-700 hover:bg-zinc-50"
              aria-label={view === "month" ? "Mes anterior" : "Semana anterior"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className="rounded-lg border divider bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Hoy
            </button>
            <button
              onClick={() => navigate(1)}
              className="grid h-8 w-8 place-items-center rounded-lg border divider bg-white text-zinc-700 hover:bg-zinc-50"
              aria-label={view === "month" ? "Mes siguiente" : "Semana siguiente"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`mt-5 grid grid-cols-7 gap-1 text-center text-2xs font-semibold uppercase tracking-wider text-zinc-500 ${
          view === "week" ? "sm:text-[12px]" : ""
        }`}
      >
        {dayNames.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          const dayPosts = cell.date ? byKey.get(ymdKey(cell.date)) ?? [] : [];
          const dayTasks = cell.date ? tasksByKey.get(ymdKey(cell.date)) ?? [] : [];
          const key = cell.date ? ymdKey(cell.date) : `empty-${i}`;
          const isOver = overKey === key;
          const isPast = cell.date ? cell.date < startOfDay(today) : false;
          const cellMinH = view === "week" ? "min-h-[260px]" : "min-h-[68px] sm:min-h-[110px]";

          return (
            <div
              key={key}
              onDragOver={(e) => {
                if (!dragId || !cell.date) return;
                e.preventDefault();
                if (overKey !== key) setOverKey(key);
              }}
              onDragLeave={() => {
                if (overKey === key) setOverKey(null);
              }}
              onDrop={(e) => {
                if (!cell.date) return;
                e.preventDefault();
                handleDrop(cell.date);
              }}
              className={`group relative ${cellMinH} rounded-lg p-1 text-xs transition sm:p-1.5 ${
                cell.date == null
                  ? "bg-transparent"
                  : isOver
                    ? "bg-fuchsia-50 ring-2 ring-fuchsia-400"
                    : cell.isToday
                      ? "bg-zinc-50 ring-1 ring-fuchsia-400"
                      : isPast
                        ? "bg-zinc-50/40 ring-1 ring-zinc-100"
                        : "bg-white ring-1 ring-zinc-100"
              }`}
            >
              {cell.date && (
                <div
                  className={`mb-1 flex items-center justify-between text-2xs font-semibold ${
                    cell.isToday ? "brand-gradient-text" : "text-zinc-500"
                  }`}
                >
                  <span className="invisible">·</span>
                  <span>{cell.date.getDate()}</span>
                </div>
              )}
              <div className={`space-y-1 ${view === "week" ? "max-h-[200px] overflow-auto" : ""}`}>
                {(view === "week" ? dayPosts : dayPosts.slice(0, 3)).map((p) => (
                  <div
                    key={p.id}
                    draggable={canEdit}
                    onDragStart={() => setDragId(p.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverKey(null);
                    }}
                    className={`${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${
                      dragId === p.id ? "opacity-40" : ""
                    } ${savingId === p.id ? "animate-pulse" : ""}`}
                  >
                    <Link
                      href={`/brands/${brandId}/posts/${p.number ?? p.id}`}
                      className="group/post flex items-center gap-1.5 rounded-md bg-zinc-50 p-1 ring-1 ring-transparent transition hover:ring-fuchsia-400 hover:bg-white"
                      draggable={false}
                      onClick={(e) => {
                        if (dragId) e.preventDefault();
                      }}
                    >
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-7 w-7 flex-shrink-0 rounded object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span className="block h-7 w-7 flex-shrink-0 rounded bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span
                          className={`block truncate rounded px-1 text-3xs font-medium ${STATUS_COLOR[p.status] ?? "bg-zinc-200"}`}
                        >
                          {p.scheduledAt
                            ? p.scheduledAt.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                        {view === "week" && p.caption && (
                          <span className="mt-0.5 block truncate text-3xs text-zinc-500">
                            {p.caption}
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
                {view === "month" && dayPosts.length > 3 && (
                  <p className="text-3xs text-zinc-500">+{dayPosts.length - 3} más</p>
                )}
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => router.push(`/tasks?open=${t.id}`)}
                    className={`flex w-full items-center gap-1 rounded-md bg-violet-50 px-1 py-0.5 text-left text-3xs font-medium text-violet-700 ring-1 ring-transparent transition hover:ring-violet-400 ${
                      t.done ? "opacity-60" : ""
                    }`}
                    title={t.title}
                  >
                    <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                    <span className={`min-w-0 flex-1 truncate ${t.done ? "line-through" : ""}`}>
                      {t.title}
                    </span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <p className="text-3xs text-violet-500">+{dayTasks.length - 3} tareas</p>
                )}
              </div>

              {/* "Crear post" hint en días vacíos cuando puedes editar y no es pasado */}
              {cell.date && canEdit && dayPosts.length === 0 && !isPast && (
                <Link
                  href={`/brands/${brandId}/posts/new?date=${ymdKey(cell.date)}`}
                  className="absolute inset-x-1.5 bottom-1.5 hidden grid-flow-col place-items-center gap-1 rounded-md border border-dashed border-zinc-300 py-1 text-3xs font-medium text-zinc-500 transition hover:border-fuchsia-400 hover:text-fuchsia-600 group-hover:grid"
                  draggable={false}
                >
                  <Plus className="h-3 w-3" />
                  <span>Crear</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <p className="mt-3 text-2xs text-zinc-400">
          Arrastra un post a otro día para reprogramarlo · pasa el cursor por días vacíos para crear uno nuevo.
        </p>
      )}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: "month" | "week";
  onChange: (v: "month" | "week") => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-zinc-100 p-0.5 ring-1 ring-zinc-200">
      <button
        onClick={() => onChange("month")}
        className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
          value === "month" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
        }`}
      >
        Mes
      </button>
      <button
        onClick={() => onChange("week")}
        className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
          value === "week" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
        }`}
      >
        Semana
      </button>
    </div>
  );
}

function buildCells(
  view: "month" | "week",
  monthStart: Date,
  weekStart: Date,
): { date: Date | null; isToday: boolean }[] {
  const today = new Date();
  if (view === "week") {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      cells.push({ date: d, isToday: sameDay(d, today) });
    }
    return cells;
  }
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstWeekdayJs = monthStart.getDay();
  const leading = (firstWeekdayJs + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const cells: { date: Date | null; isToday: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - leading + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ date: null, isToday: false });
    } else {
      const d = new Date(year, month, dayNum);
      cells.push({ date: d, isToday: sameDay(d, today) });
    }
  }
  return cells;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function weekRangeLabel(start: Date) {
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} ${MONTH_NAMES[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
  }
  return `${start.getDate()} ${MONTH_NAMES[start.getMonth()].slice(0, 3)} ${start.getFullYear()} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
}
