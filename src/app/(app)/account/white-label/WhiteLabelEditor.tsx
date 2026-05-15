"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X, Eye } from "lucide-react";
import { toast } from "sonner";

export default function WhiteLabelEditor({
  agencyName,
  initial,
}: {
  agencyName: string;
  initial: {
    brandName: string | null;
    logoUrl: string | null;
    accentColor: string | null;
  };
}) {
  const router = useRouter();
  const [brandName, setBrandName] = useState(initial.brandName ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [accentColor, setAccentColor] = useState(
    initial.accentColor ?? "#8a2be2",
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen (PNG/SVG/JPG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El logo debe pesar menos de 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) {
        toast.error("No se pudo subir el logo");
        return;
      }
      const j = await r.json();
      setLogoUrl(j.url);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/account/white-label", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim() || null,
          logoUrl,
          accentColor: accentColor === "#8a2be2" ? null : accentColor,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo guardar");
        return;
      }
      toast.success("Branding actualizado");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const effectiveBrandName = brandName.trim() || agencyName;

  return (
    <div className="space-y-5">
      {/* Logo */}
      <div className="card p-5">
        <label className="block text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
          Logo
        </label>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          PNG transparente, SVG o JPG. Máx 2 MB. Ideal cuadrado o casi
          cuadrado, mínimo 256×256 px. Se va a mostrar en headers / emails.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg bg-zinc-50 ring-1 ring-zinc-200">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[18px] font-bold text-zinc-400">
                {effectiveBrandName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <label className="btn-secondary inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold">
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {logoUrl ? "Cambiar" : "Subir logo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
              }}
              disabled={uploading}
            />
          </label>
          {logoUrl && (
            <button
              type="button"
              onClick={() => setLogoUrl(null)}
              className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
              title="Quitar logo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Nombre */}
      <div className="card p-5">
        <label className="block text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
          Nombre del brand
        </label>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Reemplaza &quot;MarketaFlow&quot; en lo que ven tus clientes. Si lo
          dejás vacío, usamos el nombre de tu agencia ({agencyName}).
        </p>
        <input
          type="text"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder={agencyName}
          maxLength={50}
          className="input-soft mt-3 w-full rounded-md px-3 py-2 text-[13px]"
        />
      </div>

      {/* Color */}
      <div className="card p-5">
        <label className="block text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
          Color de acento
        </label>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Usado para botones de aprobación / links en páginas públicas y
          emails. Default: violeta MarketaFlow.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded-md border border-zinc-200 bg-white"
          />
          <input
            type="text"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            maxLength={7}
            placeholder="#8a2be2"
            className="input-soft w-32 rounded-md px-3 py-2 font-mono text-[12px] uppercase"
          />
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 p-5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <Eye className="h-3 w-3" />
          Preview de página pública
        </div>
        <div className="mt-3 rounded-md bg-white p-4 ring-1 ring-zinc-200">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-7 w-7 rounded object-contain" />
            ) : (
              <span
                className="grid h-7 w-7 place-items-center rounded text-[12px] font-bold text-white"
                style={{ background: accentColor }}
              >
                {effectiveBrandName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="text-[13px] font-bold text-zinc-900">
              {effectiveBrandName}
            </span>
          </div>
          <div className="mt-3 text-[12px] text-zinc-700">
            <p>Te invitan a revisar contenido</p>
            <button
              type="button"
              className="mt-3 rounded-md px-3 py-1.5 text-[11.5px] font-semibold text-white"
              style={{ background: accentColor }}
            >
              Aprobar post
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={save}
          disabled={saving || uploading}
          className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12.5px] font-semibold disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Guardar branding"
          )}
        </button>
      </div>
    </div>
  );
}
