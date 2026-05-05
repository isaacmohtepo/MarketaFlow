"use client";

import { useRef } from "react";
import { Loader2, Paperclip } from "lucide-react";
import MentionInput from "@/components/MentionInput";
import AttachmentPreview, { type Attach } from "./AttachmentPreview";

type Props = {
  brandId: string;
  value: string;
  onChange: (v: string) => void;
  attachment: Attach | null;
  onAttachmentChange: (a: Attach | null) => void;
  uploading: boolean;
  onUpload: (file: File) => void;
  onSubmit: () => void;
  /** Segundo botón opcional "Nota interna" (solo lo ve el equipo). */
  onSubmitInternal?: () => void;
  /** Si está deshabilitado (ej. mención a un cliente), tooltip explicativo. */
  internalDisabled?: boolean;
  internalDisabledReason?: string;
  onCancel?: () => void;
  busy?: boolean;
  rows?: number;
  placeholder: string;
  submitLabel?: string;
  modKey: string;
  autoFocusNoScroll?: boolean;
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
  variant?: "default" | "compact";
  /** En "compact" (replies) se usan tipografías y paddings más chicos. */
};

const MAX_FILE = 25 * 1024 * 1024;

export default function CommentComposer({
  brandId,
  value,
  onChange,
  attachment,
  onAttachmentChange,
  uploading,
  onUpload,
  onSubmit,
  onSubmitInternal,
  internalDisabled,
  internalDisabledReason,
  onCancel,
  busy = false,
  rows = 2,
  placeholder,
  submitLabel = "Enviar",
  modKey,
  autoFocusNoScroll,
  textareaRef,
  variant = "default",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compact = variant === "compact";
  const canSubmit = value.trim().length > 0 || !!attachment;
  const inputCls = compact
    ? "w-full resize-none rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[12px] focus:border-fuchsia-400 focus:outline-none"
    : "w-full resize-none rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[12.5px] focus:border-fuchsia-400 focus:outline-none";

  return (
    <div>
      <MentionInput
        brandId={brandId}
        multiline
        rows={rows}
        value={value}
        onChange={onChange}
        autoFocusNoScroll={autoFocusNoScroll}
        textareaRef={textareaRef}
        onPaste={(e) => {
          const ce = e as React.ClipboardEvent<HTMLTextAreaElement>;
          const file = Array.from(ce.clipboardData.files).find((f) =>
            f.type.startsWith("image/"),
          );
          if (file) {
            ce.preventDefault();
            onUpload(file);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const de = e as React.DragEvent<HTMLTextAreaElement>;
          const file = Array.from(de.dataTransfer.files).find(
            (f) => f.size <= MAX_FILE,
          );
          if (file) {
            de.preventDefault();
            onUpload(file);
          }
        }}
        placeholder={`${placeholder} (@ menciona · ${modKey}+Enter envía)`}
        className={inputCls}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canSubmit && !busy) onSubmit();
          }
        }}
      />
      {attachment && (
        <AttachmentPreview
          attachment={attachment}
          onRemove={() => onAttachmentChange(null)}
          size={compact ? "sm" : "md"}
        />
      )}
      <div className="mt-1 flex items-center justify-between gap-1">
        <label
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 ${
            uploading ? "opacity-60" : "cursor-pointer"
          }`}
          title="Adjuntar"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Paperclip className="h-3 w-3" />
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <div className="flex items-center gap-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100"
            >
              Cancelar
            </button>
          )}
          {onSubmitInternal && (
            <button
              type="button"
              onClick={onSubmitInternal}
              disabled={busy || !canSubmit || internalDisabled}
              className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
              title={
                internalDisabled
                  ? internalDisabledReason ?? "No disponible"
                  : "Solo el equipo lo verá. El cliente no se entera."
              }
            >
              🔒 Interna
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !canSubmit}
            className="btn-gradient inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[11px] font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
