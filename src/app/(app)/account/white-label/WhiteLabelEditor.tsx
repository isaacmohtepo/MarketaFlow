"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Upload,
  X,
  Eye,
  RotateCcw,
  Image as ImageIcon,
  Type,
  LayoutGrid,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { toast } from "sonner";

type LogoMode = "logo_and_text" | "logo_only" | "text_only";
type HeaderAlign = "left" | "center" | "right";
const DEFAULT_LOGO_HEIGHT = 32;

const DEFAULT_FROM = "#3b5fff";
const DEFAULT_VIA = "#8a2be2";
const DEFAULT_TO = "#ff2d55";

const PRESETS: { name: string; from: string; to: string; accent: string }[] = [
  { name: "MarketaFlow", from: "#3b5fff", to: "#ff2d55", accent: "#8a2be2" },
  { name: "Esmeralda", from: "#10b981", to: "#0ea5e9", accent: "#10b981" },
  { name: "Atardecer", from: "#f59e0b", to: "#ef4444", accent: "#f97316" },
  { name: "Bosque", from: "#16a34a", to: "#065f46", accent: "#16a34a" },
  { name: "Océano", from: "#0ea5e9", to: "#312e81", accent: "#0ea5e9" },
  { name: "Mono", from: "#18181b", to: "#52525b", accent: "#27272a" },
];

