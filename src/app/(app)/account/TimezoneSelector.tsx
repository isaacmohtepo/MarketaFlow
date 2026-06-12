"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, MapPin } from "lucide-react";
import { toast } from "sonner";

const COMMON_TIMEZONES = [
  "America/Bogota",
  "America/Mexico_City",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Caracas",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
];

export default function TimezoneSelector({
  initial,
}: {
  initial: string | null;
}) {
  const [tz, setTz] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [autoDetected, setAutoDetected] = useState<string | null>(null);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setAutoDetected(detected);
    } catch {
      // ignored
    }
  }, []);

  const dirty = (initial ?? "") !== tz;
  const allOptions = Array.from(new Set([...COMMON_TIMEZONES, tz, autoDetected].filter(Boolean) as string[])).sort();

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz || null }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success("Zona horaria actualizada");
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1">
          <span className="text-[11.5px] font-semibold text-zinc-700">
            Zona horaria
          </span>
          <select
            value={tz}
            onChange={(e) => setTz(e.currentTarget.value)}
            className="input-soft mt-1 w-full rounded-md px-3 py-2 text-[13px]"
          >
            <option value="">Sin definir (usa UTC por defecto)</option>
            {allOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Guardar
        </button>
      </div>
      {autoDetected && autoDetected !== tz && (
        <button
          type="button"
          onClick={() => setTz(autoDetected)}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-2xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          <MapPin className="h-3 w-3" />
          Detectada: {autoDetected} — usar
        </button>
      )}
    </div>
  );
}
