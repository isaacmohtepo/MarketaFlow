"use client";

import { Paperclip } from "lucide-react";

/**
 * Render del attachment ya guardado de un comentario:
 * - Imagen → thumbnail clickable que abre fullsize en pestaña nueva.
 * - Otro tipo → chip con paperclip + nombre.
 */
export default function CommentAttachmentInline({
  url,
  name,
  mime,
  size = "md",
}: {
  url: string | null | undefined;
  name?: string | null;
  mime?: string | null;
  size?: "sm" | "md";
}) {
  if (!url) return null;
  const isImage = (mime ?? "").startsWith("image/");
  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={name ?? "Ver imagen completa"}
        className="mt-1.5 block overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 transition hover:border-zinc-300 hover:shadow-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name ?? ""}
          className={`block w-full object-contain ${size === "sm" ? "max-h-40" : "max-h-72"}`}
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100"
    >
      <Paperclip className="h-3 w-3" />
      <span className="truncate">{name ?? "Adjunto"}</span>
    </a>
  );
}
