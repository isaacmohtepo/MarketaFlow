"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  FileIcon,
  Globe,
  ImageOff,
  Layers,
  Loader2,
  MessageSquare,
  MoreVertical,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import {
  ASSET_TYPE_LABEL,
  ASSET_TYPE_NEW_CTA,
  type AssetType,
} from "@/lib/asset-types";

type Deliverable = {
  id: string;
  imageUrl: string | null;
  status: string;
  caption: string;
  scheduledAt: string | null;
  assetType: string;
  sourceUrl: string | null;
  imageCount: number;
  unresolvedComments: number;
  totalComments: number;
  hasNewActivity: boolean;
};

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatScheduled(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function CoverPreview({ d }: { d: Deliverable }) {
  // Imagen disponible (cover) → mostrarla
  if (d.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={d.imageUrl}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  // Web design con URL pero sin captura → mostrar mock browser
  if (d.assetType === "web_design" && d.sourceUrl) {
    return (
      <div className="flex h-full w-full flex-col bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
        <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-white/70 px-2.5 py-1.5">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          </span>
          <span className="ml-1 truncate font-mono text-[10px] text-zinc-500">
            {hostOf(d.sourceUrl)}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Globe className="h-7 w-7 text-zinc-400" />
        </div>
      </div>
    );
  }
  // Video con URL → tarjeta video
  if (d.assetType === "video" && d.sourceUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-100 via-fuchsia-100 to-amber-100">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/80 ring-1 ring-zinc-200">
          <Play className="h-5 w-5 fill-zinc-700 text-zinc-700" />
        </span>
      </div>
    );
  }
  // Otros / branding sin imagen
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200">
      <FileIcon className="h-7 w-7 text-zinc-400" />
    </div>
  );
}

