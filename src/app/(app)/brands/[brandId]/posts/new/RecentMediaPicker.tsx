"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Layers, Loader2, Check } from "lucide-react";
import MediaThumb from "@/components/MediaThumb";

type RecentItem = {
  url: string;
  mime: string | null;
  name: string | null;
  createdAt: string;
};

/**
 * Panel colapsable que muestra los últimos archivos subidos a otros
 * posts de la brand, así el user puede reusarlos en el post nuevo
 * sin re-subir.
 *
 * - Click en un thumbnail → llama a `onSelect(item)` con la URL + mime.
 * - Items ya seleccionados muestran un check verde y se deshabilitan.
 */
export default function RecentMediaPicker({
  brandId,
  selectedUrls,
  onSelect,
  defaultOpen = false,
}: {
  brandId: string;
  /** URLs ya agregadas al post (para mostrarlas como "ya agregada"). */
  selectedUrls: Set<string>;
  onSelect: (item: { url: string; mime: string | null; name: string | null }) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState<RecentItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || items !== null) return;
    setLoading(true);
    fetch(`/api/brands/${brandId}/recent-media?limit=24`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setItems(j.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, brandId, items]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-zinc-50"
      >
        <Layers className="h-3.5 w-3.5 text-zinc-500" />
        <span className="flex-1 text-[12.5px] font-medium text-zinc-700">
          Reusar archivo subido recientemente
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-zinc-200 px-3 py-2.5">
          {loading && items === null ? (
            <div className="flex items-center gap-2 py-3 text-[12px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cargando recientes...
            </div>
          ) : items && items.length === 0 ? (
            <p className="py-3 text-center text-[11.5px] text-zinc-500">
              Todavía no hay archivos subidos en esta marca. Cuando subas algo
              aquí o en otros posts, va a aparecer en este panel.
            </p>
          ) : (
            <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {items?.map((item) => {
                const already = selectedUrls.has(item.url);
                return (
                  <li key={item.url}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!already) onSelect(item);
                      }}
                      disabled={already}
                      className={`group relative block aspect-square w-full overflow-hidden rounded-md ring-1 transition ${
                        already
                          ? "ring-emerald-400 opacity-60"
                          : "ring-zinc-200 hover:ring-fuchsia-400 hover:ring-2"
                      }`}
                      title={
                        already
                          ? "Ya agregado al post"
                          : item.name ?? "Agregar al post"
                      }
                    >
                      <MediaThumb
                        url={item.url}
                        className="h-full w-full object-cover"
                        showPlayIcon={
                          (item.mime ?? "").startsWith("video/")
                        }
                      />
                      {already && (
                        <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/20">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white shadow-md">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {items && items.length > 0 && (
            <p className="mt-2 text-[10.5px] text-zinc-400">
              Click un archivo para agregarlo · {items.length}{" "}
              {items.length === 1 ? "archivo" : "archivos"} reciente
              {items.length === 1 ? "" : "s"} en esta marca
            </p>
          )}
        </div>
      )}
    </div>
  );
}
