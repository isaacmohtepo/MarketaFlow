"use client";

import MentionInput from "@/components/MentionInput";

/**
 * Textarea inline para editar el body de un comentario o reply, con botones
 * Cancelar / Guardar. Usa MentionInput (autocomplete de @ + autofocus sin scroll).
 */
export default function EditInline({
  brandId,
  value,
  onChange,
  onSave,
  onCancel,
  busy = false,
  rows = 3,
  variant = "default",
}: {
  brandId: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
  rows?: number;
  variant?: "default" | "compact";
}) {
  const compact = variant === "compact";
  const inputCls = compact
    ? "w-full resize-none rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] focus:border-fuchsia-400 focus:outline-none"
    : "w-full resize-none rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[12.5px] focus:border-fuchsia-400 focus:outline-none";
  const btnTextSize = compact ? "text-[10.5px]" : "text-[11px]";
  return (
    <div className={compact ? "mt-1" : "mt-2"}>
      <MentionInput
        brandId={brandId}
        multiline
        rows={rows}
        value={value}
        onChange={onChange}
        autoFocusNoScroll
        className={inputCls}
      />
      <div
        className={`mt-${compact ? "1" : "1.5"} flex items-center justify-end gap-1`}
      >
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-md px-2 py-0.5 ${btnTextSize} font-medium text-zinc-500 hover:bg-zinc-100`}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !value.trim()}
          className={`btn-gradient rounded-md px-2 py-0.5 ${btnTextSize} font-semibold disabled:opacity-60`}
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
