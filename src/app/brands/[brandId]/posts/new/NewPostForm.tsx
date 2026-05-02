"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, Loader2, ImagePlus } from "lucide-react";
import CaptionAssist from "./CaptionAssist";
import HashtagPicker from "./HashtagPicker";

export default function NewPostForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [zoneActive, setZoneActive] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    setError(null);
    const uploaded: string[] = [];
    for (const file of arr) {
      if (!file.type.startsWith("image/")) continue;
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setError("No se pudo subir alguna imagen");
        continue;
      }
      const j = await res.json();
      uploaded.push(j.url);
    }
    setImages((cur) => [...cur, ...uploaded]);
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

  async function submit(sendForReview: boolean) {
    const form = formRef.current;
    if (!form) return;
    setLoading(true);
    setError(null);
    const fd = new FormData(form);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId,
        caption: fd.get("caption"),
        platform: fd.get("platform"),
        postType: fd.get("postType"),
        scheduledAt: fd.get("scheduledAt") || null,
        images,
        status: sendForReview ? "in_review" : "draft",
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    router.push(`/brands/${brandId}`);
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
      {/* Upload zone */}
      <div>
        <label className="block text-[13px] font-medium text-zinc-700">
          Imágenes
          <span className="ml-1.5 text-[11px] font-normal text-zinc-400">
            varias para carrusel
          </span>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
                PNG, JPG, WEBP — puedes seleccionar varias
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
                  className={`group relative h-20 w-20 cursor-grab overflow-hidden rounded-md ring-1 ring-zinc-200 transition active:cursor-grabbing ${
                    dragIdx === idx ? "opacity-40" : "hover:ring-fuchsia-400"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                  {idx === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-zinc-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      Portada
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
        <label className="block text-[13px] font-medium text-zinc-700">Caption</label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
        </div>
        <textarea
          name="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-lg input-soft px-3 py-2 text-[13px]"
          placeholder="Escribe el copy aquí..."
        />
      </div>

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
          <label className="block text-[13px] font-medium text-zinc-700">Tipo</label>
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

      <div>
        <label className="block text-[13px] font-medium text-zinc-700">Fecha programada</label>
        <input
          name="scheduledAt"
          type="datetime-local"
          className="mt-1.5 w-full rounded-lg input-soft px-3 py-2 text-[13px]"
        />
      </div>

      {error && <p className="text-[12px] text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
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
          disabled={loading || images.length === 0}
          className="btn-gradient rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
        >
          Enviar a revisión
        </button>
      </div>
    </form>
  );
}
