"use client";

/**
 * Cmd+K Spotlight — modal global de búsqueda + acciones rápidas para tareas.
 *
 * Atajos globales (capturados a nivel document):
 *   Cmd/Ctrl+K  → abre el spotlight
 *   /           → abre el spotlight (cuando no estás en un input)
 *   c           → crear nueva tarea (cuando no estás en un input)
 *   ?           → muestra el panel de atajos
 *   Esc         → cierra el spotlight / cualquier modal
 *
 * Dentro del spotlight:
 *   ↑/↓         → navegar resultados
 *   Enter       → abrir tarea seleccionada
 *   Tab         → cambiar entre tabs Tareas/Acciones
 *
 * Usa fuzzy match simple (substring case-insensitive) sobre title +
 * description + brand name. Sin librería extra.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  X,
  LayoutGrid,
  List as ListIcon,
  Calendar as CalendarIcon,
  Flag,
  CornerDownLeft,
} from "lucide-react";
import type { TaskItem } from "./types";
import {
  TASK_STATUS_LABEL,
  TASK_PRIORITY_DOT,
  type TaskStatus,
} from "@/lib/tasks-types";
import { useModKey } from "@/lib/platform";

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
};

export type SpotlightAction = {
  id: string;
  label: string;
  shortcut?: string;
  icon: typeof Search;
  onSelect: () => void;
};

export function TaskSpotlight({
  open,
  onClose,
  tasks,
  onOpenTask,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  tasks: TaskItem[];
  onOpenTask: (id: string) => void;
  actions: SpotlightAction[];
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modKey = useModKey();

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // Focus al input (micro-task para que el ref ya esté montado)
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Filtrar tareas + acciones
  const { filteredTasks, filteredActions } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        filteredTasks: tasks.slice(0, 8),
        filteredActions: actions,
      };
    }
    const ft = tasks
      .filter((t) => {
        const haystack = [
          t.title,
          t.description ?? "",
          t.brand?.name ?? "",
          t.tags.map((tg) => tg.name).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 12);
    const fa = actions.filter((a) =>
      a.label.toLowerCase().includes(q),
    );
    return { filteredTasks: ft, filteredActions: fa };
  }, [query, tasks, actions]);

  // Lista unificada: acciones primero, tareas después
  const flatItems = useMemo(
    () => [
      ...filteredActions.map((a) => ({ kind: "action" as const, item: a })),
      ...filteredTasks.map((t) => ({ kind: "task" as const, item: t })),
    ],
    [filteredActions, filteredTasks],
  );

  // Reset selección si la lista cambia
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Navegación con teclado
  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = flatItems[activeIdx];
      if (!sel) return;
      if (sel.kind === "action") {
        sel.item.onSelect();
        onClose();
      } else {
        onOpenTask(sel.item.id);
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // Scroll into view del item activo
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-spot-idx="${activeIdx}"]`,
    );
    if (el && "scrollIntoView" in el) {
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card animate-task-card-in w-full max-w-xl overflow-hidden p-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b divider px-4 py-3">
          <Search className="h-4 w-4 flex-shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tareas, acciones…"
            className="flex-1 border-0 bg-transparent text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-500">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {flatItems.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-zinc-400">
              Sin resultados para <strong>&ldquo;{query}&rdquo;</strong>
            </div>
          )}

          {/* Acciones */}
          {filteredActions.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Acciones
              </p>
              {filteredActions.map((a, i) => {
                const idx = i;
                const Icon = a.icon;
                const active = activeIdx === idx;
                return (
                  <button
                    key={a.id}
                    data-spot-idx={idx}
                    type="button"
                    onClick={() => {
                      a.onSelect();
                      onClose();
                    }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${
                      active ? "bg-fuchsia-50/60" : "hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${
                        active
                          ? "bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-[13px] font-medium text-zinc-800">
                      {a.label}
                    </span>
                    {a.shortcut && (
                      <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-500">
                        {a.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* Tareas */}
          {filteredTasks.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Tareas {!query && "(recientes)"}
              </p>
              {filteredTasks.map((t, i) => {
                const idx = filteredActions.length + i;
                const active = activeIdx === idx;
                return (
                  <button
                    key={t.id}
                    data-spot-idx={idx}
                    type="button"
                    onClick={() => {
                      onOpenTask(t.id);
                      onClose();
                    }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left transition ${
                      active ? "bg-fuchsia-50/60" : "hover:bg-zinc-50"
                    }`}
                  >
                    {/* Status dot */}
                    <span
                      className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${STATUS_COLOR[t.status]}`}
                    />
                    {/* Priority flag */}
                    {(t.priority === "urgent" || t.priority === "high") && (
                      <Flag
                        className={`h-3 w-3 flex-shrink-0 ${
                          t.priority === "urgent"
                            ? "text-rose-500"
                            : "text-amber-500"
                        }`}
                        fill="currentColor"
                      />
                    )}
                    {/* Title */}
                    <span
                      className={`flex-1 truncate text-[13px] font-medium ${
                        t.status === "done"
                          ? "text-zinc-400 line-through"
                          : "text-zinc-800"
                      }`}
                    >
                      {t.title}
                    </span>
                    {/* Brand chip */}
                    {t.brand && (
                      <span
                        className="hidden flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold sm:inline-flex"
                        style={{
                          background: `${t.brand.color ?? "#a1a1aa"}1f`,
                          color: t.brand.color ?? "#71717a",
                        }}
                      >
                        {t.brand.name}
                      </span>
                    )}
                    {/* Status label */}
                    <span className="hidden flex-shrink-0 text-[10.5px] font-semibold text-zinc-400 sm:inline">
                      {TASK_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {/* Priority dot mini */}
                    <span
                      className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${TASK_PRIORITY_DOT[t.priority]}`}
                    />
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer con hints */}
        <div className="flex items-center justify-between gap-3 border-t divider bg-zinc-50/50 px-4 py-2 text-[10.5px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span>navegar</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>
                <CornerDownLeft className="h-2.5 w-2.5" />
              </Kbd>
              <span>abrir</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
            <span>para abrir esto</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-zinc-200 bg-white px-1 font-mono text-[10px] font-semibold text-zinc-600 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
      {children}
    </kbd>
  );
}

/** Hook útil para que el padre maneje el state + atajos globales. */
export function useSpotlight() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl+K abre desde cualquier lado
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // / abre cuando no estás escribiendo
      if (e.key === "/" && !isTypingInForm(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

/** Hook que escucha atajos cuando NO se está escribiendo en un input. */
export function useGlobalShortcuts(handlers: {
  onCreate?: () => void;
  onHelp?: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingInForm(e.target)) return;
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handlers.onCreate?.();
      } else if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        handlers.onHelp?.();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handlers]);
}

function isTypingInForm(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  if (!el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}
