"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { RotateCcw, Trash2, ImageOff } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

export default function TrashRow({
  post,
}: {
  post: {
    id: string;
    imageUrl: string | null;
    caption: string;
    status: string;
    statusLabel: string;
    statusColor: string;
    deletedAtFormatted: string;
  };
}) {
  const router = useRouter();
  const params = useParams<{ brandId: string }>();
  const brandId = params?.brandId;
  const [busy, setBusy] = useState(false);
  const { confirm: confirmDialog } = useConfirm();

  async function restore() {
    setBusy(true);
    await fetch(`/api/posts/${post.id}/restore`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function purge() {
    const ok = await confirmDialog({
      title: "¿Eliminar definitivamente?",
      description: "No se puede deshacer. Imágenes y comentarios se borran para siempre.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/posts/${post.id}/purge`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <li className="group flex items-center gap-3 p-3 transition hover:bg-zinc-50">
      <Link
        href={brandId ? `/brands/${brandId}/posts/${post.id}` : "#"}
        className="flex flex-1 items-center gap-3"
      >
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt=""
            className="h-12 w-12 flex-shrink-0 rounded-md object-cover opacity-70"
          />
        ) : (
          <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 opacity-70">
            <ImageOff className="h-4 w-4 text-zinc-400" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${post.statusColor}`}
            >
              {post.statusLabel}
            </span>
            <span className="text-[10px] text-zinc-400">
              borrado {post.deletedAtFormatted}
            </span>
          </div>
          <p className="mt-1 truncate text-[12px] text-zinc-700">
            {post.caption || <span className="text-zinc-400">Sin caption</span>}
          </p>
        </div>
      </Link>
      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          onClick={restore}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-white hover:shadow-sm disabled:opacity-50"
          title="Restaurar"
        >
          <RotateCcw className="h-3 w-3" />
          Restaurar
        </button>
        <button
          onClick={purge}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          title="Borrar definitivo"
        >
          <Trash2 className="h-3 w-3" />
          Borrar
        </button>
      </div>
    </li>
  );
}
