"use client";

import { Paperclip, X } from "lucide-react";

export type Attach = { url: string; name: string; mime: string };

/**
 * Chip que muestra el attachment subido en un composer (draft / reply input).
 * Thumb si es imagen, ícono si es otro tipo. Botón X para quitar.
 */
export default function AttachmentPreview({
  attachment,
  onRemove,
  size = "md",
}: {
  attachment: Attach;
  onRemove: () => void;
  size?: "sm" | "md";
}) {
  const isImage = attachment.mime.startsWith("image/");
  const thumbSize = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const textSize = size === "sm" ? "text-[10.5px]" : "text-[11px]";
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-1.5">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.url}
          alt=""
          className={`flex-shrink-0 rounded object-cover ${thumbSize}`}
        />
      ) : (
        <Paperclip className="h-4 w-4 text-zinc-500" />
      )}
      <span className={`min-w-0 flex-1 truncate text-zinc-700 ${textSize}`}>
        {attachment.name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="grid h-5 w-5 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
        aria-label="Quitar adjunto"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
