"use client";

/**
 * Editor de descripción WYSIWYG estilo WordPress/Notion para tareas.
 *
 * Stack:
 *  - TipTap (headless, basado en ProseMirror) → control total del styling
 *  - StarterKit (bold, italic, lists, code, headings, blockquote)
 *  - Underline (no viene en StarterKit)
 *  - Link (con auto-detect y target=_blank)
 *  - Placeholder visible cuando está vacío
 *
 * Comportamiento:
 *  - Persiste HTML en Task.description (cambio del formato anterior, que era
 *    markdown texto plano; las descripciones legacy siguen mostrándose, solo
 *    sin formato hasta que se editen).
 *  - Auto-save on blur (debounce 800ms mientras se escribe).
 *  - Cmd/Ctrl+Enter fuerza save inmediato.
 *  - Esc revierte cambios desde el último save.
 *  - Indicador "Guardado ✓" 2s después del save.
 */

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";
import { useModKey, useShiftKey } from "@/lib/platform";
import { useConfirm } from "@/components/ConfirmDialog";
import { escapeHtml } from "@/lib/sanitize-html";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Unlink,
  Undo,
  Redo,
  CheckCircle2,
  Heading2,
  Heading3,
} from "lucide-react";

export function DescriptionEditor({
  value,
  onSave,
  canWrite,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  canWrite: boolean;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastSavedRef = useRef<string>(value);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // El StarterKit ya trae bold, italic, strike, code, listas, headings,
        // blockquote, codeBlock, hardBreak, history, etc.
        heading: { levels: [2, 3] },
        // Versiones nuevas del StarterKit incluyen link + underline — los
        // deshabilitamos aquí y los importamos por separado para configurarlos
        // (Link con openOnClick=false + auto-target, etc).
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
          class:
            "font-medium text-fuchsia-600 underline decoration-fuchsia-200 underline-offset-2 hover:text-fuchsia-700 hover:decoration-fuchsia-400 transition",
        },
      }),
      Placeholder.configure({
        placeholder: canWrite
          ? "Agrega detalle, contexto, links…"
          : "Sin descripción",
      }),
    ],
    content: htmlOrPlain(value),
    editable: canWrite,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "tiptap-content prose-sm focus:outline-none min-h-[140px] max-w-none",
      },
    },
    onUpdate({ editor: ed }) {
      // Debounced save 800ms
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const html = ed.getHTML();
        if (html === lastSavedRef.current) return;
        commit(html);
      }, 800);
    },
  });

  // Re-set content cuando cambia el value desde afuera (otra session, etc).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current === value || value === lastSavedRef.current) return;
    editor.commands.setContent(htmlOrPlain(value), { emitUpdate: false });
    lastSavedRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Cleanup timer al desmontar
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function commit(html: string) {
    if (html === lastSavedRef.current) return;
    lastSavedRef.current = html;
    await onSave(html);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2200);
  }

  // Cmd/Ctrl+Enter → save inmediato
  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (editor) commit(editor.getHTML());
    }
  }

  function onBlurContainer() {
    // Flush pending debounce al perder foco
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (editor) {
      const html = editor.getHTML();
      if (html !== lastSavedRef.current) commit(html);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          Descripción
        </label>
        {savedAt && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Guardado
          </span>
        )}
      </div>

      <div
        className="overflow-hidden rounded-lg border divider bg-white transition focus-within:border-[rgba(138,43,226,0.55)] focus-within:shadow-[0_0_0_3px_rgba(138,43,226,0.10)]"
        onBlur={onBlurContainer}
        onKeyDown={onKeyDown}
      >
        {canWrite && editor && <EditorToolbar editor={editor} />}
        <div className="px-3 py-2.5">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

/** Toolbar minimalista estilo WordPress arriba del editor. */
function EditorToolbar({ editor }: { editor: Editor }) {
  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);
  const modKey = useModKey();
  const shiftKey = useShiftKey();
  const { prompt } = useConfirm();

  async function promptLink() {
    const prev = (editor.getAttributes("link").href as string) ?? "";
    const url = await prompt({
      title: prev ? "Editar link" : "Insertar link",
      description: "Pega la URL completa. Deja vacío para quitar el link.",
      defaultValue: prev,
      placeholder: "https://...",
      confirmLabel: "Aplicar",
      cancelLabel: "Cancelar",
    });
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    // Normalizar: si no empieza con http, prefijar https
    const normalized = /^https?:\/\//.test(url) ? url : `https://${url}`;
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: normalized })
      .run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b divider bg-zinc-50/60 px-1.5 py-1.5">
      <TBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={isActive("bold")}
        title={`Negrita (${modKey}+B)`}
      >
        <Bold className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={isActive("italic")}
        title={`Cursiva (${modKey}+I)`}
      >
        <Italic className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={isActive("underline")}
        title={`Subrayado (${modKey}+U)`}
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={isActive("strike")}
        title="Tachado"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </TBtn>

      <Sep />

      <TBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={isActive("heading", { level: 2 })}
        title="Título 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={isActive("heading", { level: 3 })}
        title="Título 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </TBtn>

      <Sep />

      <TBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={isActive("bulletList")}
        title="Lista"
      >
        <List className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={isActive("orderedList")}
        title="Lista numerada"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={isActive("blockquote")}
        title="Cita"
      >
        <Quote className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={isActive("code")}
        title="Código inline"
      >
        <Code className="h-3.5 w-3.5" />
      </TBtn>

      <Sep />

      <TBtn
        onClick={promptLink}
        active={isActive("link")}
        title="Insertar link"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </TBtn>
      {isActive("link") && (
        <TBtn
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Quitar link"
        >
          <Unlink className="h-3.5 w-3.5" />
        </TBtn>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <TBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title={`Deshacer (${modKey}+Z)`}
        >
          <Undo className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title={`Rehacer (${modKey}+${shiftKey}+Z)`}
        >
          <Redo className="h-3.5 w-3.5" />
        </TBtn>
      </div>
    </div>
  );
}

function TBtn({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // mantiene focus en editor
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`grid h-7 w-7 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-sm"
          : "text-zinc-500 hover:bg-white hover:text-zinc-900 hover:shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-4 w-px bg-zinc-200" />;
}

/** Si el value ya parece HTML, lo deja; sino lo envuelve en <p> para que
 *  TipTap lo renderice sin perder el texto. Maneja descripciones legacy
 *  guardadas como texto plano con líneas. */
function htmlOrPlain(v: string): string {
  if (!v) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(v)) return v;
  // Texto plano legacy: cada línea en <p>; preservar saltos
  return v
    .split(/\n+/)
    .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
    .join("");
}
