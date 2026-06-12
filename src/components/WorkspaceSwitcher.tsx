"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check, Building2, Plus, ArrowLeft } from "lucide-react";
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Vista interna del popover: lista de workspaces o form de "crear agencia".
  const [view, setView] = useState<"list" | "create">("list");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sin agencias (estado transitorio raro) → no mostrar nada.
  if (workspaces.length === 0) return null;

  const active =
    workspaces.find((w) => w.agencyId === activeAgencyId) ?? workspaces[0];

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
        resetAndClose();
        router.refresh();
      }
    } catch {
      // noop
    } finally {
      setPending(false);
    }
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
        resetAndClose();
        router.refresh();
      } else {
        setError(j.error ?? "No se pudo crear");
      }
    } catch {
      setError("No se pudo crear");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="px-2 pt-2">
      <PickerPopover
        open={open}
        onOpenChange={(b) => (b ? setOpen(true) : resetAndClose())}
        width="w-[224px] max-w-[calc(100vw-1.5rem)]"
        align="left"
        trigger={({ open: isOpen, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition disabled:opacity-60 ${
              isOpen
                ? "border-white/20 bg-white/10"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
            }`}
          >
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
                  {w.agencyId === active.agencyId && (
                    <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  )}
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
