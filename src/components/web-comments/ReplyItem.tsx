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

/**
 * Render de un reply anidado dentro de un thread. Maneja edit inline propio,
 * borrar, y muestra attachment del reply si lo tiene.
 *
 * El menú de acciones aparece on-hover sobre el reply (cuando es propio).
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
    <li className="group/reply relative">
      <div className="flex items-start gap-1.5">
        <span
          className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradientForName(
            reply.userName,
          )} text-[9px] font-bold text-white`}
        >
          {reply.userName[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold text-zinc-800">
              {reply.userName}
            </span>
            <span className="text-[9.5px] text-zinc-400">
              {new Date(reply.createdAt).toLocaleString([], {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          {editing ? (
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
          ) : (
            <>
              <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-snug text-zinc-700">
                <MentionText text={reply.body} />
                {reply.updatedAt && reply.updatedAt !== reply.createdAt && (
                  <span className="ml-1 text-[9.5px] italic text-zinc-400">
                    (editado)
                  </span>
                )}
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
              className="grid h-5 w-5 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Eliminar"
              className="grid h-5 w-5 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
