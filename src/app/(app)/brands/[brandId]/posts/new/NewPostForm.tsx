"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UploadCloud, X, Loader2, ImagePlus, RotateCcw, FileIcon } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import CaptionAssist from "./CaptionAssist";
import HashtagPicker from "./HashtagPicker";
import TemplatePicker from "./TemplatePicker";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABEL,
  ASSET_TYPE_CAPTION_LABEL,
  ASSET_TYPE_CAPTION_PLACEHOLDER,
  ASSET_TYPE_NEW_CTA,
  isAssetType,
  type AssetType,
} from "@/lib/asset-types";

const DRAFT_KEY = (brandId: string) => `mf:draft:${brandId}`;
const DRAFT_DEBOUNCE_MS = 800;

type Draft = {
  caption: string;
  platform: string;
  assetType?: AssetType;
  images: string[];
  meta?: Record<string, { mime: string; name: string }>;
  sourceUrl?: string;
  savedAt: string;
};

export default function NewPostForm({
  brandId,
  widgetActive = true,
  widgetHasToken = true,
  widgetOrigins = [],
}: {
  brandId: string;
  widgetActive?: boolean;
  widgetHasToken?: boolean;
  widgetOrigins?: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType: AssetType = (() => {
    const t = searchParams?.get("type");
    return t && isAssetType(t) ? t : "social_post";
  })();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [meta, setMeta] = useState<Record<string, { mime: string; name: string }>>({});
  const [caption, setCaption] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [assetType, setAssetType] = useState<AssetType>(initialType);
  const [sourceUrl, setSourceUrl] = useState("");
  const [urlCheck, setUrlCheck] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | {
        state: "ok";
        embeddable: boolean;
        reason: string | null;
        status: number;
        widgetOnDomain: boolean;
        detectedOrigins: string[];
      }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [zoneActive, setZoneActive] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const { confirm: confirmDialog } = useConfirm();
  const hydratedRef = useRef(false);

  // Cargar draft al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(brandId));
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (
          d.caption ||
          (d.images && d.images.length > 0) ||
          (d.sourceUrl && d.sourceUrl.length > 0)
        ) {
          setCaption(d.caption ?? "");
          setPlatform(d.platform ?? "instagram");
          if (d.assetType) setAssetType(d.assetType);
          setImages(d.images ?? []);
          if (d.meta) setMeta(d.meta);
          setSourceUrl(d.sourceUrl ?? "");
          setDraftRestored(true);
          setDraftSavedAt(d.savedAt ? new Date(d.savedAt) : null);
        }
      }
    } catch {}
    hydratedRef.current = true;
  }, [brandId]);

  // Auto-save (debounced)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(() => {
      try {
        if (!caption && images.length === 0 && !sourceUrl.trim()) {
          localStorage.removeItem(DRAFT_KEY(brandId));
          setDraftSavedAt(null);
          return;
        }
        const now = new Date();
        const payload: Draft = {
          caption,
          platform,
          assetType,
          images,
          meta,
          sourceUrl: sourceUrl || undefined,
          savedAt: now.toISOString(),
        };
        localStorage.setItem(DRAFT_KEY(brandId), JSON.stringify(payload));
        setDraftSavedAt(now);
      } catch {}
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [brandId, caption, platform, assetType, images, meta, sourceUrl]);

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY(brandId));
    } catch {}
    setDraftSavedAt(null);
    setDraftRestored(false);
  }

  async function discardDraft() {
    const ok = await confirmDialog({
      title: "¿Descartar el borrador?",
      description: "Vas a empezar de cero. No se puede deshacer.",
      confirmLabel: "Descartar",
      cancelLabel: "Mantener",
      variant: "danger",
    });
    if (!ok) return;
    setCaption("");
    setPlatform("instagram");
    setAssetType("social_post");
    setImages([]);
    setMeta({});
    setSourceUrl("");
    clearDraft();
  }

  async function uploadFiles(filesIn: FileList | File[]) {
    const arr = Array.from(filesIn);
    if (arr.length === 0) return;
    setUploading(true);
    setError(null);
    const uploaded: string[] = [];
    const newMeta: Record<string, { mime: string; name: string }> = {};
    for (const file of arr) {
      // Para social_post limitamos a imágenes; para el resto, cualquier archivo
      if (assetType === "social_post" && !file.type.startsWith("image/")) continue;
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setError("No se pudo subir alguno de los archivos");
        continue;
      }
      const j = await res.json();
      uploaded.push(j.url);
      newMeta[j.url] = {
        mime: j.mime ?? file.type ?? "application/octet-stream",
        name: j.name ?? file.name,
      };
    }
    setImages((cur) => [...cur, ...uploaded]);
    setMeta((cur) => ({ ...cur, ...newMeta }));
    setUploading(false);
  }

  function removeImage(idx: number) {
    setImages((arr) => arr.filter((_, i) => i !== idx));
  }

  function moveImage(from: number, to: number) {
    setImages((arr) => {
      const next = [...arr];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }

  function isValidHttpUrl(s: string): boolean {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function submit(sendForReview: boolean) {
    const form = formRef.current;
    if (!form) return;
    setError(null);
    const trimmedUrl = sourceUrl.trim();
    if (assetType === "web_design" || assetType === "video") {
      if (trimmedUrl && !isValidHttpUrl(trimmedUrl)) {
        setError("La URL debe empezar con http:// o https://");
        return;
      }
      if (sendForReview && assetType === "web_design") {
        if (!trimmedUrl) {
          setError("Agregá la URL del sitio para enviar a revisión.");
          return;
        }
        if (urlCheck.state !== "ok") {
          setError(
            "Tocá 'Comprobar' al lado de la URL antes de enviar a revisión.",
          );
          return;
        }
        if (!urlCheck.widgetOnDomain) {
          setError(
            "El widget no está corriendo en este dominio. Instalá el script en el sitio y volvé a comprobar.",
          );
          return;
        }
      }
    }
    setLoading(true);
    const fd = new FormData(form);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId,
        caption: fd.get("caption"),
        platform: fd.get("platform"),
        postType: fd.get("postType"),
        assetType,
        sourceUrl: sourceUrl.trim() || null,
        scheduledAt: fd.get("scheduledAt") || null,
        // Mandamos los archivos con metadata para guardar mime/name en server
        images: images.map((url) => ({
          url,
          mime: meta[url]?.mime ?? null,
          name: meta[url]?.name ?? null,
        })),
        status: sendForReview ? "in_review" : "draft",
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    clearDraft();
    // Volvemos al tab del tipo correspondiente para que el usuario vea su nuevo item
    const target =
      assetType === "social_post"
        ? `/brands/${brandId}`
        : `/brands/${brandId}?type=${assetType}`;
    router.push(target);
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-5"
    >
      {draftRestored && (
        <div className="flex items-center gap-2.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-[12px] text-fuchsia-900">
          <RotateCcw className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">
            Recuperamos un borrador anterior
            {draftSavedAt && (
              <span className="ml-1 text-fuchsia-700/70">
                ({draftSavedAt.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})
              </span>
            )}
            .
          </span>
          <button
            type="button"
            onClick={discardDraft}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-fuchsia-700 hover:bg-fuchsia-100"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => setDraftRestored(false)}
            className="grid h-6 w-6 place-items-center rounded-md text-fuchsia-600 hover:bg-fuchsia-100"
            aria-label="Cerrar"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Tipo de entregable */}
      <div>
        <label className="block text-[13px] font-medium text-zinc-700">
          Tipo de entregable
          <span className="ml-1.5 text-[11px] font-normal text-zinc-400">
            qué se le va a presentar al cliente
          </span>
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ASSET_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAssetType(t)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                assetType === t
                  ? "bg-zinc-900 text-white"
                  : "btn-secondary text-zinc-700"
              }`}
            >
              {ASSET_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Gate: web_design requiere widget INSTALADO (al menos 1 ping detectado) */}
      {assetType === "web_design" && !widgetActive && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-amber-900">
            ⚠️ {widgetHasToken
              ? "Aún no detectamos el widget en ningún sitio"
              : "Activá el widget primero"}
          </p>
          <p className="mt-1 text-[12px] text-amber-800">
            {widgetHasToken ? (
              <>
                Tenés el token generado, pero el script todavía no pingueó desde ningún dominio.
                Pegá <span className="font-mono">&lt;script src=&quot;…/widget.js?token=…&quot;&gt;</span> en
                el sitio del cliente y abrí una página. En cuanto detectemos la primera carga,
                vas a poder crear el entregable web.
              </>
            ) : (
              <>
                Para crear un entregable web necesitás tener el widget de feedback instalado en el
                sitio del cliente. Así puede dejar comentarios in-context con captura pixel-perfect,
                en cualquier dominio donde pegues el script.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/brands/${brandId}/settings/widget`}
              className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
            >
              {widgetHasToken ? "Ver instrucciones de instalación →" : "Configurar widget →"}
            </a>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Volver a comprobar
            </button>
          </div>
          <p className="mt-2 text-[11px] text-amber-700">
            Tip: igual podés escribir la URL abajo y tocar <strong>Comprobar</strong> ahí — eso valida
            la URL específica.
          </p>
        </div>
      )}

      {/* Aviso multi-dominio + sugerencias de orígenes detectados */}
      {assetType === "web_design" && widgetActive && widgetOrigins.length > 0 && (
        <div className="rounded-lg bg-violet-50 px-3 py-2 ring-1 ring-violet-100">
          <p className="text-[11px] font-semibold text-violet-900">
            Dominios donde detectamos el widget activo:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {widgetOrigins.slice(0, 6).map((origin) => (
              <button
                key={origin}
                type="button"
                onClick={() => setSourceUrl(origin)}
                className="rounded-full bg-white px-2 py-0.5 font-mono text-[10.5px] text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100"
              >
                {origin}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* URL externa (web_design / video) — se muestra siempre, la validación es por botón */}
      {(assetType === "web_design" || assetType === "video") && (
        <div>
          <label className="block text-[13px] font-medium text-zinc-700">
            {assetType === "web_design" ? "URL del sitio" : "URL del video"}
            {assetType === "web_design" && (
              <span className="ml-1.5 text-[11px] font-normal text-rose-600">
                requerido
              </span>
            )}
            <span className="ml-1.5 text-[11px] font-normal text-zinc-400">
              {assetType === "web_design"
                ? "el cliente lo verá embebido y podrá comentar sobre él"
                : "YouTube, Vimeo, Loom o link directo a un mp4"}
            </span>
          </label>
          <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
                setUrlCheck({ state: "idle" });
              }}
              placeholder={
                assetType === "web_design"
                  ? "https://landing.tucliente.com"
                  : "https://www.youtube.com/watch?v=…"
              }
              className="flex-1 rounded-lg input-soft px-3 py-2 text-[13px]"
            />
            {assetType === "web_design" && (
              <button
                type="button"
                onClick={async () => {
                  const u = sourceUrl.trim();
                  if (!u || !isValidHttpUrl(u)) {
                    setUrlCheck({
                      state: "error",
                      message: "Ingresá una URL válida (http:// o https://)",
                    });
                    return;
                  }
                  let urlOrigin = "";
                  try {
                    urlOrigin = new URL(u).origin.toLowerCase();
                  } catch {
                    setUrlCheck({ state: "error", message: "URL inválida" });
                    return;
                  }
                  setUrlCheck({ state: "loading" });
                  try {
                    const [probeRes, pingsRes] = await Promise.all([
                      fetch(`/api/probe-iframe?url=${encodeURIComponent(u)}`),
                      fetch(`/api/brands/${brandId}/widget-pings`),
                    ]);
                    const probe = await probeRes.json();
                    if (!probeRes.ok) {
                      setUrlCheck({
                        state: "error",
                        message: probe.error ?? "No se pudo comprobar",
                      });
                      return;
                    }
                    const pingsJson = pingsRes.ok ? await pingsRes.json() : { pings: [] };
                    const detectedOrigins: string[] = (pingsJson.pings ?? []).map(
                      (p: { origin: string }) => (p.origin || "").toLowerCase(),
                    );
                    const widgetOnDomain = detectedOrigins.includes(urlOrigin);
                    setUrlCheck({
                      state: "ok",
                      embeddable: !!probe.embeddable,
                      reason: probe.reason ?? null,
                      status: probe.status ?? 0,
                      widgetOnDomain,
                      detectedOrigins,
                    });
                  } catch (e) {
                    setUrlCheck({
                      state: "error",
                      message: e instanceof Error ? e.message : "Error de red",
                    });
                  }
                }}
                disabled={urlCheck.state === "loading" || !sourceUrl.trim()}
                className="btn-secondary inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-60"
              >
                {urlCheck.state === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Comprobar
              </button>
            )}
          </div>
          {urlCheck.state === "ok" && assetType === "web_design" && (
            <div
              className={`mt-1.5 rounded-md p-2.5 text-[11.5px] ring-1 ${
                urlCheck.widgetOnDomain
                  ? "bg-emerald-50 text-emerald-900 ring-emerald-100"
                  : "bg-rose-50 text-rose-900 ring-rose-100"
              }`}
            >
              {urlCheck.widgetOnDomain ? (
                <>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Widget detectado en este dominio · listo para crear
                  </p>
                  <p className="mt-0.5 text-emerald-800">
                    Sitio responde (status {urlCheck.status}).{" "}
                    {urlCheck.embeddable
                      ? "Se puede previsualizar en vivo dentro de MarketaFlow."
                      : "El sitio bloquea iframe (normal), pero los comentarios del widget van a llegar igual."}
                  </p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    El widget aún no está corriendo en este dominio
                  </p>
                  <p className="mt-1 text-rose-800">
                    El sitio responde (status {urlCheck.status}) pero{" "}
                    <strong>no detectamos pings del widget desde este dominio todavía</strong>. Pegá el
                    snippet del widget en el sitio del cliente, abrí cualquier página al menos una
                    vez, y volvé a comprobar.
                  </p>
                  {urlCheck.detectedOrigins.length > 0 && (
                    <p className="mt-1.5 text-[10.5px] text-rose-700">
                      Dominios donde sí está corriendo:{" "}
                      <span className="font-mono">{urlCheck.detectedOrigins.join(", ")}</span>
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {urlCheck.state === "ok" && assetType === "video" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Sitio responde (status {urlCheck.status}).
            </p>
          )}
          {urlCheck.state === "error" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-rose-700">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              {urlCheck.message}
            </p>
          )}
        </div>
      )}

      {/* Upload zone */}
      <div>
        <label className="block text-[13px] font-medium text-zinc-700">
          {assetType === "social_post"
            ? "Imágenes"
            : assetType === "web_design"
              ? "Mockups o capturas"
              : assetType === "video"
                ? "Archivo de video o thumbnail"
                : "Archivos"}
          <span className="ml-1.5 text-[11px] font-normal text-zinc-400">
            {assetType === "social_post"
              ? "varias para carrusel"
              : assetType === "web_design"
                ? "opcional"
                : assetType === "video"
                  ? "opcional si pegaste URL"
                  : "PDF, ZIP, AI, PSD, lo que necesites"}
          </span>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept={assetType === "social_post" ? "image/*" : undefined}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              uploadFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />

        {images.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setZoneActive(true);
            }}
            onDragLeave={() => setZoneActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setZoneActive(false);
              if (e.dataTransfer.files.length > 0) {
                uploadFiles(e.dataTransfer.files);
              }
            }}
            className={`mt-1.5 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
              zoneActive
                ? "border-fuchsia-400 bg-fuchsia-50"
                : "border-zinc-300 bg-zinc-50/50 hover:border-zinc-400 hover:bg-zinc-50"
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-zinc-200">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              ) : (
                <UploadCloud className="h-5 w-5 text-zinc-500" />
              )}
            </span>
            <div className="space-y-0.5">
              <p className="text-[13px] font-semibold text-zinc-900">
                {uploading ? "Subiendo..." : "Click para subir o arrastra aquí"}
              </p>
              <p className="text-[11px] text-zinc-500">
                {assetType === "social_post"
                  ? "PNG, JPG, WEBP — puedes seleccionar varias"
                  : "Cualquier formato hasta 25MB · podés seleccionar varios"}
              </p>
            </div>
          </button>
        ) : (
          <div
            className="mt-1.5 space-y-2 rounded-lg border divider bg-zinc-50/50 p-3"
            onDragOver={(e) => {
              if (dragIdx !== null) return; // dejando que el reordenamiento se ocupe
              e.preventDefault();
              setZoneActive(true);
            }}
            onDragLeave={() => setZoneActive(false)}
            onDrop={(e) => {
              if (dragIdx !== null) return;
              e.preventDefault();
              setZoneActive(false);
              if (e.dataTransfer.files.length > 0) {
                uploadFiles(e.dataTransfer.files);
              }
            }}
          >
            <div className="flex flex-wrap gap-2">
              {images.map((url, idx) => (
                <div
                  key={url + idx}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => {
                    if (dragIdx === null || dragIdx === idx) return;
                    e.preventDefault();
                  }}
                  onDrop={() => {
                    if (dragIdx !== null && dragIdx !== idx) moveImage(dragIdx, idx);
                    setDragIdx(null);
                  }}
                  onDragEnd={() => setDragIdx(null)}
                  className={`group relative h-20 w-20 cursor-grab overflow-hidden rounded-md ring-1 ring-zinc-200 bg-white transition active:cursor-grabbing ${
                    dragIdx === idx ? "opacity-40" : "hover:ring-fuchsia-400"
                  }`}
                  title={meta[url]?.name ?? url}
                >
                  {(meta[url]?.mime ?? "image/").startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1.5 text-center">
                      <FileIcon className="h-5 w-5 text-zinc-500" />
                      <span className="line-clamp-2 text-[9px] font-medium text-zinc-700">
                        {meta[url]?.name?.split(".").slice(-1)[0]?.toUpperCase() ?? "FILE"}
                      </span>
                    </div>
                  )}
                  {idx === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-zinc-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      {assetType === "social_post" ? "Portada" : "1°"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-zinc-900/85 text-[11px] font-bold text-white group-hover:flex"
                    aria-label="Quitar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* Add more tile */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="grid h-20 w-20 place-items-center rounded-md border-2 border-dashed border-zinc-300 bg-white text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600"
                aria-label="Agregar más"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Arrastra para reordenar · La primera será la portada · {images.length} imagen
              {images.length === 1 ? "" : "es"}
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="block text-[13px] font-medium text-zinc-700">
          {ASSET_TYPE_CAPTION_LABEL[assetType]}
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {assetType === "social_post" && (
            <>
              <CaptionAssist
                brandId={brandId}
                images={images}
                currentCaption={caption}
                platform={platform}
                onPick={(text) => setCaption(text)}
              />
              <HashtagPicker
                brandId={brandId}
                onPick={(tags) =>
                  setCaption((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${tags}` : tags))
                }
              />
              <TemplatePicker
                brandId={brandId}
                onApply={(t) => {
                  setCaption(t.caption);
                  setPlatform(t.platform);
                }}
              />
            </>
          )}
        </div>
        <textarea
          name="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-lg input-soft px-3 py-2 text-[13px]"
          placeholder={ASSET_TYPE_CAPTION_PLACEHOLDER[assetType]}
        />
      </div>

      {assetType === "social_post" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-medium text-zinc-700">Plataforma</label>
            <select
              name="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1.5 w-full rounded-lg input-soft px-3 py-2 text-[13px]"
            >
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-zinc-700">Formato</label>
            <select
              name="postType"
              defaultValue="feed"
              className="mt-1.5 w-full rounded-lg input-soft px-3 py-2 text-[13px]"
            >
              <option value="feed">Feed</option>
              <option value="reel">Reel</option>
              <option value="story">Story</option>
            </select>
          </div>
        </div>
      )}
      {/* Hidden inputs para que el form siempre envíe estos campos cuando assetType !== social_post */}
      {assetType !== "social_post" && (
        <>
          <input type="hidden" name="platform" value={platform} />
          <input type="hidden" name="postType" value="feed" />
        </>
      )}

      <div>
        <label className="block text-[13px] font-medium text-zinc-700">Fecha programada</label>
        <input
          name="scheduledAt"
          type="datetime-local"
          className="mt-1.5 w-full rounded-lg input-soft px-3 py-2 text-[13px]"
        />
      </div>

      {error && <p className="text-[12px] text-rose-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        {draftSavedAt && (
          <span className="mr-auto text-[10.5px] text-zinc-400">
            Borrador guardado · {draftSavedAt.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <button
          type="submit"
          disabled={loading}
          className="btn-secondary rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
        >
          Guardar borrador
        </button>
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={(() => {
            if (loading) return true;
            const hasUrl = sourceUrl.trim().length > 0;
            const hasFiles = images.length > 0;
            // web_design / video: alcanza con URL O archivos
            if (assetType === "web_design" || assetType === "video") {
              return !hasUrl && !hasFiles;
            }
            // social_post / graphic / branding / other: requiere archivos
            return !hasFiles;
          })()}
          className="btn-gradient rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
        >
          Enviar a revisión
        </button>
      </div>
    </form>
  );
}