export default function DeliverablesList({
  brandId,
  items,
  isFiltered = false,
  canCreate = false,
  canEdit = false,
  activeType = "other",
}: {
  brandId: string;
  items: Deliverable[];
  isFiltered?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  activeType?: AssetType;
}) {
  const router = useRouter();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  async function trashItem(id: string) {
    if (!confirm("¿Mandar a papelera? Podrás recuperarlo desde la papelera.")) return;
    setDeletingId(id);
    setMenuId(null);
    try {
      const r = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (r.ok) {
        setHidden((s) => {
          const next = new Set(s);
          next.add(id);
          return next;
        });
        router.refresh();
      } else {
        alert("No se pudo mandar a papelera.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  const emptyCopy: Record<AssetType, { title: string; hint: string }> = {
    social_post: {
      title: "Sin posts todavía",
      hint: "Aquí van los posts para redes sociales del cliente.",
    },
    web_design: {
      title: "Sin diseños web todavía",
      hint: "Mockups de landings, sitios o dashboards para que el cliente revise y comente.",
    },
    video: {
      title: "Sin videos todavía",
      hint: "Reels, ads o piezas de video para aprobación del cliente.",
    },
    graphic: {
      title: "Sin piezas gráficas todavía",
      hint: "Banners, flyers, ads o cualquier pieza estática.",
    },
    branding: {
      title: "Sin identidad todavía",
      hint: "Logos, manuales y sistemas visuales para revisión.",
    },
    other: {
      title: "Sin archivos todavía",
      hint: "Cualquier archivo o documento que necesite aprobación del cliente.",
    },
  };
  if (items.length === 0) {
    const copy = emptyCopy[activeType] ?? emptyCopy.other;
    return (
      <div className="card flex flex-col items-center gap-3 p-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
          <Sparkles className="h-5 w-5 text-zinc-500" />
        </span>
        <div>
          <p className="text-[14px] font-semibold text-zinc-900">
            {isFiltered ? "Nada con este filtro" : copy.title}
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            {isFiltered ? "Cambia el filtro o crea uno nuevo." : copy.hint}
          </p>
        </div>
        {!isFiltered && canCreate && (
          <Link
            href={`/brands/${brandId}/posts/new?type=${activeType}`}
            className="btn-gradient inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            {ASSET_TYPE_NEW_CTA[activeType]}
          </Link>
        )}
      </div>
    );
  }

  const visibleItems = items.filter((d) => !hidden.has(d.id));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visibleItems.map((d) => {
        const captionPreview = d.caption?.trim() ? d.caption.trim().slice(0, 80) : null;
        return (
          <div key={d.id} className="relative">
          <Link
            href={`/brands/${brandId}/posts/${d.id}`}
            className={`card group relative block overflow-hidden p-0 transition hover:shadow-md ${
              d.unresolvedComments > 0
                ? "border-rose-300 ring-2 ring-rose-100 hover:ring-rose-200"
                : "hover:border-zinc-300 hover:shadow-sm"
            }`}
          >
            <div className="relative h-44 w-full overflow-hidden bg-zinc-100">
              <CoverPreview d={d} />

              <div className="absolute left-2 right-2 top-2 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none backdrop-blur-md ${STATUS_COLOR[d.status] ?? "bg-zinc-200/80"}`}
                  >
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                  {d.hasNewActivity && (
                    <span className="flex items-center gap-1 rounded-full brand-gradient px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      <span className="relative inline-flex h-1.5 w-1.5">
                        <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
                        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-white" />
                      </span>
                      Nuevo
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-white/85 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-zinc-700 backdrop-blur-md">
                  {ASSET_TYPE_LABEL[d.assetType as AssetType] ?? d.assetType}
                </span>
              </div>

              {d.imageCount > 1 && (
                <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                  <Layers className="h-2.5 w-2.5" />
                  {d.imageCount}
                </span>
              )}

              {d.unresolvedComments > 0 ? (
                <span className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-1 text-[11px] font-bold text-white shadow-[0_4px_12px_rgba(244,63,94,0.55)] ring-2 ring-white">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-white/80" />
                    <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  <MessageSquare className="h-3 w-3" strokeWidth={2.5} />
                  <span className="tabular-nums">{d.unresolvedComments}</span>
                  <span className="text-[10px] font-semibold opacity-95">
                    pendiente{d.unresolvedComments === 1 ? "" : "s"}
                  </span>
                </span>
              ) : d.totalComments > 0 ? (
                <span className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-[0_2px_6px_rgba(0,0,0,0.10)] ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                  <span className="tabular-nums">{d.totalComments}</span>
                  <span className="text-[10px] font-semibold opacity-95">resuelto{d.totalComments === 1 ? "" : "s"}</span>
                </span>
              ) : null}
            </div>

            <div className="p-3">
              <p className="line-clamp-2 text-[12.5px] font-medium text-zinc-800">
                {captionPreview ?? <span className="text-zinc-400">Sin descripción</span>}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-zinc-500">
                {d.sourceUrl ? (
                  <span className="flex min-w-0 items-center gap-1">
                    <Globe className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate font-mono">{hostOf(d.sourceUrl)}</span>
                  </span>
                ) : (
                  <span />
                )}
                {d.scheduledAt && (
                  <span className="flex flex-shrink-0 items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {formatScheduled(d.scheduledAt)}
                  </span>
                )}
              </div>
            </div>

            {!d.imageUrl && d.imageCount === 0 && d.assetType === "web_design" && !d.sourceUrl && (
              <span className="absolute inset-0 flex items-center justify-center bg-zinc-50/80 text-[11px] text-zinc-500">
                <ImageOff className="mr-1 h-3 w-3" /> Sin contenido
              </span>
            )}
          </Link>

          {/* Menú de acciones (papelera) */}
          {canEdit && (
            <div className="absolute right-2 top-2 z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuId((cur) => (cur === d.id ? null : d.id));
                }}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-zinc-700 shadow-sm ring-1 ring-zinc-200 backdrop-blur-md hover:bg-white"
                aria-label="Acciones"
              >
                {deletingId === d.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MoreVertical className="h-3.5 w-3.5" />
                )}
              </button>
              {menuId === d.id && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuId(null)}
                  />
                  <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        trashItem(d.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[12.5px] text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Mandar a papelera
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}
