"use client";

/**
 * Adjuntos de la tarea (en el drawer): subir archivos (brief, diseño, etc.) y
 * listarlos. El archivo va a R2 vía /api/upload y se registra en
 * /api/tasks/[id]/attachments.
 */
import { useEffect, useRef, useState } from "react";
import { Paperclip, X, Loader2, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

type Attachment = {
  id: string;
  url: string;
  name: string | null;
  mime: string | null;
  createdAt: string;
};

export function TaskAttachments({
  taskId,
  canWrite,
}: {
  taskId: string;
  canWrite: boolean;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/tasks/${taskId}/attachments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.attachments) setItems(j.attachments);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [taskId]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      if (!up.ok) {
        const j = await up.json().catch(() => ({}));
        toast.error("No se pudo subir", { description: j.error });
        return;
      }
      const { url, name, mime } = await up.json();
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name, mime }),
      });
      if (!res.ok) {
        toast.error("No se pudo adjuntar");
        return;
      }
      const j = await res.json();
      setItems((prev) => [j.attachment, ...prev]);
    } catch {
      toast.error("Error de red");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/tasks/${taskId}/attachments?attachmentId=${id}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  if (items.length === 0 && !canWrite) return null;

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Paperclip className="h-3.5 w-3.5" />
          Adjuntos
          {items.length > 0 && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-3xs font-bold tabular-nums text-zinc-600">
              {items.length}
            </span>
          )}
        </h3>
        {canWrite && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={onPick}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Paperclip className="h-3 w-3" />
              )}
              Adjuntar
            </button>
          </>
        )}
      </div>
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((a) => {
            const isImage = a.mime?.startsWith("image/");
            return (
              <li
                key={a.id}
                className="group flex items-center gap-2 rounded-control border divider bg-white px-2.5 py-1.5"
              >
                {isImage ? (
                  <ImageIcon className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
                ) : (
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                )}
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:underline"
                >
                  {a.name ?? a.url.split("/").pop()}
                </a>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="grid h-5 w-5 flex-shrink-0 place-items-center rounded text-zinc-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                    aria-label="Quitar adjunto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
