"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, Loader2, ImagePlus, Pencil } from "lucide-react";

export default function NewVersionModal({
  postId,
  onClose,
  canEditCaption = true,
}: {
  postId: string;
  onClose: () => void;
  canEditCaption?: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [editCaption, setEditCaption] = useState(false);
  const [caption, setCaption] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoneActive, setZoneActive] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

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

  async function submit() {
    if (images.length === 0) {
      setError("Sube al menos una imagen");
      return;
    }
    setLoading(true);
    setError(null);
    const payload: { images: string[]; caption?: string; note?: string } = {
      images,
    };
    if (editCaption) payload.caption = caption;
    if (note.trim()) payload.note = note.trim();

    const res = await fetch(`/api/posts/${postId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Nueva versión</h2>
            <p className="text-[12px] text-zinc-500">
              Sube la imagen corregida. El cliente recibirá una notificación.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mt-4">
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
                if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
              }}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
                zoneActive
                  ? "border-fuchsia-400 bg-fuchsia-50"
                  : "border-zinc-300 bg-zinc-50/50 hover:border-zinc-400"
              }`}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-zinc-200">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                ) : (
                  <UploadCloud className="h-4 w-4 text-zinc-500" />
                )}
              </span>
              <p className="text-[13px] font-semibold text-zinc-900">
                {uploading ? "Subiendo..." : "Click o arrastra las imágenes corregidas"}
              </p>
            </button>
          ) : (
            <div className="flex flex-wrap gap-2 rounded-lg border divider bg-zinc-50/50 p-3">
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
                  <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
                  {idx === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-zinc-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      Portada
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-zinc-900/85 text-2xs font-bold text-white group-hover:flex"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="grid h-20 w-20 place-items-center rounded-md border-2 border-dashed border-zinc-300 bg-white text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4">
          {!canEditCaption ? null : editCaption ? (
            <>
              <div className="flex items-center justify-between">
                <label className="block text-[12px] font-medium text-zinc-700">
                  Caption nuevo
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setEditCaption(false);
                    setCaption("");
                  }}
                  className="text-2xs font-medium text-zinc-500 hover:text-zinc-900"
                >
                  Conservar el actual
                </button>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                placeholder="Escribe el nuevo caption..."
                autoFocus
                className="mt-1 w-full rounded-md input-soft px-3 py-2 text-[13px]"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditCaption(true)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 hover:text-fuchsia-700"
            >
              <Pencil className="h-3 w-3" />
              Editar caption (opcional)
            </button>
          )}
        </div>

        <div className="mt-3">
          <label className="block text-[12px] font-medium text-zinc-700">
            ¿Qué cambió? <span className="font-normal text-zinc-400">(opcional)</span>
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: Corregí el ojo y cambié la gorra"
            className="mt-1 w-full rounded-md input-soft px-3 py-2 text-[13px]"
          />
        </div>

        {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-zinc-600 hover:text-zinc-900"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={loading || images.length === 0}
            className="btn-gradient rounded-md px-4 py-1.5 text-[13px] font-semibold disabled:opacity-60"
          >
            {loading ? "Subiendo..." : "Subir nueva versión"}
          </button>
        </div>
      </div>
    </div>
  );
}
