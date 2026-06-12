"use client";

import { useState } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";

type Variant = { tone: string; text: string };

const TONE_LABEL: Record<string, string> = {
  emocional: "Emocional",
  directo: "Directo",
  curioso: "Curioso",
};
const TONE_COLOR: Record<string, string> = {
  emocional: "bg-rose-50 text-rose-700",
  directo: "bg-blue-50 text-blue-700",
  curioso: "bg-amber-50 text-amber-700",
};

export default function CaptionAssist({
  brandId,
  images,
  currentCaption,
  platform,
  onPick,
}: {
  brandId: string;
  images: string[];
  currentCaption: string;
  platform: string;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (images.length === 0) {
      setError("Sube una imagen primero");
      return;
    }
    setLoading(true);
    setError(null);
    setOpen(true);
    const res = await fetch("/api/posts/generate-caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId,
        imageUrls: images,
        currentCaption,
        platform,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Error al generar");
      return;
    }
    const j = await res.json();
    setVariants(j.captions ?? []);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={generate}
          disabled={loading || images.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-300 bg-fuchsia-50/70 px-3 py-1 text-[12px] font-semibold text-fuchsia-700 transition hover:bg-fuchsia-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {variants.length > 0 ? "Regenerar" : "Generar caption con AI"}
        </button>
        {variants.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setVariants([]);
            }}
            className="text-2xs font-medium text-zinc-500 hover:text-zinc-900"
          >
            Cerrar
          </button>
        )}
      </div>

      {error && <p className="text-[12px] text-rose-600">{error}</p>}

      {open && (loading || variants.length > 0) && (
        <div className="space-y-2">
          {loading && variants.length === 0 && (
            <div className="card flex items-center gap-2 p-3 text-[12px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analizando la imagen y escribiendo 3 variantes...
            </div>
          )}
          {variants.map((v, i) => (
            <div key={i} className="card group p-3">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wider ${
                    TONE_COLOR[v.tone] ?? "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {TONE_LABEL[v.tone] ?? v.tone}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onPick(v.text);
                    setOpen(false);
                  }}
                  className="btn-gradient rounded-md px-3 py-1 text-2xs font-semibold opacity-0 transition group-hover:opacity-100"
                >
                  Usar este
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-zinc-800">{v.text}</p>
            </div>
          ))}
          {variants.length > 0 && !loading && (
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-1 text-2xs font-medium text-zinc-500 hover:text-fuchsia-700"
            >
              <RefreshCw className="h-3 w-3" />
              Generar nuevas variantes
            </button>
          )}
        </div>
      )}
    </div>
  );
}
