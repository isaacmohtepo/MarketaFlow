"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CreateUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "agency" as "agency" | "client",
  });

  async function submit() {
    if (!form.email || !form.name || !form.password) {
      toast.error("Completa todos los campos");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "No se pudo crear");
        return;
      }
      toast.success("Usuario creado");
      setOpen(false);
      setForm({ email: "", name: "", password: "", role: "agency" });
      router.refresh();
      router.push(`/admin/users/${j.user.id}`);
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Nuevo usuario
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-5">
              <div>
                <h3 className="text-base font-bold text-zinc-900">
                  Nuevo usuario
                </h3>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  El usuario podrá loguearse inmediatamente con la contraseña
                  que asignes aquí.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.currentTarget.value })
                  }
                  disabled={busy}
                  placeholder="usuario@dominio.com"
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
                  autoComplete="off"
                />
              </Field>
              <Field label="Nombre">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.currentTarget.value })
                  }
                  disabled={busy}
                  placeholder="Nombre completo"
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
                  autoComplete="off"
                />
              </Field>
              <Field label="Contraseña inicial">
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.currentTarget.value })
                  }
                  disabled={busy}
                  placeholder="Mínimo 8 chars + 1 letra + 1 número"
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px] font-mono"
                  autoComplete="off"
                />
              </Field>
              <Field label="Rol">
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      role: e.currentTarget.value as "agency" | "client",
                    })
                  }
                  disabled={busy}
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
                >
                  <option value="agency">Agency (puede crear marcas)</option>
                  <option value="client">Client (solo aprueba)</option>
                </select>
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 p-4">
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="rounded-md btn-secondary px-3 py-2 text-[12.5px] font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Crear usuario
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-zinc-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
