"use client";

/**
 * Enlaces de la tarea (en el drawer): links a Drive, WeTransfer, OneDrive,
 * Dropbox, etc. donde viven los archivos (brief, diseños…). A propósito NO
 * se suben archivos a nuestro storage — el cliente mantiene sus archivos en
 * su nube y nosotros no gastamos espacio. Se registran en
 * /api/tasks/[id]/attachments (solo URL + nombre).
 */
import { useEffect, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";

type Attachment = {
  id: string;
  url: string;
  name: string | null;
  mime: string | null;
  createdAt: string;
};

/** Etiqueta amigable según el host del enlace (Drive, WeTransfer, etc.). */
function providerOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("drive.google") || host.includes("docs.google")) return "Google Drive";
    if (host.includes("wetransfer") || host.includes("we.tl")) return "WeTransfer";
    if (host.includes("1drv.ms") || host.includes("onedrive")) return "OneDrive";
    if (host.includes("dropbox")) return "Dropbox";
    if (host.includes("notion")) return "Notion";
    if (host.includes("figma")) return "Figma";
    if (host.includes("canva")) return "Canva";
    return host;
  } catch {
    return "enlace";
  }
}

export function TaskAttachments({
  taskId,
  canWrite,
}: {
  taskId: string;
  canWrite: boolean;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    let clean = url.trim();
    if (!clean) return;
    // Auto-prefijar https:// si pegaron el link sin protocolo.
    if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
    try {
      new URL(clean);
    } catch {
      toast.error("Ese enlace no parece válido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: clean, name: name.trim() || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo agregar", { description: j.error });
        return;
      }
      const j = await res.json();
      setItems((prev) => [j.attachment, ...prev]);
      setUrl("");
      setName("");
      setAdding(false);
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
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
          <Link2 className="h-3.5 w-3.5" />
          Enlaces
          {items.length > 0 && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-3xs font-bold tabular-nums text-zinc-600">
              {items.length}
            </span>
          )}
        </h3>
        {canWrite && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
          >
            <Plus className="h-3 w-3" />
            Agregar enlace
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className="mb-3 space-y-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Pega el enlace (Drive, WeTransfer, OneDrive…)"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (opcional, ej. Brief del cliente)"
              maxLength={200}
              className="flex-1"
            />
            <Button type="submit" size="sm" loading={saving}>
              Agregar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setUrl("");
                setName("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li
              key={a.id}
              className="group flex items-center gap-2 rounded-control border divider bg-white px-2.5 py-1.5"
            >
              <Link2 className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:underline"
                title={a.url}
              >
                {a.name || providerOf(a.url)}
              </a>
              <span className="hidden flex-shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-3xs font-semibold text-zinc-500 sm:inline">
                {providerOf(a.url)}
              </span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="grid h-5 w-5 flex-shrink-0 place-items-center rounded text-zinc-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                  aria-label="Quitar enlace"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
