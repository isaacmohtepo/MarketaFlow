"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign } from "lucide-react";

type Mentionable = { userId: string; name: string; handle: string; role: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Para posts: el endpoint de mentionables se arma con brandId. */
  brandId?: string;
  /** Override del endpoint de mentionables (ej. tareas, agency-scoped).
   *  Si se pasa, se usa esta URL base en vez de /api/brands/{brandId}. */
  mentionablesUrl?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  autoFocusNoScroll?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
};

const TRIGGER_REGEX = /(?:^|\s)@([\w.\-áéíóúñÁÉÍÓÚÑ]*)$/;

export default function MentionInput({
  value,
  onChange,
  brandId,
  mentionablesUrl,
  placeholder,
  multiline = false,
  rows = 2,
  className,
  containerClassName,
  disabled,
  autoFocus,
  autoFocusNoScroll,
  onKeyDown,
  onPaste,
  onDragOver,
  onDrop,
  inputRef: externalInputRef,
  textareaRef: externalTextareaRef,
}: Props) {
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const textareaRef = externalTextareaRef ?? internalTextareaRef;

  // Focus al montar sin scrollear el documento padre
  useEffect(() => {
    if (!autoFocusNoScroll) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    if (el) el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [items, setItems] = useState<Mentionable[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState<string | null>(null);
  const [triggerStart, setTriggerStart] = useState<number | null>(null);

  // Detecta @query al cambiar el valor o el cursor
  function refreshTrigger(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = TRIGGER_REGEX.exec(before);
    if (!m) {
      setOpen(false);
      setQuery(null);
      setTriggerStart(null);
      return;
    }
    // m.index puede apuntar al espacio anterior; normalizamos para encontrar el "@"
    const atIdx = before.lastIndexOf("@");
    setQuery(m[1] ?? "");
    setTriggerStart(atIdx);
    setOpen(true);
    setActive(0);
  }

  // Debounced fetch de mentionables
  useEffect(() => {
    if (!open || query === null) return;
    let cancelled = false;
    const base = mentionablesUrl ?? `/api/brands/${brandId}/mentionables`;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${base}?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setItems(j.users ?? []);
      } catch {}
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, brandId, mentionablesUrl]);

  function insertMention(item: Mentionable) {
    const el = (multiline ? textareaRef.current : inputRef.current) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    if (!el || triggerStart === null) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, triggerStart);
    const after = value.slice(caret);
    // Usa el handle (parte antes del @ del email) — coincide con cómo extractMentions matchea
    const inserted = `@${item.handle} `;
    const next = before + inserted + after;
    onChange(next);
    setOpen(false);
    setQuery(null);
    setTriggerStart(null);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (open && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, items.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(items[active]);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  }

  function onInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const text = e.target.value;
    onChange(text);
    const caret = e.target.selectionStart ?? text.length;
    refreshTrigger(text, caret);
  }

  function onClick(
    e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const el = e.currentTarget;
    refreshTrigger(value, el.selectionStart ?? value.length);
  }

  return (
    <div className={`relative ${containerClassName ?? ""}`}>
      {multiline ? (
        <textarea
          ref={(el) => {
            textareaRef.current = el;
          }}
          value={value}
          onChange={onInputChange}
          onClick={onClick}
          onKeyDown={handleKey}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDrop={onDrop}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          disabled={disabled}
          className={className}
        />
      ) : (
        <input
          ref={(el) => {
            inputRef.current = el;
          }}
          value={value}
          onChange={onInputChange}
          onClick={onClick}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          className={className}
        />
      )}

      {open && items.length > 0 && (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-72 max-w-[90vw] overflow-hidden rounded-xl border bg-white shadow-lg divider">
          <p className="flex items-center gap-1 border-b divider px-3 py-1.5 text-3xs font-semibold uppercase tracking-wider text-zinc-500">
            <AtSign className="h-3 w-3" />
            Mencionar a
          </p>
          <ul className="max-h-56 overflow-auto py-1">
            {items.map((it, i) => (
              <li key={it.userId}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(it);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition ${
                    i === active ? "bg-fuchsia-50" : "hover:bg-zinc-50"
                  }`}
                >
                  <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-zinc-100 text-3xs font-bold text-zinc-700">
                    {(it.name[0] ?? "?").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-zinc-900">
                      {it.name}
                    </p>
                    <p className="truncate text-[10.5px] text-zinc-500">
                      @{it.handle} · {it.role}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
