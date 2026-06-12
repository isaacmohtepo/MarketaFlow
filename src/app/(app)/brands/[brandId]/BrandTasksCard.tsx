"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Plus, Loader2 } from "lucide-react";
import { Panel, PanelEmpty } from "@/components/ui";

type TaskUser = { id: string; name: string | null; email: string; avatarUrl: string | null };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assignees: TaskUser[];
  assignee: TaskUser | null;
};
type Column = { id: string; isDone?: boolean };

const PRIORITY_DOT: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f59e0b",
  normal: "#3b82f6",
  low: "#a1a1aa",
};

function dueLabel(iso: string | null): { text: string; tone: string } | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: "Vencida", tone: "text-rose-600 bg-rose-50" };
  if (days === 0) return { text: "Hoy", tone: "text-amber-600 bg-amber-50" };
  if (days === 1) return { text: "Mañana", tone: "text-amber-600 bg-amber-50" };
  if (days <= 7) return { text: `${days}d`, tone: "text-zinc-500 bg-zinc-100" };
  return {
    text: new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" }),
    tone: "text-zinc-500 bg-zinc-100",
  };
}

/**
 * Card de "Tareas de esta marca" en la página de marca. Lista las tareas
 * abiertas ligadas a la marca + permite crear una directo. Reutiliza la API
 * existente (GET/POST /api/tasks con brandId). Click en una tarea → la abre en
 * el tablero (/tasks?open=).
 */
export default function BrandTasksCard({ brandId }: { brandId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doneStatuses, setDoneStatuses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/tasks?brandId=${brandId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) {
          if (alive) setLoading(false);
          return;
        }
        const done = new Set<string>(
          (j.columns ?? []).filter((c: Column) => c.isDone).map((c: Column) => c.id),
        );
        setDoneStatuses(done);
        setTasks(j.tasks ?? []);
        // Si el server devolvió data, el user tiene tasks.read; asumimos write
        // y dejamos que el POST valide (403 lo maneja).
        setCanWrite(true);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [brandId]);

  const open = useMemo(
    () => tasks.filter((t) => !doneStatuses.has(t.status)),
    [tasks, doneStatuses],
  );

  async function create() {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, brandId }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.task) setTasks((cur) => [j.task, ...cur]);
        setNewTitle("");
      }
    } catch {
      // noop
    } finally {
      setCreating(false);
    }
  }

  // No mostramos el card si el user no tiene acceso a tareas (GET dio 403).
  if (!loading && !canWrite && tasks.length === 0) return null;

  return (
    <Panel
      title="Tareas de la marca"
      icon={CheckSquare}
      count={open.length}
      href="/tasks"
      hrefLabel="Ver tablero"
      tint="text-fuchsia-600 bg-fuchsia-50"
      className="mt-4"
    >
      {/* Quick create */}
      {canWrite && (
        <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
          <Plus className="h-4 w-4 flex-shrink-0 text-zinc-300" />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            placeholder="Nueva tarea para esta marca…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
          />
          {creating && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <p className="px-4 py-5 text-center text-[12px] text-zinc-400">Cargando…</p>
      ) : open.length === 0 ? (
        <PanelEmpty text="Sin tareas abiertas para esta marca." />
      ) : (
        <ul className="divide-y divide-zinc-100/80">
          {open.slice(0, 6).map((t) => {
            const due = dueLabel(t.dueDate);
            const people = t.assignees.length > 0 ? t.assignees : t.assignee ? [t.assignee] : [];
            return (
              <li key={t.id}>
                <Link
                  href={`/tasks?open=${t.id}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 transition hover:bg-zinc-50"
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: PRIORITY_DOT[t.priority] ?? "#a1a1aa" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-zinc-800">
                    {t.title}
                  </span>
                  {due && (
                    <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-3xs font-semibold ${due.tone}`}>
                      {due.text}
                    </span>
                  )}
                  <div className="flex flex-shrink-0 -space-x-1.5">
                    {people.slice(0, 3).map((u) =>
                      u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={u.id}
                          src={u.avatarUrl}
                          alt={u.name ?? u.email}
                          className="h-5 w-5 rounded-full object-cover ring-2 ring-white"
                        />
                      ) : (
                        <span
                          key={u.id}
                          className="grid h-5 w-5 place-items-center rounded-full bg-zinc-300 text-[8px] font-bold text-white ring-2 ring-white"
                        >
                          {(u.name ?? u.email)[0]?.toUpperCase()}
                        </span>
                      ),
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
