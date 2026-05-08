"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, Loader2, Check, AlertCircle, ImagePlus } from "lucide-react";

type Item = {
  id: string;
  file: File;
  url?: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

const MAX_FILES = 50;

export default function BulkUploadModal({
  brandId,
  onClose,
}: {
  brandId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [zoneActive, setZoneActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setItems((cur) => {
      const space = MAX_FILES - cur.length;
      const toAdd = arr.slice(0, Math.max(0, space)).map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: "pending" as const,
      }));
      if (cur.length + arr.length > MAX_FILES) {
        setError(`Máximo ${MAX_FILES} archivos por subida`);
      }
      return [...cur, ...toAdd];
    });
  }

  function removeItem(id: string) {
    setItems((cur) => cur.filter((i) => i.id !== id));
  }

  async function uploadAll() {
    setUploading(true);
    setError(null);
    // Subir en paralelo de a 3 para no saturar
    const queue = [...items.filter((i) => i.status === "pending")];
    const concurrency = 3;
    async function worker() {
      while (queue.length > 0) {
        const it = queue.shift();
        if (!it) return;
        setItems((cur) =>
          cur.map((c) => (c.id === it.id ? { ...c, status: "uploading" } : c)),
        );
        try {
          const fd = new FormData();
          fd.append("file", it.file);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (!res.ok) throw new Error("upload failed");
          const j = await res.json();
          setItems((cur) =>
            cur.map((c) =>
              c.id === it.id ? { ...c, status: "done", url: j.url } : c,
            ),
          );
        } catch {
          setItems((cur) =>
            cur.map((c) =>
              c.id === it.id ? { ...c, status: "error", error: "Falló" } : c,
            ),
          );
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    setUploading(false);
  }

  async function createPosts() {
    setCreating(true);
    setError(null);
    // Asegurarse de subir lo pendiente primero
    if (items.some((i) => i.status === "pending")) {
      await uploadAll();
    }
    const urls = items.filter((i) => i.status === "done" && i.url).map((i) => i.url as string);
    if (urls.length === 0) {
      setCreating(false);
      setError("No hay imágenes subidas");
      return;
    }
    const res = await fetch("/api/posts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, imageUrls: urls }),
    });
    setCreating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Error al crear los borradores");
      return;
    }
    const j = await res.json();
    setCreated(j.count);
    router.refresh();
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const allDone = items.length > 0 && doneCount === items.length;

  if (created !== null) {
    return (
      <Backdrop onClose={onClose}>
        <div className="card w-full max-w-md p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100">
            <Check className="h-5 w-5 text-emerald-600" strokeWidth={3} />
          </div>
          <h2 className="mt-3 text-lg font-bold text-zinc-900">
            {created} borrador{created === 1 ? "" : "es"} creado{created === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-[13px] text-zinc-600">
            Están listos en tu feed como borradores. Puedes editarlos uno por uno o arrastrarlos
            para reordenar.
          </p>
          <button
            onClick={onClose}
            className="btn-gradient mt-5 inline-block rounded-full px-5 py-2 text-[13px] font-semibold"
          >
            Ir al feed
          </button>
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <div className="card flex w-full max-w-2xl flex-col p-5 max-h-[90vh]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Subir varios posts</h2>
            <p className="text-[12px] text-zinc-500">
              Arrastra hasta {MAX_FILES} imágenes. Cada una se vuelve un borrador.
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
            if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {items.length === 0 ? (
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
              if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
            }}
            className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-16 text-center transition ${
              zoneActive
                ? "border-fuchsia-400 bg-fuchsia-50"
                : "border-zinc-300 bg-zinc-50/50 hover:border-zinc-400 hover:bg-zinc-50"
            }`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white ring-1 ring-zinc-200">
              <UploadCloud className="h-5 w-5 text-zinc-500" />
            </span>
            <p className="text-[14px] font-semibold text-zinc-900">
              Click o arrastra varias imágenes aquí
            </p>
            <p className="text-[11px] text-zinc-500">
              PNG, JPG, WEBP — hasta {MAX_FILES} archivos · cada uno será un borrador
            </p>
          </button>
        ) : (
          <div
            className="mt-4 space-y-3"
            onDragOver={(e) => {
              e.preventDefault();
              setZoneActive(true);
            }}
            onDragLeave={() => setZoneActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setZoneActive(false);
              if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[12px]">
                <span className="font-semibold text-zinc-900 tabular-nums">
                  {items.length}{" "}
                  <span className="font-normal text-zinc-500">
                    archivo{items.length === 1 ? "" : "s"}
                  </span>
                </span>
                {doneCount > 0 && (
                  <span className="flex items-center gap-1 text-emerald-700">
                    <Check className="h-3 w-3" /> {doneCount} subidos
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-rose-700">
                    <AlertCircle className="h-3 w-3" /> {errorCount} fallaron
                  </span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md border divider bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <ImagePlus className="h-3 w-3" />
                Agregar más
              </button>
            </div>

            <ul className="scroll-visible max-h-[42vh] space-y-1.5 overflow-y-auto rounded-lg border divider bg-zinc-50/50 p-2">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-2 rounded-md bg-white p-2 text-[12px] ring-1 ring-zinc-100"
                >
                  <ImageThumb file={it.file} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-800">{it.file.name}</p>
                    <p className="text-[10px] text-zinc-500">
                      {(it.file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                      <StatusLabel status={it.status} />
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {it.status === "uploading" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                    )}
                    {it.status === "done" && (
                      <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={3} />
                    )}
                    {it.status === "error" && (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                    )}
                    {it.status !== "uploading" && (
                      <button
                        onClick={() => removeItem(it.id)}
                        className="grid h-5 w-5 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                        aria-label="Quitar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}

        {items.length > 0 && (
          <div className="mt-5 flex items-center justify-end gap-2 border-t divider pt-4">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-zinc-600 hover:text-zinc-900"
            >
              Cancelar
            </button>
            {pendingCount > 0 && !allDone && (
              <button
                onClick={uploadAll}
                disabled={uploading}
                className="btn-secondary rounded-md px-4 py-1.5 text-[13px] font-semibold disabled:opacity-60"
              >
                {uploading ? "Subiendo..." : `Subir ${pendingCount}`}
              </button>
            )}
            <button
              onClick={createPosts}
              disabled={creating || uploading || doneCount === 0}
              className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-semibold disabled:opacity-60"
            >
              {creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  Crear {doneCount > 0 ? doneCount : ""} borrador
                  {doneCount === 1 ? "" : "es"}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl">
        {children}
      </div>
    </div>
  );
}

function StatusLabel({ status }: { status: Item["status"] }) {
  if (status === "pending") return <span className="text-zinc-500">pendiente</span>;
  if (status === "uploading") return <span className="text-fuchsia-600">subiendo</span>;
  if (status === "done") return <span className="text-emerald-700">listo</span>;
  return <span className="text-rose-600">error</span>;
}

function ImageThumb({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setSrc(reader.result as string);
    reader.readAsDataURL(file);
  }, [file]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-9 w-9 flex-shrink-0 rounded object-cover"
    />
  ) : (
    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded bg-zinc-100">
      <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
    </span>
  );
}
