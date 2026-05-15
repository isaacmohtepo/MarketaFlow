"use client";

import { useEffect, useState } from "react";
import {
  Handshake,
  Mail,
  Loader2,
  Trash2,
  Plus,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

type Brand = { id: string; name: string };

type Invitation = {
  id: string;
  email: string;
  brandIds: string[];
  expiresAt: string;
  url: string;
  createdAt: string;
};

type ClientMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  brandId: string;
  brandName: string;
};

/**
 * Gestor de "clientes" — usuarios con rol `client` que tienen acceso de
 * solo lectura/aprobación a una o más marcas específicas. NO son
 * miembros del equipo (no cuentan contra el límite del plan), son
 * stakeholders externos.
 *
 * Acciones:
 *  - Invitar cliente por email + selector de marcas → genera link de
 *    aceptación y manda email.
 *  - Listar invitaciones pendientes con copiar link / revocar.
 *  - Listar clientes ya aceptados con qué marcas ven.
 */
export default function ClientsManager() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [clients, setClients] = useState<ClientMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { confirm } = useConfirm();

  async function load() {
    setLoading(true);
    try {
      const [invR, teamR] = await Promise.all([
        fetch("/api/clients/invite", { cache: "no-store" }),
        fetch("/api/team", { cache: "no-store" }),
      ]);
      const invJ = invR.ok ? await invR.json() : { invitations: [] };
      const teamJ = teamR.ok ? await teamR.json() : { brands: [], members: [] };
      setInvitations(invJ.invitations ?? []);
      setBrands(teamJ.brands ?? []);
      // Clients aceptados: vienen como members con role "client" y
      // brandScope poblado. /api/team los expone aunque sean brand-scoped.
      const acceptedClients: ClientMember[] = [];
      type Mem = {
        id: string;
        userId: string;
        name: string | null;
        email: string;
        role: string;
        brandScope?: { brandId: string; role: string }[];
      };
      for (const mm of (teamJ.members ?? []) as Mem[]) {
        if (mm.role !== "client") continue;
        for (const bs of mm.brandScope ?? []) {
          const b = (teamJ.brands ?? []).find((x: Brand) => x.id === bs.brandId);
          if (b) {
            acceptedClients.push({
              id: `${mm.id}-${bs.brandId}`,
              userId: mm.userId,
              name: mm.name,
              email: mm.email,
              brandId: bs.brandId,
              brandName: b.name,
            });
          }
        }
      }
      setClients(acceptedClients);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleBrand(id: string) {
    setSelectedBrands((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function invite() {
    if (!email.trim()) {
      toast.error("Ingresá un email");
      return;
    }
    if (selectedBrands.size === 0) {
      toast.error("Seleccioná al menos una marca");
      return;
    }
    setInviting(true);
    try {
      const r = await fetch("/api/clients/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          brandIds: [...selectedBrands],
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo invitar");
        return;
      }
      toast.success("Invitación enviada");
      setEmail("");
      setSelectedBrands(new Set());
      setShowForm(false);
      load();
    } finally {
      setInviting(false);
    }
  }

  async function revoke(inv: Invitation) {
    const ok = await confirm({
      title: `¿Revocar invitación de ${inv.email}?`,
      description: "El link va a dejar de funcionar inmediatamente.",
      confirmLabel: "Revocar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    const r = await fetch(`/api/clients/invite/${inv.id}`, {
      method: "DELETE",
    });
    if (r.ok) {
      toast.success("Invitación revocada");
      load();
    }
  }

  function copyLink(inv: Invitation) {
    navigator.clipboard.writeText(inv.url).then(() => {
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 1500);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-zinc-900">
              <Handshake className="h-4 w-4 text-fuchsia-600" />
              Clientes con acceso
            </h3>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Personas externas que pueden ver y aprobar contenido de una marca
              específica. Solo lectura — no pueden crear ni editar posts.
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              disabled={brands.length === 0}
              className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
              title={
                brands.length === 0
                  ? "Crear una marca primero"
                  : "Invitar cliente"
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Invitar cliente
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card space-y-3 p-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Email del cliente
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@empresa.com"
              className="w-full rounded-md input-soft px-3 py-2 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Marcas a las que dar acceso
            </label>
            <div className="flex flex-wrap gap-1.5">
              {brands.map((b) => {
                const checked = selectedBrands.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBrand(b.id)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 transition-colors ${
                      checked
                        ? "bg-fuchsia-600 text-white ring-fuchsia-600"
                        : "bg-white text-zinc-700 ring-zinc-200 hover:ring-zinc-300"
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowForm(false);
                setEmail("");
                setSelectedBrands(new Set());
              }}
              disabled={inviting}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              Cancelar
            </button>
            <button
              onClick={invite}
              disabled={inviting}
              className="btn-gradient rounded-md px-4 py-1.5 text-[12px] font-semibold"
            >
              {inviting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Enviar invitación"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Invitaciones pendientes */}
      {invitations.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
            Pendientes ({invitations.length})
          </h4>
          <ul className="space-y-2">
            {invitations.map((inv) => {
              const brandNames = inv.brandIds
                .map((id) => brands.find((b) => b.id === id)?.name)
                .filter(Boolean)
                .join(", ");
              return (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/30 p-3"
                >
                  <Mail className="h-4 w-4 flex-shrink-0 text-amber-700" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">
                      {inv.email}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {brandNames || "Sin marcas"} · Expira{" "}
                      {new Date(inv.expiresAt).toLocaleDateString("es", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => copyLink(inv)}
                    title="Copiar link de aceptación"
                    className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    {copiedId === inv.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => revoke(inv)}
                    title="Revocar invitación"
                    className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Clientes aceptados */}
      {clients.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
            Con acceso ({clients.length})
          </h4>
          <ul className="space-y-2">
            {clients.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3"
              >
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-fuchsia-50 text-[11px] font-bold uppercase text-fuchsia-700">
                  {(c.name ?? c.email).slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-zinc-900">
                    {c.name ?? c.email}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {c.email} · {c.brandName}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {invitations.length === 0 && clients.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/40 p-8 text-center">
          <Handshake className="mx-auto h-7 w-7 text-zinc-300" />
          <p className="mt-2 text-[13px] font-semibold text-zinc-700">
            Sin clientes invitados todavía
          </p>
          <p className="mt-0.5 text-[11.5px] text-zinc-500">
            Invitá un cliente para que pueda ver, comentar y aprobar el
            contenido de su marca sin tener que crearle cuenta de team.
          </p>
        </div>
      )}
    </div>
  );
}
