"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FileEdit, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

type Draft = {
  caption: string;
  platform: string;
  images: string[];
  savedAt: string;
};

const KEY = (brandId: string) => `mf:draft:${brandId}`;

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export default function UnsavedDraftBanner({ brandId }: { brandId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hidden, setHidden] = useState(false);
  const { confirm: confirmDialog } = useConfirm();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY(brandId));
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (!d.caption && (!d.images || d.images.length === 0)) return;
      setDraft(d);
    } catch {}
  }, [brandId]);

  async function discard() {
    const ok = await confirmDialog({
      title: "¿Descartar el borrador?",
      description: "Perderás lo que escribiste. No se puede deshacer.",
      confirmLabel: "Descartar",
      cancelLabel: "Mantener",
      variant: "danger",
    });
    if (!ok) return;
    try {
      localStorage.removeItem(KEY(brandId));
    } catch {}
    setDraft(null);
  }

  if (!draft || hidden) return null;

  const captionPreview = draft.caption?.trim().slice(0, 80) ?? "";
  const imgCount = draft.images?.length ?? 0;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50/70 via-rose-50/70 to-amber-50/70 px-4 py-3">
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg brand-gradient text-white shadow-sm">
        <FileEdit className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-zinc-900">
          Tienes un borrador sin guardar para esta marca
        </p>
        <p className="truncate text-[11.5px] text-zinc-600">
          {captionPreview ? `"${captionPreview}${draft.caption.length > 80 ? "…" : ""}"` : "Sin caption"}
          {imgCount > 0 && ` · ${imgCount} ${imgCount === 1 ? "imagen" : "imágenes"}`}
          {draft.savedAt && ` · ${relTime(draft.savedAt)}`}
        </p>
      </div>
      <Link
        href={`/brands/${brandId}/posts/new`}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full brand-gradient px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm"
      >
        Continuar
        <ArrowRight className="h-3 w-3" />
      </Link>
      <button
        onClick={discard}
        className="rounded-md px-2.5 py-1 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      >
        Descartar
      </button>
      <button
        onClick={() => setHidden(true)}
        aria-label="Ocultar"
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
