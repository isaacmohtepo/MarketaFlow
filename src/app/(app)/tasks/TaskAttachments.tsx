"use client";

/**
 * Zona de VÍNCULOS de la tarea (en el drawer), arriba del todo: deja claro
 * "de dónde viene / qué está vinculado a esta tarea" en un solo bloque.
 * Reúne dos cosas con el mismo lenguaje visual de tarjeta:
 *
 *  1. El POST de origen (si la tarea nació de un post) — banner destacado
 *     con miniatura. Read-only: el vínculo se gestiona desde el post.
 *  2. ENLACES externos (Drive, WeTransfer, OneDrive, Figma, sitio en vivo…)
 *     donde viven los archivos/contexto. A propósito NO subimos archivos a
 *     nuestro storage — el cliente mantiene los suyos en su nube. Se
 *     registran en /api/tasks/[id]/attachments (solo URL + nombre).
 */
import { useEffect, useState } from "react";
import { Link2, Plus, X, Image as ImageIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";
import { assetTypeLabel } from "@/lib/asset-types";

type Attachment = {
  id: string;
  url: string;
  name: string | null;
  mime: string | null;
  createdAt: string;
};

type LinkedPost = {
  id: string;
  title: string | null;
  caption: string;
  imageUrl: string | null;
  assetType: string;
  platform: string;
  postType: string;
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
  post,
  brandId,
}: {
  taskId: string;
  canWrite: boolean;
  /** Post de origen (si la tarea nació de uno). */
  post?: LinkedPost | null;
  brandId?: string | null;
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

  const hasPost = !!(post && brandId);
  const total = items.length + (hasPost ? 1 : 0);

  // Sin nada que mostrar y sin permiso de edición → no renderizar la zona.
  if (total === 0 && !canWrite) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Link2 className="h-3.5 w-3.5" />
          Vínculos
          {total > 0 && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-3xs font-bold tabular-nums text-zinc-600">
              {total}
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

      <div className="space-y-2">
        {/* Post de origen — banner destacado con miniatura. */}
        {hasPost && (
          <a
            href={`/brands/${brandId}/posts/${post!.id}`}
            className="group flex items-center gap-3 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50/50 p-2.5 pr-3 transition hover:border-violet-300 hover:shadow-sm"
            title="Abrir el post vinculado"
          >
            <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-violet-100 ring-1 ring-violet-200">
              {post!.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post!.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5 text-violet-500" />
              )}
              <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-violet-600 ring-2 ring-white">
                <Link2 className="h-2.5 w-2.5 text-white" />
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-3xs font-bold uppercase tracking-wider text-violet-500">
                Origen · {assetTypeLabel(post!.assetType)}
              </span>
              <span className="truncate text-sm font-semibold text-zinc-800 group-hover:text-violet-700">
                {post!.title?.trim() ||
                  post!.caption?.trim().slice(0, 70) ||
                  "Post sin título"}
              </span>
              {post!.assetType === "social_post" && (
                <span className="truncate text-2xs text-zinc-400">
                  {post!.platform} · {post!.postType}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-2xs font-bold text-violet-600 ring-1 ring-violet-200 transition group-hover:bg-violet-600 group-hover:text-white group-hover:ring-violet-600">
              Ver
              <ExternalLink className="h-3 w-3" />
            </span>
          </a>
        )}

        {/* Formulario de nuevo enlace. */}
        {adding && (
          <form onSubmit={add} className="space-y-2 rounded-xl border divider bg-zinc-50/60 p-2.5">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Pega el enlace (Drive, WeTransfer, Figma, sitio…)"
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

        {/* Enlaces externos — tarjetas con el mismo lenguaje del banner. */}
        {items.map((a) => (
          <div
            key={a.id}
            className="group flex items-center gap-3 rounded-xl border divider bg-white p-2.5 pr-3 transition hover:border-zinc-300 hover:shadow-sm"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200">
              <Link2 className="h-4 w-4" />
            </span>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 flex-col"
              title={a.url}
            >
              <span className="text-3xs font-bold uppercase tracking-wider text-zinc-400">
                {providerOf(a.url)}
              </span>
              <span className="truncate text-sm font-semibold text-zinc-700 group-hover:text-zinc-900 group-hover:underline">
                {a.name || a.url.replace(/^https?:\/\//, "")}
              </span>
            </a>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-2xs font-bold text-zinc-500 ring-1 ring-zinc-200 transition hover:bg-zinc-900 hover:text-white hover:ring-zinc-900"
            >
              Abrir
              <ExternalLink className="h-3 w-3" />
            </a>
            {canWrite && (
              <button
                type="button"
                onClick={() => remove(a.id)}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-zinc-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                aria-label="Quitar enlace"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
