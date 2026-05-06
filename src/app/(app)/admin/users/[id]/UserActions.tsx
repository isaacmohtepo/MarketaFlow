"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  KeyRound,
  Ban,
  Power,
  LogOut,
  Trash2,
  Eye,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

type Props = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  emailNotifications: boolean;
  disabled: boolean;
  disabledReason: string | null;
  sessionsCount: number;
};

export default function UserActions(props: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form de edición básica
  const [form, setForm] = useState({
    name: props.name ?? "",
    email: props.email,
    role: props.role,
    emailNotifications: props.emailNotifications,
  });
  const dirty =
    form.name !== (props.name ?? "") ||
    form.email !== props.email ||
    form.role !== props.role ||
    form.emailNotifications !== props.emailNotifications;

  async function patch(body: Record<string, unknown>, label = "guardar") {
    setBusy(label);
    try {
      const res = await fetch(`/api/admin/users/${props.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? `No se pudo ${label}`);
        return false;
      }
      toast.success("Cambios guardados");
      router.refresh();
      return true;
    } catch {
      toast.error("Error de red");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveBasic() {
    const ok = await patch({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      emailNotifications: form.emailNotifications,
    });
    if (ok && form.role !== props.role) {
      toast.info("El rol fue cambiado", {
        description: "Si cambiaste a/desde admin, los permisos cambiaron al instante.",
      });
    }
  }

  async function toggleDisabled() {
    if (!props.disabled) {
      // Vamos a deshabilitar — pedir motivo
      const ok = await confirm({
        title: "¿Deshabilitar usuario?",
        description:
          "El usuario no podrá loguearse y todas sus sesiones se cerrarán al instante. Podés volver a habilitarlo después.",
        confirmLabel: "Deshabilitar",
        cancelLabel: "Cancelar",
        variant: "warning",
      });
      if (!ok) return;
      const reason = window.prompt("Motivo (opcional, visible solo a admins):");
      await patch(
        { disabled: true, disabledReason: reason || null },
        "deshabilitar",
      );
    } else {
      const ok = await confirm({
        title: "¿Volver a habilitar?",
        description: "El usuario podrá loguearse de nuevo.",
        confirmLabel: "Habilitar",
        cancelLabel: "Cancelar",
        variant: "default",
      });
      if (!ok) return;
      await patch({ disabled: false }, "habilitar");
    }
  }

  async function resetPassword() {
    const choice = await confirm({
      title: "¿Resetear contraseña?",
      description:
        "Vamos a generar una contraseña temporal y cerrar todas las sesiones del usuario. La temporal se mostrará UNA SOLA VEZ — copiala y mandala por canal seguro.",
      confirmLabel: "Generar contraseña",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!choice) return;
    setBusy("reset");
    try {
      const res = await fetch(
        `/api/admin/users/${props.userId}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "No se pudo resetear");
        return;
      }
      setTempPassword(j.temporaryPassword);
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function forceLogout() {
    const ok = await confirm({
      title: "¿Cerrar todas las sesiones?",
      description: `Tiene ${props.sessionsCount} ${props.sessionsCount === 1 ? "sesión activa" : "sesiones activas"}. Cerrarlas obliga al usuario a volver a loguearse en todos sus dispositivos.`,
      confirmLabel: "Cerrar sesiones",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    setBusy("logout");
    try {
      const res = await fetch(`/api/admin/users/${props.userId}/sessions`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success(`${j.sessionsRevoked} sesiones cerradas`);
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function impersonate() {
    const ok = await confirm({
      title: `¿Impersonar a ${props.email}?`,
      description:
        "Vas a ver la app como este usuario. Quedará registrado en el audit log. Podés volver a tu cuenta con el botón rojo en la parte de arriba.",
      confirmLabel: "Impersonar",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    setBusy("impersonate");
    try {
      const res = await fetch(
        `/api/admin/users/${props.userId}/impersonate`,
        {
          method: "POST",
        },
      );
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      window.location.href = j.redirectTo ?? "/dashboard";
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function deleteUser() {
    const ok = await confirm({
      title: "¿Borrar usuario permanentemente?",
      description: `Se va a borrar TODO: ${props.email}, todas sus memberships, comentarios, sesiones, etc. Esta acción NO se puede deshacer.`,
      confirmLabel: "Sí, borrar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/admin/users/${props.userId}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success("Usuario borrado");
      router.push("/admin/users");
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Banner de password temporal */}
      {tempPassword && (
        <div className="card border-amber-300 bg-amber-50/60 p-4">
          <p className="text-[13px] font-bold text-amber-900">
            Contraseña temporal generada
          </p>
          <p className="mt-1 text-[11.5px] text-amber-800">
            Copiala AHORA y mandala por canal seguro al usuario. No se vuelve
            a mostrar.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-white p-2.5">
            <code className="flex-1 break-all font-mono text-[13px] text-amber-900">
              {tempPassword}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(tempPassword);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-200"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={() => setTempPassword(null)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Editar datos básicos */}
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Datos del usuario</h2>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Cambios visibles inmediatamente para el usuario.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
              className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.currentTarget.value })}
              className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
            />
          </Field>
          <Field label="Rol">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.currentTarget.value })}
              className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
            >
              <option value="agency">Agency</option>
              <option value="client">Client</option>
              <option value="admin">Admin (control total)</option>
            </select>
          </Field>
          <Field label="Notificaciones email">
            <select
              value={form.emailNotifications ? "yes" : "no"}
              onChange={(e) =>
                setForm({
                  ...form,
                  emailNotifications: e.currentTarget.value === "yes",
                })
              }
              className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
            >
              <option value="yes">Activadas</option>
              <option value="no">Desactivadas</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveBasic}
            disabled={!dirty || busy !== null}
            className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
          >
            {busy === "guardar" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Guardar cambios
          </button>
        </div>
      </section>

      {/* Acciones operativas */}
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Acciones</h2>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Operaciones que modifican el estado o la sesión del usuario.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon={<KeyRound className="h-3.5 w-3.5" />}
            label="Resetear contraseña"
            description="Genera una temporal + cierra sesiones."
            onClick={resetPassword}
            busy={busy === "reset"}
          />
          <ActionButton
            icon={<LogOut className="h-3.5 w-3.5" />}
            label={`Cerrar sesiones (${props.sessionsCount})`}
            description="Force logout en todos los dispositivos."
            onClick={forceLogout}
            busy={busy === "logout"}
            disabled={props.sessionsCount === 0}
          />
          <ActionButton
            icon={<Eye className="h-3.5 w-3.5" />}
            label="Impersonar"
            description="Ver la app como este usuario."
            onClick={impersonate}
            busy={busy === "impersonate"}
            disabled={props.disabled}
          />
          <ActionButton
            icon={
              props.disabled ? (
                <Power className="h-3.5 w-3.5" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )
            }
            label={props.disabled ? "Habilitar usuario" : "Deshabilitar usuario"}
            description={
              props.disabled
                ? "Permitir login de nuevo."
                : "Bloquear login + cerrar sesiones."
            }
            onClick={toggleDisabled}
            busy={busy === "deshabilitar" || busy === "habilitar"}
          />
        </div>
      </section>

      {/* Zona peligrosa */}
      <section className="card border-rose-200 p-6">
        <h2 className="text-sm font-semibold text-rose-900">Zona de peligro</h2>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Acción permanente. No se puede deshacer.
        </p>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/40 p-3">
          <div>
            <p className="text-[12.5px] font-semibold text-rose-900">
              Borrar usuario
            </p>
            <p className="mt-0.5 text-[11px] text-rose-700">
              Elimina todos sus datos: memberships, comentarios, aprobaciones,
              sesiones, notificaciones.
            </p>
          </div>
          <button
            type="button"
            onClick={deleteUser}
            disabled={busy === "delete"}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Borrar
          </button>
        </div>
      </section>
    </div>
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
      <span className="text-[11.5px] font-semibold text-zinc-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ActionButton({
  icon,
  label,
  description,
  onClick,
  busy,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="flex w-full items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-zinc-900">
          {label}
        </span>
        <span className="block text-[11px] text-zinc-500">{description}</span>
      </span>
    </button>
  );
}
