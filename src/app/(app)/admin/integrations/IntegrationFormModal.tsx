"use client";

import { useState } from "react";
import { X, Loader2, Save, KeyRound } from "lucide-react";
import { toast } from "sonner";

type ConfigRow = {
  id: string;
  provider: string;
  environment: string;
  publicMeta: unknown;
};

/**
 * Modal para configurar las llaves de una pasarela. Schema de campos
 * varía por provider. Las llaves NO se pre-llenan al editar (solo se
 * muestran las publicMeta como hint), porque están encriptadas y no
 * queremos exponerlas en el HTML del admin.
 */
export default function IntegrationFormModal({
  provider,
  environment,
  existing,
  onClose,
  onSaved,
}: {
  provider: string;
  environment: "sandbox" | "production";
  existing: ConfigRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const isEdit = !!existing;

  const schema = SCHEMAS[provider];
  if (!schema) {
    return (
      <Backdrop onClose={onClose}>
        <p className="text-sm text-rose-600">
          Provider "{provider}" no tiene schema de configuración definido.
        </p>
      </Backdrop>
    );
  }

  function setField(key: string, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    // Validar que todos los campos requeridos estén llenos
    for (const f of schema.fields) {
      if (f.required && !fields[f.key]?.trim()) {
        toast.error(`El campo "${f.label}" es obligatorio`);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: schema.category,
          provider,
          environment,
          config: fields,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo guardar", { description: j.error ?? res.statusText });
        return;
      }
      toast.success(isEdit ? "Llaves actualizadas" : "Pasarela configurada y activada");
      onSaved();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-5">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
              {environment}
            </p>
            <h3 className="mt-0.5 text-base font-bold text-zinc-900">
              {schema.label}
            </h3>
            <p className="mt-1 text-[12px] text-zinc-500">{schema.helpText}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {isEdit && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 ring-1 ring-amber-200">
              ⚠ Editás la configuración existente. Por seguridad las llaves no se
              pre-llenan — tenés que pegarlas de nuevo. Si dejás un campo en
              blanco, se conserva el valor anterior solo si lo dejás VACÍO; si
              ponés cualquier cosa, se sobrescribe.
            </div>
          )}
          {schema.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[12px] font-semibold text-zinc-700">
                {f.label}
                {f.required && <span className="ml-0.5 text-rose-500">*</span>}
              </span>
              <input
                type={f.secret ? "password" : "text"}
                value={fields[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={busy}
                autoComplete="off"
                className="input-soft mt-1 w-full rounded-md px-3 py-2 text-[13px] font-mono"
              />
              {f.helpText && (
                <span className="mt-1 block text-[11px] text-zinc-500">
                  {f.helpText}
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md btn-secondary px-3 py-2 text-[12.5px] font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isEdit ? "Actualizar" : "Guardar y activar"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Schemas por provider — definen qué campos pedir y cómo guardarlos.
// ============================================================================

type FieldSchema = {
  key: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  secret?: boolean;
  required?: boolean;
};

type ProviderSchema = {
  label: string;
  category: "payment";
  helpText: string;
  fields: FieldSchema[];
};

const SCHEMAS: Record<string, ProviderSchema> = {
  wompi: {
    label: "Wompi (Bancolombia)",
    category: "payment",
    helpText:
      "Pegá las 4 llaves de tu dashboard de Wompi → Configuración → API Keys.",
    fields: [
      {
        key: "publicKey",
        label: "Public Key",
        placeholder: "pub_test_xxx o pub_prod_xxx",
        helpText: "Llave pública (la que va al frontend).",
        required: true,
      },
      {
        key: "privateKey",
        label: "Private Key",
        placeholder: "prv_test_xxx o prv_prod_xxx",
        helpText: "Llave privada (servidor only). Se guarda encriptada.",
        secret: true,
        required: true,
      },
      {
        key: "integritySecret",
        label: "Integrity Secret",
        placeholder: "stg_integrity_xxx o prod_integrity_xxx",
        helpText: "Para firmar transacciones. Se guarda encriptado.",
        secret: true,
        required: true,
      },
      {
        key: "eventsSecret",
        label: "Events Secret",
        placeholder: "stg_events_xxx o prod_events_xxx",
        helpText: "Para validar webhooks. Se guarda encriptado.",
        secret: true,
        required: true,
      },
    ],
  },
  stripe: {
    label: "Stripe",
    category: "payment",
    helpText: "Configurá si querés aceptar tarjetas internacionales.",
    fields: [
      {
        key: "publishableKey",
        label: "Publishable Key",
        placeholder: "pk_test_xxx o pk_live_xxx",
        required: true,
      },
      {
        key: "secretKey",
        label: "Secret Key",
        placeholder: "sk_test_xxx o sk_live_xxx",
        secret: true,
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Webhook Signing Secret",
        placeholder: "whsec_xxx",
        secret: true,
        required: true,
      },
    ],
  },
  paddle: {
    label: "Paddle",
    category: "payment",
    helpText: "Merchant of Record para SaaS global.",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "pdl_xxx",
        secret: true,
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Webhook Public Key",
        placeholder: "ntfset_xxx",
        secret: true,
        required: true,
      },
    ],
  },
  lemonsqueezy: {
    label: "Lemon Squeezy",
    category: "payment",
    helpText: "Merchant of Record fácil de setup.",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "eyJ0eXAiOiJKV1QiL...",
        secret: true,
        required: true,
      },
      {
        key: "storeId",
        label: "Store ID",
        placeholder: "12345",
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Webhook Signing Secret",
        secret: true,
        required: true,
      },
    ],
  },
};
