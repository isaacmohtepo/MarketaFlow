"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Loader2,
  AlertTriangle,
  Database,
  Server,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import type { SettingDescriptor } from "@/lib/system-settings";

const GROUP_LABELS: Record<SettingDescriptor["group"], string> = {
  auth: "Autenticación",
  billing: "Facturación",
  email: "Email",
  operations: "Operaciones",
  limits: "Límites y rate limiting",
};

const GROUP_DESCRIPTIONS: Record<SettingDescriptor["group"], string> = {
  auth: "Políticas de login, contraseñas y sesiones.",
  billing: "Trial, ciclos de cobro, defaults.",
  email: "Remitente, soporte, notificaciones.",
  operations: "Maintenance mode, signups, kill switches.",
  limits: "Rate limiting, retries, throttling.",
};

const GROUP_ORDER: SettingDescriptor["group"][] = [
  "auth",
  "billing",
  "email",
  "operations",
  "limits",
];

export default function SettingsForm({
  initial,
}: {
  initial: SettingDescriptor[];
}) {
  const router = useRouter();
  // Estado local: { key → valor pending }. Si == valor original, no hay diff.
  const [pendingValues, setPendingValues] = useState<Record<string, unknown>>(
    {},
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Agrupar por group
  const grouped: Record<string, SettingDescriptor[]> = {};
  for (const item of initial) {
    if (!grouped[item.group]) grouped[item.group] = [];
    grouped[item.group].push(item);
  }

  function getCurrentValue(item: SettingDescriptor): unknown {
    return item.key in pendingValues ? pendingValues[item.key] : item.value;
  }

  function setValue(key: string, value: unknown) {
    setPendingValues((p) => ({ ...p, [key]: value }));
  }

  async function save(item: SettingDescriptor) {
    const newValue = getCurrentValue(item);
    if (newValue === item.value) return; // no diff

    if (item.warning) {
      const ok = window.confirm(
        `${item.warning}\n\n¿Confirmás el cambio?`,
      );
      if (!ok) return;
    }

    setBusyKey(item.key);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key, value: newValue }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success(`${item.label} actualizado`);
      // Limpiar pending para esta key
      setPendingValues((p) => {
        const rest = { ...p };
        delete rest[item.key];
        return rest;
      });
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {GROUP_ORDER.filter((g) => grouped[g]).map((group) => (
        <section key={group} className="card overflow-hidden">
          <div className="border-b border-zinc-100 bg-zinc-50/40 px-5 py-3">
            <h2 className="text-[13px] font-bold text-zinc-900">
              {GROUP_LABELS[group]}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              {GROUP_DESCRIPTIONS[group]}
            </p>
          </div>
          <ul className="divide-y divide-zinc-100">
            {grouped[group].map((item) => (
              <SettingRow
                key={item.key}
                item={item}
                value={getCurrentValue(item)}
                onChange={(v) => setValue(item.key, v)}
                onSave={() => save(item)}
                busy={busyKey === item.key}
                dirty={item.key in pendingValues && pendingValues[item.key] !== item.value}
              />
            ))}
          </ul>
        </section>
      ))}

      <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-4 text-[11.5px] text-zinc-600">
        <div className="flex items-start gap-2">
          <Sliders className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
          <div>
            <p className="font-semibold text-zinc-900">¿Qué NO está acá?</p>
            <p className="mt-1">
              <strong>Secrets</strong> (DATABASE_URL, CRON_SECRET, master key)
              se gestionan via Vercel env vars o{" "}
              <a href="/admin/setup" className="text-fuchsia-600 hover:underline">
                /admin/setup
              </a>
              . <strong>API keys</strong> de pasarelas y providers desde{" "}
              <a
                href="/admin/integrations"
                className="text-fuchsia-600 hover:underline"
              >
                /admin/integrations
              </a>
              . <strong>Plan limits y precios</strong> requieren cambio de código
              porque afectan billing existente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  item,
  value,
  onChange,
  onSave,
  busy,
  dirty,
}: {
  item: SettingDescriptor;
  value: unknown;
  onChange: (v: unknown) => void;
  onSave: () => void;
  busy: boolean;
  dirty: boolean;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-zinc-900">
            {item.label}
          </p>
          <SourceBadge source={item.source} />
          {item.warning && (
            <AlertTriangle className="h-3 w-3 text-amber-500" />
          )}
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-500">
          {item.description}
        </p>
        {item.warning && (
          <p className="mt-2 inline-flex items-start gap-1 rounded bg-amber-50 px-2 py-1 text-[10.5px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-2.5 w-2.5 flex-shrink-0" />
            {item.warning}
          </p>
        )}
        <p className="mt-2 text-[10.5px] text-zinc-400">
          Default:{" "}
          <code className="rounded bg-zinc-100 px-1 font-mono">
            {String(item.default)}
          </code>
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {item.type === "boolean" ? (
          <BooleanToggle on={Boolean(value)} disabled={busy} onChange={onChange} />
        ) : item.type === "number" ? (
          <NumberInput
            value={Number(value ?? 0)}
            min={item.min}
            max={item.max}
            unit={item.unit}
            disabled={busy}
            onChange={onChange}
          />
        ) : (
          <StringInput
            value={String(value ?? "")}
            placeholder={item.placeholder}
            maxLength={item.maxLength}
            disabled={busy}
            onChange={onChange}
          />
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || busy}
          className={`inline-flex h-8 items-center gap-1 rounded-md px-3 text-[11.5px] font-semibold disabled:opacity-40 ${
            dirty
              ? "bg-zinc-900 text-white hover:bg-zinc-800"
              : "border border-zinc-200 text-zinc-500"
          }`}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Guardar
        </button>
      </div>
    </li>
  );
}

function SourceBadge({
  source,
}: {
  source: "db" | "env" | "default";
}) {
  if (source === "db") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
        <Database className="h-2.5 w-2.5" />
        DB
      </span>
    );
  }
  if (source === "env") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-blue-200">
        <Server className="h-2.5 w-2.5" />
        Env
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500 ring-1 ring-zinc-200">
      Default
    </span>
  );
}

function BooleanToggle({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        on ? "brand-gradient" : "bg-zinc-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function NumberInput({
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.currentTarget.value, 10) || 0)}
        className="input-soft w-20 rounded-md px-2 py-1.5 text-right text-[12.5px] tabular-nums"
      />
      {unit && (
        <span className="text-[10.5px] text-zinc-500 whitespace-nowrap">
          {unit}
        </span>
      )}
    </div>
  );
}

function StringInput({
  value,
  placeholder,
  maxLength,
  disabled,
  onChange,
}: {
  value: string;
  placeholder?: string;
  maxLength?: number;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value)}
      className="input-soft w-56 rounded-md px-2 py-1.5 text-[12.5px]"
    />
  );
}
