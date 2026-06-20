"use client";

import { useState } from "react";
import { X, Loader2, Save, AlertTriangle, CheckCircle2, PlugZap } from "lucide-react";
import { toast } from "sonner";

/**
 * Detecta si el valor de un campo es de un environment distinto al elegido.
 * Devuelve null (OK), "wrong" (claramente del otro env), o "unknown" (formato
 * inesperado pero no podemos afirmar que esté mal — ej. campo opcional o
 * provider sin convención clara de prefijo).
 */
function detectKeyMismatch(
  provider: string,
  fieldKey: string,
  value: string,
  environment: "sandbox" | "production",
): "wrong" | null {
  if (!value) return null;

  if (provider === "wompi") {
    // publicKey/privateKey: pub_test_* / prv_test_* (sandbox) vs *_prod_*
    if (fieldKey === "publicKey" || fieldKey === "privateKey") {
      const isTest = value.includes("_test_");
      const isProd = value.includes("_prod_");
      if (environment === "production" && isTest) return "wrong";
      if (environment === "sandbox" && isProd) return "wrong";
    }
    // integritySecret/eventsSecret: prefijos stg_ / prod_
    if (fieldKey === "integritySecret" || fieldKey === "eventsSecret") {
      const isStg = value.startsWith("stg_") || value.startsWith("test_");
      const isProd = value.startsWith("prod_");
      if (environment === "production" && isStg) return "wrong";
      if (environment === "sandbox" && isProd) return "wrong";
    }
  }
  if (provider === "stripe") {
    if (fieldKey === "publishableKey" || fieldKey === "secretKey") {
      const isTest = value.includes("_test_");
      const isLive = value.includes("_live_");
      if (environment === "production" && isTest) return "wrong";
      if (environment === "sandbox" && isLive) return "wrong";
    }
  }
  return null;
}

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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; merchantName?: string | null }
    | { ok: false; error: string }
    | null
  >(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const isEdit = !!existing;

  // Cualquier mismatch de environment en algún campo → bloquea el save y
  // mostramos el banner. El admin tiene que arreglarlo o cambiar el env.
  const mismatches = Object.entries(fields)
    .map(([k, v]) => ({
      key: k,
      mismatch: detectKeyMismatch(provider, k, v, environment),
    }))
    .filter((m) => m.mismatch === "wrong");
  const hasMismatch = mismatches.length > 0;

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
    setTestResult(null); // si edita después de probar, invalidamos el resultado
  }

  async function testConnection() {
    // Validar campos requeridos antes de pegarle a la API externa
    for (const f of schema.fields) {
      if (f.required && !fields[f.key]?.trim()) {
        toast.error(`Faltan campos: completa "${f.label}"`);
        return;
      }
    }
    if (hasMismatch) {
      toast.error("Hay llaves del environment equivocado — corregilas primero");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, environment, config: fields }),
      });
      const j = await res.json();
      if (j.ok) {
        setTestResult({ ok: true, merchantName: j.merchant?.name ?? null });
      } else {
        setTestResult({ ok: false, error: j.error ?? "Las llaves no son válidas" });
      }
    } catch {
      setTestResult({ ok: false, error: "Error de red al probar las llaves" });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    // Validar que todos los campos requeridos estén llenos
    for (const f of schema.fields) {
      if (f.required && !fields[f.key]?.trim()) {
        toast.error(`El campo "${f.label}" es obligatorio`);
        return;
      }
    }
    if (hasMismatch) {
      toast.error(
        "Hay llaves del environment equivocado. El servidor las va a rechazar — corregilas o cambia el ambiente.",
      );
      return;
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
              ⚠ Editas la configuración existente. Por seguridad las llaves no
              se pre-llenan — tienes que pegarlas TODAS de nuevo para guardar
              (al guardar se reemplaza la configuración completa).
            </div>
          )}
          {schema.fields.map((f) => {
            const value = fields[f.key] ?? "";
            const fieldMismatch = detectKeyMismatch(provider, f.key, value, environment);
            return (
              <label key={f.key} className="block">
                <span className="text-[12px] font-semibold text-zinc-700">
                  {f.label}
                  {f.required && <span className="ml-0.5 text-rose-500">*</span>}
                </span>
                <input
                  type={f.secret ? "password" : "text"}
                  value={value}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  disabled={busy}
                  autoComplete="off"
                  className={`input-soft mt-1 w-full rounded-md px-3 py-2 text-[13px] font-mono ${
                    fieldMismatch === "wrong"
                      ? "border-rose-300 ring-1 ring-rose-200"
                      : ""
                  }`}
                />
                {fieldMismatch === "wrong" ? (
                  <span className="mt-1 flex items-start gap-1 text-2xs font-medium text-rose-600">
                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    Esta llave parece de{" "}
                    <strong>
                      {environment === "production" ? "sandbox" : "production"}
                    </strong>
                    , pero estás guardandola en{" "}
                    <strong>{environment}</strong>. Wompi va a rechazarla.
                  </span>
                ) : f.helpText ? (
                  <span className="mt-1 block text-2xs text-zinc-500">
                    {f.helpText}
                  </span>
                ) : null}
              </label>
            );
          })}

          {/* Resultado de "Probar conexión" */}
          {testResult?.ok && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800 ring-1 ring-emerald-200">
              <div className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Conexión OK
                  {testResult.merchantName && (
                    <>
                      {" "}— merchant <strong>{testResult.merchantName}</strong>
                    </>
                  )}
                  . Las llaves son válidas para <strong>{environment}</strong>.
                </span>
              </div>
            </div>
          )}
          {testResult && !testResult.ok && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-800 ring-1 ring-rose-200">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{testResult.error}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 p-4">
          {/* Test connection (solo para providers que lo soportan) */}
          {(provider === "wompi" || provider === "stripe") && (
            <button
              type="button"
              onClick={testConnection}
              disabled={busy || testing || hasMismatch}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              Probar conexión
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
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
              disabled={busy || hasMismatch}
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
      "Pega las 4 llaves de tu dashboard de Wompi → Configuración → API Keys.",
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
    helpText: "Configura si quieres aceptar tarjetas internacionales.",
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
