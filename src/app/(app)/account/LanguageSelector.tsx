"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Globe } from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇺🇸" },
] as const;

export default function LanguageSelector({
  initial,
}: {
  initial: string | null;
}) {
  const router = useRouter();
  const [locale, setLocale] = useState(initial ?? "es");
  const [busy, setBusy] = useState(false);

  const dirty = locale !== (initial ?? "es");

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success("Idioma actualizado");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block flex-1">
        <span className="text-[11.5px] font-semibold text-zinc-700">
          Idioma de la interfaz
        </span>
        <select
          value={locale}
          onChange={(e) => setLocale(e.currentTarget.value)}
          className="input-soft mt-1 w-full rounded-md px-3 py-2 text-[13px]"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10.5px] text-zinc-500">
          Algunos textos todavía se ven en español aunque elijas inglés —
          la migración es incremental.
        </p>
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
  );
}
