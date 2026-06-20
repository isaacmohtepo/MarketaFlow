"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Contadores del sidebar (inbox + tareas) centralizados en UN solo lugar.
 *
 * Antes cada instancia del `Sidebar` (desktop + drawer mobile) pollaba por su
 * cuenta → /api/inbox/count y /api/tasks/my-count se llamaban 2× por intervalo.
 * Ahora el polling vive acá una sola vez y ambos sidebars consumen el valor
 * por contexto.
 */
type Counts = { inboxCount: number; tasksCount: number };

const SidebarCountsContext = createContext<Counts>({
  inboxCount: 0,
  tasksCount: 0,
});

export function useSidebarCounts(): Counts {
  return useContext(SidebarCountsContext);
}

export default function SidebarCountsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [inboxCount, setInboxCount] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);

  // Inbox: refresca cada 10s (cambia seguido).
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

  // Tareas: cada 30s (cambian menos). El endpoint devuelve 0 para usuarios sin
  // acceso a tareas (clients / no-miembros), así que no hace falta gatearlo.
  useEffect(() => {
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
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <SidebarCountsContext.Provider value={{ inboxCount, tasksCount }}>
      {children}
    </SidebarCountsContext.Provider>
  );
}
