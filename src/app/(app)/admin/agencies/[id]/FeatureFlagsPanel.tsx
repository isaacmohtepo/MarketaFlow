"use client";

import { useEffect, useState } from "react";
import { Loader2, Flag } from "lucide-react";
import { toast } from "sonner";

// Mantener corto: solo flags reales con código que los consulta. Si
// agregás un flag nuevo, también agregalo a KNOWN_FLAGS en lib/features.ts.
const FLAG_INFO: Record<string, { label: string; description: string }> = {
  ai_captions: {
    label: "AI Captions",
    description: "Generación de captions con Anthropic",
  },
};

export default function FeatureFlagsPanel({ agencyId }: { agencyId: string }) {
  const [flags, setFlags] = useState<Record<string, boolean> | null>(null);
  const [busyFlag, setBusyFlag] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/agencies/${agencyId}/features`)
      .then((r) => r.json())
      .then((j) => setFlags(j.flags))
      .catch(() => setFlags({}));
  }, [agencyId]);

  async function toggle(flag: string, value: boolean) {
    setBusyFlag(flag);
    try {
      const res = await fetch(
        `/api/admin/agencies/${agencyId}/features`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flag, value }),
        },
      );
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      setFlags((f) => (f ? { ...f, [flag]: value } : f));
      toast.success(`${flag} → ${value ? "ON" : "OFF"}`);
    } catch {
      toast.error("Error de red");
    } finally {
      setBusyFlag(null);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex items-center gap-2">
        <Flag className="h-3.5 w-3.5 text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-900">Feature flags</h2>
      </div>
      <p className="mt-0.5 text-[11.5px] text-zinc-500">
        Habilitá o deshabilitá features experimentales por agency.
        Cambios al instante — la app re-chequea con cada request.
      </p>

      {flags === null ? (
        <p className="mt-4 inline-flex items-center gap-1 text-[12px] text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando…
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100">
          {Object.entries(flags).map(([flag, enabled]) => {
            const info = FLAG_INFO[flag] ?? {
              label: flag,
              description: "",
            };
            return (
              <li
                key={flag}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-zinc-900">
                    {info.label}
                  </p>
                  {info.description && (
                    <p className="text-[11px] text-zinc-500">
                      {info.description}
                    </p>
                  )}
                </div>
                <Toggle
                  on={enabled}
                  busy={busyFlag === flag}
                  onChange={(v) => toggle(flag, v)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Toggle({
  on,
  busy,
  onChange,
}: {
  on: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        on ? "brand-gradient" : "bg-zinc-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition shadow-sm ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
      {busy && (
        <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
      )}
    </button>
  );
}
