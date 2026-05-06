"use client";

import { Pencil, Trash2 } from "lucide-react";
import MentionText from "@/components/MentionText";
import EditInline from "./EditInline";
import CommentAttachmentInline from "./CommentAttachmentInline";

type Reply = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  userName: string;
  userId: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
};

/** Tiempo relativo corto (mismo helper que en WebDesignBoard, duplicado para
 * evitar imports cruzados; "ahora" / "5 min" / "2 h" / "3 d" / fecha si > 1 sem). */
function relTimeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Render de un reply anidado dentro de un thread. Diseñado para alinearse con
 * el avatar del parent (mismo tamaño 7×7, mismo gap 2.5) para que el timeline
 * rail vertical conecte visualmente todas las burbujas del thread.
 *
 * Las acciones (Editar / Eliminar) aparecen on-hover y solo si es el autor.
 */
export default function ReplyItem({
  reply,
  currentUserId,
  brandId,
  editing,
  editBody,
  onEditBodyChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  busy,
  gradientForName,
}: {
  reply: Reply;
  currentUserId: string;
  brandId: string;
  editing: boolean;
  editBody: string;
  onEditBodyChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  busy: boolean;
  gradientForName: (name: string) => string;
}) {
  const isOwn = reply.userId === currentUserId;
  return (
    <li className="group/reply relative flex items-start gap-2.5">
      <span
        className={`relative z-[1] grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold text-white shadow-sm bg-gradient-to-br ${gradientForName(
          reply.userName,
        )}`}
      >
        {reply.userName[0]?.toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[12px] font-semibold text-zinc-800">
            {reply.userName}
          </span>
          <span className="text-[10px] text-zinc-400">{relTimeShort(reply.createdAt)}</span>
          {reply.updatedAt && reply.updatedAt !== reply.createdAt && (
            <span className="text-[9.5px] italic text-zinc-400">editado</span>
          )}
        </div>
        {editing ? (
          <div className="mt-1">
            <EditInline
              brandId={brandId}
              value={editBody}
              onChange={onEditBodyChange}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
              busy={busy}
              rows={2}
              variant="compact"
            />
          </div>
        ) : (
          <>
            <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-snug text-zinc-700">
              <MentionText text={reply.body} />
            </p>
            <CommentAttachmentInline
              url={reply.attachmentUrl}
              name={reply.attachmentName}
              mime={reply.attachmentMime}
              size="sm"
            />
          </>
        )}
      </div>
      {isOwn && !editing && (
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover/reply:opacity-100">
          <button
            type="button"
            onClick={onStartEdit}
            title="Editar"
            className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Eliminar"
            className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </li>
  );
}
