"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Layout, Share2 } from "lucide-react";

type Template = {
  id: string;
  name: string;
  caption: string;
  platform: string;
  postType: string;
  isShared?: boolean;
  fromBrandName?: string | null;
};

export default function TemplatePicker({
  brandId,
  onApply,
}: {
  brandId: string;
  onApply: (t: { caption: string; platform: string; postType: string }) => void;
}) {
  const [items, setItems] = useState<Template[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (items !== null) return;
    fetch(`/api/brands/${brandId}/templates`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => setItems(j.templates ?? []))
      .catch(() => setItems([]));
  }, [brandId, items]);

  if (items === null) {
    return null;
  }
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1.5 rounded-full btn-secondary px-3 py-1.5 text-[12px] font-semibold"
      >
        <Layout className="h-3.5 w-3.5" />
        Usar plantilla
        <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border bg-white shadow-lg divider">
          <p className="border-b divider px-3 py-2 text-3xs font-semibold uppercase tracking-wider text-zinc-500">
            Plantillas guardadas
          </p>
          <ul className="max-h-72 overflow-auto py-1">
            {items.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={() => {
                    onApply({ caption: t.caption, platform: t.platform, postType: t.postType });
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-[13px] transition hover:bg-zinc-50"
                >
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold text-zinc-900">{t.name}</p>
                    {t.isShared && (
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-blue-700">
                        <Share2 className="h-2.5 w-2.5" />
                        {t.fromBrandName ? `Desde ${t.fromBrandName}` : "Compartida"}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-2xs text-zinc-500">
                    {t.caption || "Sin caption"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
