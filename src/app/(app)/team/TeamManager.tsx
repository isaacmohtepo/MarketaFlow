"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Mail,
  Trash2,
  Crown,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

type RoleOption = {
  slug: string;
  name: string;
  description: string | null;
  tone: "amber" | "indigo" | "fuchsia" | "emerald" | "sky" | "violet" | "zinc";
  permissions: string[];
  noScope: boolean;
  isSystem: boolean;
};

type Brand = { id: string; name: string };

type Member = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
  isYou: boolean;
  brandScope: { brandId: string; role: string }[];
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  url: string;
};

const TONE_CLASSES: Record<RoleOption["tone"], string> = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export default function TeamManager({ canInvite }: { canInvite: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [systemRoles, setSystemRoles] = useState<RoleOption[]>([]);
  const [customRoles, setCustomRoles] = useState<RoleOption[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [myPerms, setMyPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { confirm: confirmDialog } = useConfirm();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("community_manager");
  const [scopeMode, setScopeMode] = useState<"agency" | "brands">("agency");
  const [scopeBrands, setScopeBrands] = useState<Set<string>>(new Set());

  const allRoles = [...systemRoles, ...customRoles];
  const selectedRole = allRoles.find((r) => r.slug === role);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/team", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setMembers(j.members);
      setInvitations(j.invitations);
      setSystemRoles(j.systemRoles);
      setCustomRoles(j.customRoles);
      setBrands(j.brands ?? []);
      setMyPerms(new Set(j.me?.permissions ?? []));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function invite() {
    if (!email.trim()) {
      setError("Ingresa un email");
      return;
    }
    setError(null);
    setInviting(true);
    const brandIds =
      selectedRole?.noScope || scopeMode === "agency" ? [] : [...scopeBrands];
    const r = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        role,
        brandIds,
      }),
    });
    setInviting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    setEmail("");
    setRole("community_manager");
    setScopeMode("agency");
    setScopeBrands(new Set());
    load();
  }

  async function remove(id: string, label: string) {
    const ok = await confirmDialog({
      title: `¿Quitar ${label}?`,
      description: "Perderá acceso a la agencia y a todas sus marcas.",
      confirmLabel: "Quitar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    await fetch(`/api/team/${id}`, { method: "DELETE" });
    load();
  }

  async function changeRole(memberId: string, newRole: string) {
    await fetch(`/api/team/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setEditingId(null);
    load();
  }

  async function copyLink(inv: Invitation) {
    await navigator.clipboard.writeText(inv.url);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function roleLabel(slug: string): string {
    return allRoles.find((r) => r.slug === slug)?.name ?? slug;
  }
  function roleTone(slug: string): RoleOption["tone"] {
    return allRoles.find((r) => r.slug === slug)?.tone ?? "zinc";
  }

  const canChangeRoles = myPerms.has("team.assign_roles");
  const canRemove = myPerms.has("team.remove");

  return (
    <div className="space-y-6">
      {canInvite && (
        <section className="card p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
            Invitar miembro
          </h2>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                className="w-full rounded-md input-soft py-2 pl-8 pr-3 text-[13px]"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-md input-soft px-3 py-2 text-[13px]"
            >
              <optgroup label="Roles del sistema">
                {systemRoles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
              {customRoles.length > 0 && (
                <optgroup label="Roles personalizados">
                  {customRoles.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              onClick={invite}
              disabled={inviting}
              className="btn-gradient inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Invitar
            </button>
          </div>

          {selectedRole && (
            <p className="mt-2 text-[12px] text-zinc-600">{selectedRole.description}</p>
          )}

          {/* Scope por brand: solo si el rol no es noScope */}
          {selectedRole && !selectedRole.noScope && brands.length > 0 && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
                Acceso a marcas
              </p>
              <div className="mt-2 flex gap-2 text-[12px]">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={scopeMode === "agency"}
                    onChange={() => setScopeMode("agency")}
                  />
                  Toda la agencia
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={scopeMode === "brands"}
                    onChange={() => setScopeMode("brands")}
                  />
                  Solo estas marcas
                </label>
              </div>
              {scopeMode === "brands" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {brands.map((b) => {
                    const on = scopeBrands.has(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          const next = new Set(scopeBrands);
                          if (on) next.delete(b.id);
                          else next.add(b.id);
                          setScopeBrands(next);
                        }}
                        className={`rounded-full px-2.5 py-1 text-2xs font-medium transition ${
                          on
                            ? "bg-zinc-900 text-white"
                            : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100"
                        }`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-[10.5px] text-zinc-500">
                Nota: el scope se aplica cuando el invitado acepte y lo ajustes
                desde la lista. Por ahora la invitación queda pendiente con el rol
                elegido.
              </p>
            </div>
          )}

          {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
        </section>
      )}

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
          Miembros activos
        </h2>
        {loading ? (
          <p className="mt-3 text-[12px] text-zinc-500">Cargando...</p>
        ) : (
          <ul className="mt-3 card divide-y divide-zinc-100/80 overflow-hidden">
            {members.map((m) => {
              const tone = roleTone(m.role);
              const editing = editingId === m.id;
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 p-3 transition hover:bg-zinc-50"
                >
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[12px] font-bold text-white brand-gradient">
                    {(m.name ?? m.email)[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">
                      {m.name ?? m.email}
                      {m.isYou && (
                        <span className="ml-1.5 text-2xs font-normal text-zinc-500">
                          (tú)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-2xs text-zinc-500">
                      {m.email}
                      {m.brandScope.length > 0 && (
                        <span className="ml-1.5 text-zinc-400">
                          · {m.brandScope.length}{" "}
                          {m.brandScope.length === 1 ? "marca" : "marcas"}
                        </span>
                      )}
                    </p>
                  </div>

                  {editing ? (
                    <select
                      autoFocus
                      defaultValue={m.role}
                      onBlur={() => setEditingId(null)}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      className="rounded-md input-soft px-2 py-1 text-[12px]"
                    >
                      {systemRoles.map((r) => (
                        <option key={r.slug} value={r.slug}>
                          {r.name}
                        </option>
                      ))}
                      {customRoles.map((r) => (
                        <option key={r.slug} value={r.slug}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() =>
                        canChangeRoles && !m.isYou ? setEditingId(m.id) : null
                      }
                      disabled={!canChangeRoles || m.isYou}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold ring-1 ${
                        TONE_CLASSES[tone]
                      } ${
                        canChangeRoles && !m.isYou ? "hover:opacity-80" : ""
                      }`}
                      title={
                        canChangeRoles && !m.isYou ? "Cambiar rol" : undefined
                      }
                    >
                      {m.role === "owner" && <Crown className="h-2.5 w-2.5" />}
                      {roleLabel(m.role)}
                      {canChangeRoles && !m.isYou && (
                        <ChevronDown className="h-2.5 w-2.5" />
                      )}
                    </button>
                  )}

                  {canRemove && !m.isYou && (
                    <button
                      onClick={() => remove(m.id, m.name ?? m.email)}
                      className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                      title="Quitar del equipo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {invitations.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
            Invitaciones pendientes
          </h2>
          <ul className="mt-3 card divide-y divide-zinc-100/80 overflow-hidden">
            {invitations.map((inv) => {
              const tone = roleTone(inv.role);
              return (
                <li key={inv.id} className="flex items-center gap-3 p-3">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-amber-50">
                    <Mail className="h-3.5 w-3.5 text-amber-700" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">
                      {inv.email}
                    </p>
                    <p className="truncate text-2xs text-zinc-500">
                      Esperando aceptación · expira el{" "}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-3xs font-semibold ring-1 ${TONE_CLASSES[tone]}`}
                  >
                    {roleLabel(inv.role)}
                  </span>
                  <button
                    onClick={() => copyLink(inv)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium text-zinc-700 hover:bg-zinc-100"
                    title="Copiar link"
                  >
                    {copiedId === inv.id ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-700">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Link
                      </>
                    )}
                  </button>
                  {canRemove && (
                    <button
                      onClick={() => remove(inv.id, inv.email)}
                      className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                      title="Cancelar invitación"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
