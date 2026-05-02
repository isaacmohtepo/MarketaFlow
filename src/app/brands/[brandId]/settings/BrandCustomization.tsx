"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, Palette } from "lucide-react";

const PRESET_COLORS = [
  "#3b5fff", "#8a2be2", "#ff4d8f", "#ff2d55",
  "#10b981", "#f59e0b", "#06b6d4", "#0f172a",
];

export default function BrandCustomization({
  brandId,
  initial,
}: {
  brandId: string;
  initial: {
    name: string;
    handle: string | null;
    logoUrl: string | null;
    color: string | null;
    bio: string | null;
  };
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial.name);
  const [handle, setHandle] = useState(initial.handle ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [color, setColor] = useState(initial.color ?? "#8a2be2");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    setUploading(false);
    if (!r.ok) {
      setError("No se pudo subir el logo");
      return;
    }
    const j = await r.json();
    setLogoUrl(j.url);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    const r = await fetch(`/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        handle: handle.trim() || null,
        logoUrl: logoUrl ?? null,
        color,
        bio: bio.trim() || null,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Error al guardar");
      return;
    }
    setSavedOk(true);
    router.refresh();
    setTimeout(() => setSavedOk(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Logo + identidad */}
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-2 border-dashed divider bg-zinc-50 text-zinc-400 transition hover:border-zinc-400"
            style={logoUrl ? undefined : { background: color, borderStyle: "solid", borderColor: "transparent" }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-white">
                {(name || "M")[0]?.toUpperCase()}
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 grid place-items-center bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900"
          >
            <UploadCloud className="h-3 w-3" />
            {logoUrl ? "Cambiar" : "Subir logo"}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={() => setLogoUrl(null)}
              className="text-[10px] text-zinc-500 hover:text-rose-600"
            >
              Quitar
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex-1 space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-zinc-700">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md input-soft px-3 py-1.5 text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-700">Handle</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@instagram"
              className="mt-1 w-full rounded-md input-soft px-3 py-1.5 text-[13px]"
            />
          </div>
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-700">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={2}
          placeholder="Una línea descriptiva de la marca..."
          className="mt-1 w-full rounded-md input-soft px-3 py-2 text-[13px]"
        />
        <p className="mt-0.5 text-[10px] text-zinc-500 text-right tabular-nums">
          {bio.length}/280
        </p>
      </div>

      {/* Color */}
      <div>
        <label className="flex items-center gap-1 text-[11px] font-medium text-zinc-700">
          <Palette className="h-3 w-3" />
          Color principal
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full transition ${
                color.toLowerCase() === c.toLowerCase()
                  ? "ring-2 ring-zinc-900 ring-offset-2"
                  : "ring-1 ring-zinc-200"
              }`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
          <label className="flex items-center gap-1.5 rounded-md border divider bg-white px-2 py-1 text-[12px] text-zinc-700">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-5 w-7 cursor-pointer rounded border border-zinc-200"
            />
            <span className="font-mono uppercase">{color}</span>
          </label>
        </div>
      </div>

      {error && <p className="text-[12px] text-rose-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        {savedOk && (
          <span className="text-[12px] font-medium text-emerald-700">✓ Guardado</span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="btn-gradient rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
