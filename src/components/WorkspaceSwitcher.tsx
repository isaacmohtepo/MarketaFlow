"use client";

import { useState, useEffect } from "react";
import { ChevronsUpDown, Check, Building2, Plus, ArrowLeft, X } from "lucide-react";
import { PickerPopover, PickerItem, PickerSection, PickerDivider } from "./Picker";
import { userColor, userInitials } from "@/lib/avatar";
import type { Workspace } from "@/lib/active-agency";

/**
 * Selector de workspace (agencia activa) para el header del sidebar.
 *
 * Un usuario puede pertenecer a varias agencias (la suya + las que lo
 * invitaron) y crear nuevas. Este control deja elegir en cuál trabaja y crear
 * una agencia propia. Al elegir/crear, hace POST y router.refresh() para que
 * el layout re-resuelva todo sobre la nueva agencia.
 */
export default function WorkspaceSwitcher({
  workspaces,
  activeAgencyId,
}: {
  workspaces: Workspace[];
  activeAgencyId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Vista interna del popover: lista de workspaces o form de "crear agencia".
  const [view, setView] = useState<"list" | "create">("list");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Coach mark de una sola vez: si el user tiene MÁS de un espacio (típico de
  // un invitado), resaltamos el selector y mostramos un aviso que enseña dónde
  // cambiar de agencia. Se descarta solo (localStorage) al abrirlo o cerrarlo.
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (workspaces.length <= 1) return;
    try {
      if (!localStorage.getItem("mf-ws-hint-seen")) setShowHint(true);
    } catch {
      // localStorage no disponible (modo privado raro) → sin hint, sin drama.
    }
  }, [workspaces.length]);

  function dismissHint() {
    setShowHint(false);
    try {
      localStorage.setItem("mf-ws-hint-seen", "1");
    } catch {
      // noop
    }
  }

  // Sin agencias (estado transitorio raro) → no mostrar nada.
  if (workspaces.length === 0) return null;

  const active =
    workspaces.find((w) => w.agencyId === activeAgencyId) ?? workspaces[0];

  // No-leídas en OTROS espacios de trabajo (no el activo) → avisa que hay
  // actividad en otra agencia aunque el selector esté colapsado.
  const otherUnread = workspaces
    .filter((w) => w.agencyId !== active.agencyId)
    .reduce((sum, w) => sum + w.unread, 0);

  function resetAndClose() {
    setOpen(false);
    setView("list");
    setNewName("");
    setError(null);
  }

  async function switchTo(agencyId: string) {
    if (agencyId === active.agencyId) {
      resetAndClose();
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId }),
      });
      if (res.ok) {
        // Quedarse en la MISMA pestaña, recargando en sitio con los datos del
        // nuevo workspace (colores, notificaciones, todo fresco al instante).
        // Recarga DURA (no router.refresh) para que el <style> de white-label
        // y los contadores no queden stale. Excepción: las páginas de una
        // marca puntual (/brands/<id>/…) no existen en la otra agencia → caen
        // a la lista de marcas.
        const path = window.location.pathname;
        const dest = /^\/brands\/[^/]+/.test(path) ? "/brands" : path;
        window.location.assign(dest);
        return;
      }
    } catch {
      // noop
    }
    setPending(false);
  }

  async function createAgency() {
    const name = newName.trim();
    if (!name) {
      setError("Escribe un nombre");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        // Recarga completa: la agencia nueva ya es el workspace activo (cookie)
        // y entra fresca con su branding propio.
        window.location.assign("/dashboard");
        return;
      } else {
        setError(j.error ?? "No se pudo crear");
      }
    } catch {
      setError("No se pudo crear");
    }
    setPending(false);
  }

  return (
    <div className="relative px-2 pt-2">
      <PickerPopover
        open={open}
        onOpenChange={(b) => (b ? setOpen(true) : resetAndClose())}
        width="w-[224px] max-w-[calc(100vw-1.5rem)]"
        align="left"
        trigger={({ open: isOpen, toggle }) => (
          <button
            type="button"
            onClick={() => {
              dismissHint();
              toggle();
            }}
            disabled={pending}
            className={`relative flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition disabled:opacity-60 ${
              isOpen
                ? "border-white/20 bg-white/10"
                : showHint
                  ? "border-fuchsia-500/50 bg-white/[0.06] ring-2 ring-fuchsia-500/30"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
            }`}
          >
            {showHint && !isOpen ? (
              <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-fuchsia-500" />
              </span>
            ) : otherUnread > 0 && !isOpen ? (
              <span
                className="absolute -right-1.5 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-zinc-900"
                title={`${otherUnread} sin leer en otro espacio de trabajo`}
              >
                {otherUnread > 9 ? "9+" : otherUnread}
              </span>
            ) : null}
            <WorkspaceAvatar ws={active} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-white">
                {active.name}
              </span>
              <span className="block truncate text-[10.5px] text-zinc-400">
                {active.isOwner ? "Tu agencia" : "Invitado"}
                {active.suspended ? " · Suspendida" : ""}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
          </button>
        )}
      >
        {view === "list" ? (
          <>
            <PickerSection>Tus espacios de trabajo</PickerSection>
            <div className="max-h-72 overflow-y-auto py-1">
              {workspaces.map((w) => (
                <PickerItem
                  key={w.agencyId}
                  selected={w.agencyId === active.agencyId}
                  disabled={pending}
                  onClick={() => switchTo(w.agencyId)}
                >
                  <WorkspaceAvatar ws={w} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-zinc-800">
                      {w.name}
                    </span>
                    <span className="block truncate text-[10.5px] text-zinc-500">
                      {w.isOwner ? "Tu agencia" : "Invitado"}
                      {w.suspended ? " · Suspendida" : ""}
                    </span>
                  </span>
                  {w.agencyId === active.agencyId ? (
                    <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  ) : w.unread > 0 ? (
                    <span
                      className="grid h-4 min-w-[16px] flex-shrink-0 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold tabular-nums text-white"
                      title={`${w.unread} sin leer`}
                    >
                      {w.unread > 9 ? "9+" : w.unread}
                    </span>
                  ) : null}
                </PickerItem>
              ))}
            </div>
            <PickerDivider />
            <button
              type="button"
              onClick={() => {
                setView("create");
                setError(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-fuchsia-600 transition hover:bg-fuchsia-50/40"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">
                <Plus className="h-3 w-3" />
              </span>
              Crear nueva agencia
            </button>
          </>
        ) : (
          <div className="p-3">
            <button
              type="button"
              onClick={() => {
                setView("list");
                setError(null);
              }}
              className="mb-2 flex items-center gap-1 text-2xs font-medium text-zinc-500 transition hover:text-zinc-800"
            >
              <ArrowLeft className="h-3 w-3" /> Volver
            </button>
            <p className="text-[13px] font-semibold text-zinc-900">
              Crear nueva agencia
            </p>
            <p className="mt-0.5 text-2xs text-zinc-500">
              Tu propio espacio, con su plan aparte. Arranca con 14 días de prueba.
            </p>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !pending) createAgency();
              }}
              placeholder="Nombre de la agencia"
              maxLength={80}
              className="input-soft mt-3 w-full rounded-lg px-3 py-2 text-[13px]"
            />
            {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
            <button
              type="button"
              onClick={createAgency}
              disabled={pending}
              className="btn-gradient mt-3 w-full rounded-lg py-2 text-[13px] font-semibold disabled:opacity-60"
            >
              {pending ? "Creando…" : "Crear y entrar"}
            </button>
          </div>
        )}
      </PickerPopover>

      {/* Coach mark: aviso una sola vez para quien tiene varios espacios. */}
      {showHint && !open && (
        <div className="absolute inset-x-2 top-full z-30 mt-2 rounded-lg border border-fuchsia-500/30 bg-zinc-900/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
          <button
            type="button"
            onClick={dismissHint}
            aria-label="Cerrar aviso"
            className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded text-zinc-500 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
          <p className="pr-5 text-[11.5px] font-semibold text-white">
            Tienes varios espacios de trabajo
          </p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-zinc-400">
            Cambia entre tus agencias desde aquí arriba. Cada una tiene sus
            propios datos.
          </p>
          <button
            type="button"
            onClick={dismissHint}
            className="mt-2 text-[10.5px] font-semibold text-fuchsia-400 transition hover:text-fuchsia-300"
          >
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}

/** Avatar cuadrado: logo de la agencia si tiene white-label, sino iniciales
 *  con color estable por agencyId. */
function WorkspaceAvatar({ ws }: { ws: Workspace }) {
  if (ws.logoUrl) {
    return (
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ws.logoUrl}
          alt={ws.name}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  const initials = userInitials(ws.name);
  return (
    <span
      className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-[10.5px] font-bold text-white"
      style={{ background: userColor(ws.agencyId) }}
    >
      {initials === "?" ? <Building2 className="h-3.5 w-3.5" /> : initials}
    </span>
  );
}