export default function WhiteLabelEditor({
  agencyName,
  initial,
}: {
  agencyName: string;
  initial: {
    brandName: string | null;
    logoUrl: string | null;
    accentColor: string | null;
    gradientFrom: string | null;
    gradientTo: string | null;
    logoMode: string | null;
    logoHeight: number | null;
    headerAlign: string | null;
  };
}) {
  const router = useRouter();
  const [brandName, setBrandName] = useState(initial.brandName ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [accentColor, setAccentColor] = useState(
    initial.accentColor ?? DEFAULT_VIA,
  );
  const [gradientFrom, setGradientFrom] = useState(
    initial.gradientFrom ?? DEFAULT_FROM,
  );
  const [gradientTo, setGradientTo] = useState(
    initial.gradientTo ?? DEFAULT_TO,
  );
  const [logoMode, setLogoMode] = useState<LogoMode>(
    (initial.logoMode as LogoMode | null) ?? "logo_and_text",
  );
  const [logoHeight, setLogoHeight] = useState<number>(
    initial.logoHeight ?? DEFAULT_LOGO_HEIGHT,
  );
  const [headerAlign, setHeaderAlign] = useState<HeaderAlign>(
    (initial.headerAlign as HeaderAlign | null) ??
      ((initial.logoMode === "logo_only" ? "center" : "left") as HeaderAlign),
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Si quitan el logo, el modo "solo logo" no tiene sentido — caemos a text_only
  const effectiveMode: LogoMode =
    !logoUrl && logoMode === "logo_only" ? "text_only" : logoMode;

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
          accentColor: accentColor === DEFAULT_VIA ? null : accentColor,
          gradientFrom: gradientFrom === DEFAULT_FROM ? null : gradientFrom,
          gradientTo: gradientTo === DEFAULT_TO ? null : gradientTo,
          logoMode: effectiveMode,
          logoHeight,
          headerAlign,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo guardar");
        return;
      }
      toast.success("Branding guardado — refrescá para ver el cambio en la app");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    setGradientFrom(p.from);
    setGradientTo(p.to);
    setAccentColor(p.accent);
  }

  function resetColors() {
    setGradientFrom(DEFAULT_FROM);
    setGradientTo(DEFAULT_TO);
    setAccentColor(DEFAULT_VIA);
  }

  const effectiveBrandName = brandName.trim() || agencyName;
  const previewGradient = `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`;

  return (
    <div className="space-y-5">
      {/* Logo */}
      <div className="card p-5">
        <label className="block text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
          Logo
        </label>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          PNG transparente, SVG o JPG. Máx 2 MB. Ideal cuadrado o casi
          cuadrado, mínimo 256×256 px. Se va a mostrar en el sidebar, headers
          y emails.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg ring-1 ring-zinc-200"
            style={{ background: logoUrl ? "#fff" : previewGradient }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-[20px] font-bold text-white">
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

      {/* Modo de display */}
      <div className="card p-5">
        <label className="block text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
          Cómo se muestra en el sidebar
        </label>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Si tu logo ya incluye el nombre, elegí &quot;Solo logo&quot; para
          evitar que aparezca duplicado.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ModeOption
            active={effectiveMode === "logo_and_text"}
            onClick={() => setLogoMode("logo_and_text")}
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="Logo + nombre"
            description="Logo chico al lado del nombre del brand"
          />
          <ModeOption
            active={effectiveMode === "logo_only"}
            onClick={() => setLogoMode("logo_only")}
            icon={<ImageIcon className="h-3.5 w-3.5" />}
            label="Solo logo"
            description="Logo más grande, sin texto al lado"
            disabled={!logoUrl}
            disabledHint={!logoUrl ? "Subí un logo primero" : undefined}
          />
          <ModeOption
            active={effectiveMode === "text_only"}
            onClick={() => setLogoMode("text_only")}
            icon={<Type className="h-3.5 w-3.5" />}
            label="Solo nombre"
            description="Sin logo, solo tipografía"
          />
        </div>

        {/* Tamaño del logo — solo aplica en modo logo_only */}
        {effectiveMode === "logo_only" && (
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Tamaño del logo
              </label>
              <span className="font-mono text-[11px] tabular-nums text-zinc-600">
                {logoHeight}px
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={56}
              step={1}
              value={logoHeight}
              onChange={(e) =>
                setLogoHeight(parseInt(e.target.value, 10))
              }
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
              <span>chico</span>
              <span>grande</span>
            </div>
          </div>
        )}

        {/* Alineación */}
        <div className="mt-5">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Alineación
          </label>
          <div className="mt-2 inline-flex rounded-md border border-zinc-200 bg-white p-0.5">
            <AlignButton
              active={headerAlign === "left"}
              onClick={() => setHeaderAlign("left")}
              icon={<AlignLeft className="h-3.5 w-3.5" />}
              label="Izquierda"
            />
            <AlignButton
              active={headerAlign === "center"}
              onClick={() => setHeaderAlign("center")}
              icon={<AlignCenter className="h-3.5 w-3.5" />}
              label="Centro"
            />
            <AlignButton
              active={headerAlign === "right"}
              onClick={() => setHeaderAlign("right")}
              icon={<AlignRight className="h-3.5 w-3.5" />}
              label="Derecha"
            />
          </div>
        </div>
      </div>

      {/* Nombre */}
      <div className="card p-5">
        <label className="block text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
          Nombre del brand
        </label>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Reemplaza &quot;MarketaFlow&quot; en sidebar, emails y páginas
          públicas. Si lo dejás vacío, usamos el nombre de tu agencia (
          {agencyName}).
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

      {/* Colores */}
      <div className="card p-5">
        <div className="flex items-end justify-between">
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
              Colores
            </label>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              El gradiente se aplica a botones primarios, badges y
              encabezados. El accent es el color sólido para acciones
              individuales.
            </p>
          </div>
          <button
            type="button"
            onClick={resetColors}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
          >
            <RotateCcw className="h-3 w-3" />
            Restaurar
          </button>
        </div>

        {/* Presets rápidos */}
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[10.5px] font-medium hover:border-zinc-300"
              title={`Aplicar preset ${p.name}`}
            >
              <span
                className="h-3 w-6 rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
                }}
              />
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <ColorField
            label="Gradient — desde"
            value={gradientFrom}
            onChange={setGradientFrom}
          />
          <ColorField
            label="Gradient — hasta"
            value={gradientTo}
            onChange={setGradientTo}
          />
          <ColorField
            label="Color de acento"
            value={accentColor}
            onChange={setAccentColor}
            hint="Sólido — botones secundarios"
          />
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-100 p-5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <Eye className="h-3 w-3" />
          Preview en vivo
        </div>

        {/* Preview Sidebar (estilo dashboard interno) */}
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-sm">
          <div
            className={`flex h-14 items-center border-b border-zinc-800 px-4 gap-2.5 ${
              headerAlign === "center"
                ? "justify-center"
                : headerAlign === "right"
                  ? "justify-end"
                  : "justify-start"
            }`}
          >
            {effectiveMode !== "text_only" && (
              <>
                {logoUrl ? (
                  effectiveMode === "logo_only" ? (
                    // Modo logo grande: respeta aspect ratio + altura custom
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt=""
                      style={{ height: `${logoHeight}px` }}
                      className="w-auto max-w-[160px] object-contain"
                    />
                  ) : (
                    <span
                      className="grid h-7 w-7 flex-shrink-0 place-items-center overflow-hidden rounded-lg shadow-sm"
                      style={{ background: "#fff" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoUrl}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </span>
                  )
                ) : (
                  <span
                    className="grid h-7 w-7 flex-shrink-0 place-items-center overflow-hidden rounded-lg shadow-sm"
                    style={{ background: previewGradient }}
                  >
                    <span className="text-[11px] font-bold text-white">
                      {effectiveBrandName.charAt(0).toUpperCase()}
                    </span>
                  </span>
                )}
              </>
            )}
            {effectiveMode !== "logo_only" && (
              <div className="min-w-0">
                <p
                  className={`truncate text-[12px] font-semibold tracking-tight text-white ${
                    headerAlign === "center"
                      ? "text-center"
                      : headerAlign === "right"
                        ? "text-right"
                        : "text-left"
                  }`}
                >
                  {effectiveBrandName}
                </p>
                <p
                  className={`truncate text-[10px] text-zinc-500 ${
                    headerAlign === "center"
                      ? "text-center"
                      : headerAlign === "right"
                        ? "text-right"
                        : "text-left"
                  }`}
                >
                  Vista interna del equipo
                </p>
              </div>
            )}
          </div>
          <div className="space-y-1 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] text-white">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: previewGradient }}
              />
              Dashboard
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
              Marcas
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
              Calendario
            </div>
          </div>
        </div>

        {/* Preview de botones */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 ring-1 ring-zinc-200">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-[11.5px] font-semibold text-white"
            style={{ background: previewGradient }}
          >
            CTA principal
          </button>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-[11.5px] font-semibold text-white"
            style={{ background: accentColor }}
          >
            CTA accent
          </button>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ background: previewGradient }}
          >
            Pro
          </span>
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

function AlignButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ModeOption({
  active,
  onClick,
  icon,
  label,
  description,
  disabled,
  disabledHint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-fuchsia-400 bg-fuchsia-50/50 ring-1 ring-fuchsia-400"
          : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-900">
        {icon}
        {label}
      </span>
      <span className="text-[10.5px] leading-tight text-zinc-500">
        {description}
      </span>
    </button>
  );
}

function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold text-zinc-700">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-zinc-200 bg-white"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
          placeholder="#000000"
          className="input-soft w-full rounded-md px-2 py-1.5 font-mono text-[12px] uppercase"
        />
      </div>
      {hint && <p className="mt-1 text-[10px] text-zinc-500">{hint}</p>}
    </div>
  );
}
