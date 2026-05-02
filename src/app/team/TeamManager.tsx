"use client";

import { useEffect, useState } from "react";
import { Plus, Mail, Trash2, Crown, Pencil, Copy, Check } from "lucide-react";

type Member = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  isYou: boolean;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  url: string;
};

export default function TeamManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "owner">("editor");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/team", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setMembers(j.members);
      setInvitations(j.invitations);
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
    const r = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
    });
    setInviting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    setEmail("");
    setRole("editor");
    load();
  }

  async function remove(id: string, label: string) {
    if (!confirm(`¿Quitar ${label}?`)) return;
    await fetch(`/api/team/${id}`, { method: "DELETE" });
    load();
  }

  async function copyLink(inv: Invitation) {
    await navigator.clipboard.writeText(inv.url);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
          Invitar miembro
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
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
            onChange={(e) => setRole(e.target.value as "editor" | "owner")}
            className="rounded-md input-soft px-3 py-2 text-[13px]"
          >
            <option value="editor">Editor</option>
            <option value="owner">Owner</option>
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
        {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
        <p className="mt-2 text-[11px] text-zinc-500">
          Owner: gestiona equipo y facturación. Editor: crea posts en todas las marcas.
        </p>
      </section>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
          Miembros activos
        </h2>
        {loading ? (
          <p className="mt-3 text-[12px] text-zinc-500">Cargando...</p>
        ) : (
          <ul className="mt-3 card divide-y divider overflow-hidden">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 p-3 transition hover:bg-zinc-50"
              >
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[12px] font-bold text-white brand-gradient">
                  {(m.name ?? m.email)[0]?.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-zinc-900">
                    {m.name ?? m.email}
                    {m.isYou && (
                      <span className="ml-1.5 text-[11px] font-normal text-zinc-500">(tú)</span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">{m.email}</p>
                </div>
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    m.role === "owner"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {m.role === "owner" && <Crown className="h-2.5 w-2.5" />}
                  {m.role}
                </span>
                {!m.isYou && (
                  <button
                    onClick={() => remove(m.id, m.name ?? m.email)}
                    className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                    title="Quitar del equipo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {invitations.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
            Invitaciones pendientes
          </h2>
          <ul className="mt-3 card divide-y divider overflow-hidden">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 p-3">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-amber-50">
                  <Mail className="h-3.5 w-3.5 text-amber-700" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-zinc-900">
                    {inv.email}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    Esperando aceptación · expira el{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                  {inv.role}
                </span>
                <button
                  onClick={() => copyLink(inv)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
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
                <button
                  onClick={() => remove(inv.id, inv.email)}
                  className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                  title="Cancelar invitación"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
