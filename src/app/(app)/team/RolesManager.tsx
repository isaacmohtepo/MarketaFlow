"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Shield,
  Pencil,
  Trash2,
  Check,
  X,
  Lock,
  Copy as Duplicate,
  RotateCcw,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/ui";
import { PERMISSION_GROUPS } from "@/lib/permissions-data";

type Tone = "amber" | "indigo" | "fuchsia" | "emerald" | "sky" | "violet" | "zinc";

type SystemRole = {
  slug: string;
  name: string;
  description: string;
  defaultDescription: string;
  tone: Tone;
  permissions: string[];
  defaultPermissions: string[];
  isOverridden: boolean;
  noScope: boolean;
  editable: boolean;
  memberCount: number;
};

type CustomRole = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  permissions: string[];
  memberCount: number;
  createdAt: string;
};

const TONE: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

type EditorTarget =
  | { kind: "create" }
  | { kind: "duplicate"; name: string; permissions: string[] }
  | { kind: "edit-custom"; role: CustomRole }
  | { kind: "edit-system"; role: SystemRole };

export default function RolesManager({
  canManageRoles,
}: {
  canManageRoles: boolean;
}) {
  const [systemRoles, setSystemRoles] = useState<SystemRole[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const { confirm } = useConfirm();

  async function load() {
    setLoading(true);
    const r = await fetch("/api/team/roles", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setSystemRoles(j.systemRoles ?? []);
      setCustomRoles(j.customRoles ?? []);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function deleteCustom(role: CustomRole) {
    if (role.memberCount > 0) {
      await confirm({
        title: "No se puede eliminar",
        description: `Hay ${role.memberCount} miembros con este rol. Reasignalos primero.`,
        confirmLabel: "Entendido",
        cancelLabel: "",
        variant: "default",
      });
      return;
    }
    const ok = await confirm({
      title: `¿Eliminar rol "${role.name}"?`,
      description: "Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    const r = await fetch(`/api/team/roles/${role.id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      await confirm({
        title: "Error",
        description: j.error ?? "No se pudo eliminar.",
        confirmLabel: "OK",
        cancelLabel: "",
        variant: "default",
      });
      return;
    }
    load();
  }

  async function restoreSystemDefaults(role: SystemRole) {
    const ok = await confirm({
      title: `¿Restaurar permisos de "${role.name}"?`,
      description:
        "Vuelve a los permisos predefinidos del sistema. Cualquier ajuste custom de este rol se pierde.",
      confirmLabel: "Restaurar",
      cancelLabel: "Cancelar",
      variant: "default",
    });
    if (!ok) return;
    await fetch(`/api/team/roles/system/${role.slug}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-7">
      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Roles del sistema
            </h2>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Predefinidos. Puedes ajustar sus permisos para tu agencia o
              restaurar los defaults cuando quieras.
            </p>
          </div>
        </div>

        {loading && systemRoles.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">Cargando...</p>
        ) : (
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {systemRoles.map((r) => (
              <li key={r.slug} className="card flex items-start gap-3 p-4">
                <span
                  className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ring-1 ${TONE[r.tone]}`}
                >
                  <Shield className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">
                      {r.name}
                    </p>
                    {!r.editable && <Lock className="h-3 w-3 text-zinc-400" />}
                    {r.isOverridden && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-700">
                        Custom
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-zinc-500">
                    {r.description}
                  </p>
                  <p className="mt-1 text-[10.5px] text-zinc-400">
                    {r.permissions.length}{" "}
                    {r.permissions.length === 1 ? "permiso" : "permisos"}
                    {r.memberCount > 0 && <> · {r.memberCount} miembros</>}
                  </p>
                </div>
                {canManageRoles && (
                  <div className="flex flex-col items-end gap-1">
                    {r.editable && (
                      <button
                        onClick={() =>
                          setTarget({ kind: "edit-system", role: r })
                        }
                        className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100"
                        title="Editar permisos"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {r.isOverridden && (
                      <button
                        onClick={() => restoreSystemDefaults(r)}
                        className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100"
                        title="Restaurar defaults"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setTarget({
                          kind: "duplicate",
                          name: `${r.name} (copia)`,
                          permissions: [...r.permissions],
                        })
                      }
                      className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100"
                      title="Duplicar como rol custom"
                    >
                      <Duplicate className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Roles personalizados
            </h2>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Creados por tu agencia con los permisos que tú elijas.
            </p>
          </div>
          {canManageRoles && (
            <button
              onClick={() => setTarget({ kind: "create" })}
              className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              Crear rol
            </button>
          )}
        </div>

        {loading ? (
          <p className="mt-3 text-[12px] text-zinc-500">Cargando...</p>
        ) : customRoles.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="Todavía no creaste ningún rol custom"
            subtitle="Los roles del sistema cubren la mayoría de los casos. Crea uno custom solo si necesitas algo específico."
            className="mt-3 p-6"
          />
        ) : (
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {customRoles.map((r) => (
              <li key={r.id} className="card flex items-start gap-3 p-4">
                <span
                  className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ring-1 ${TONE.zinc}`}
                >
                  <Shield className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-zinc-900">
                    {r.name}
                  </p>
                  {r.description && (
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] text-zinc-500">
                      {r.description}
                    </p>
                  )}
                  <p className="mt-1 text-[10.5px] text-zinc-400">
                    {r.permissions.length}{" "}
                    {r.permissions.length === 1 ? "permiso" : "permisos"}
                    {r.memberCount > 0 && <> · {r.memberCount} miembros</>}
                  </p>
                </div>
                {canManageRoles && (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() =>
                        setTarget({ kind: "edit-custom", role: r })
                      }
                      className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteCustom(r)}
                      className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {target && (
        <RoleEditor
          target={target}
          onClose={() => setTarget(null)}
          onSaved={() => {
            setTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Editor modal
// ============================================================================
function RoleEditor({
  target,
  onClose,
  onSaved,
}: {
  target: EditorTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Modo: editar system, editar custom, crear custom, duplicar a custom
  const isSystemEdit = target.kind === "edit-system";
  const isCustomEdit = target.kind === "edit-custom";
  const isCreate = target.kind === "create" || target.kind === "duplicate";

  const initial = useMemo(() => {
    if (target.kind === "edit-system") {
      return {
        name: target.role.name,
        description: target.role.description,
        permissions: target.role.permissions,
        nameEditable: false,
      };
    }
    if (target.kind === "edit-custom") {
      return {
        name: target.role.name,
        description: target.role.description ?? "",
        permissions: target.role.permissions,
        nameEditable: true,
      };
    }
    if (target.kind === "duplicate") {
      return {
        name: target.name,
        description: "",
        permissions: target.permissions,
        nameEditable: true,
      };
    }
    return { name: "", description: "", permissions: [], nameEditable: true };
  }, [target]);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [perms, setPerms] = useState<Set<string>>(new Set(initial.permissions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allPerms = useMemo(
    () => PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
    [],
  );

  function toggle(p: string) {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPerms(next);
  }
  function toggleGroup(groupKey: string) {
    const group = PERMISSION_GROUPS.find((g) => g.key === groupKey);
    if (!group) return;
    const all = group.permissions.map((p) => p.key);
    const allOn = all.every((p) => perms.has(p));
    const next = new Set(perms);
    if (allOn) all.forEach((p) => next.delete(p));
    else all.forEach((p) => next.add(p));
    setPerms(next);
  }

  async function save() {
    setError(null);
    if (initial.nameEditable && !name.trim()) {
      setError("Falta el nombre");
      return;
    }
    if (perms.size === 0) {
      setError("Elige al menos un permiso");
      return;
    }
    setSaving(true);
    let r: Response;
    if (isSystemEdit && target.kind === "edit-system") {
      r = await fetch(`/api/team/roles/system/${target.role.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: [...perms],
          description: description.trim() || null,
        }),
      });
    } else if (isCustomEdit && target.kind === "edit-custom") {
      r = await fetch(`/api/team/roles/${target.role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          permissions: [...perms],
        }),
      });
    } else {
      r = await fetch("/api/team/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          permissions: [...perms],
        }),
      });
    }
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    onSaved();
  }

  const heading = isSystemEdit
    ? `Editar permisos de ${initial.name}`
    : isCustomEdit
      ? "Editar rol"
      : "Crear rol personalizado";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="card flex w-full max-w-2xl flex-col overflow-hidden sm:max-h-[85vh]">
        <div className="flex items-center justify-between border-b divider px-5 py-3">
          <h3 className="text-[14px] font-bold tracking-tight text-zinc-900">
            {heading}
          </h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {initial.nameEditable ? (
            <div>
              <label className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
                Nombre
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Editor de Video"
                className="mt-1.5 w-full rounded-md input-soft px-3 py-2 text-[13px]"
                maxLength={40}
              />
            </div>
          ) : (
            <div className="rounded-md bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600">
              Estás editando los permisos del rol del sistema{" "}
              <strong className="text-zinc-900">{initial.name}</strong>. El
              nombre no se puede cambiar — para crear uno con nombre custom,
              usa "Duplicar".
            </div>
          )}
          <div>
            <label className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
              Descripción {isCreate && "(opcional)"}
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para qué sirve este rol"
              className="mt-1.5 w-full rounded-md input-soft px-3 py-2 text-[13px]"
              maxLength={200}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
                Permisos
              </label>
              <p className="text-2xs text-zinc-500">
                {perms.size} de {allPerms.length}
              </p>
            </div>
            <div className="mt-2 space-y-2">
              {PERMISSION_GROUPS.map((g) => {
                const all = g.permissions.map((p) => p.key);
                const allOn = all.every((p) => perms.has(p));
                const someOn = all.some((p) => perms.has(p));
                return (
                  <div
                    key={g.key}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/40"
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.key)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                    >
                      <span className="text-[12px] font-semibold text-zinc-800">
                        {g.label}
                      </span>
                      <span
                        className={`grid h-4 w-4 place-items-center rounded ${
                          allOn
                            ? "bg-zinc-900 text-white"
                            : someOn
                              ? "bg-zinc-300"
                              : "bg-white ring-1 ring-zinc-300"
                        }`}
                      >
                        {allOn && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                    <ul className="border-t border-zinc-200/70 px-3 py-2">
                      {g.permissions.map((p) => {
                        const on = perms.has(p.key);
                        return (
                          <li key={p.key}>
                            <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px] text-zinc-700 hover:text-zinc-900">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggle(p.key)}
                                className="h-3.5 w-3.5"
                              />
                              <span>{p.label}</span>
                              <code className="ml-auto text-[10.5px] text-zinc-400">
                                {p.key}
                              </code>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t divider px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-gradient rounded-md px-4 py-1.5 text-[12px] font-semibold disabled:opacity-60"
          >
            {saving
              ? "Guardando..."
              : isSystemEdit
                ? "Guardar cambios"
                : isCustomEdit
                  ? "Guardar"
                  : "Crear rol"}
          </button>
        </div>
      </div>
    </div>
  );
}
