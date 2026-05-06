"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Heading2,
  Quote,
  Undo,
  Redo,
  Code,
  Tag,
} from "lucide-react";
import { useEffect } from "react";

/**
 * Editor de rich text basado en Tiptap. Output = HTML compatible con
 * email clients (mantenemos solo bold, italic, link, lista, h2, blockquote).
 *
 * Variables {{name}} se mantienen como texto plano — al render en email
 * el caller hace .replace(/\{\{name\}\}/g, ...).
 */
export default function RichTextEditor({
  initialHtml,
  onChange,
  variables = ["{{name}}"],
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  variables?: string[];
}) {
  const { prompt } = useConfirm();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Bullet list and ordered list ya vienen en starter-kit
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-fuchsia-600 underline",
        },
      }),
    ],
    content: initialHtml,
    immediatelyRender: false, // evita SSR mismatch
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[180px] px-3 py-2.5 text-[13px] [&_p]:my-1.5 [&_h2]:text-[16px] [&_h2]:font-bold [&_a]:text-fuchsia-600",
      },
    },
  });

  // Si el initialHtml cambia desde fuera (ej. cargar borrador), actualizar
  useEffect(() => {
    if (editor && initialHtml !== editor.getHTML()) {
      editor.commands.setContent(initialHtml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml]);

  if (!editor) return null;

  async function setLink() {
    const url = await prompt({
      title: "Insertar link",
      description: "URL del enlace (con https://). Va a aplicarse al texto seleccionado.",
      placeholder: "https://ejemplo.com",
      inputType: "text",
      required: true,
      confirmLabel: "Insertar",
      cancelLabel: "Cancelar",
    });
    if (!url) return;
    editor!
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }

  function unsetLink() {
    editor!.chain().focus().unsetLink().run();
  }

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-100 bg-zinc-50/40 px-1.5 py-1">
        <ToolButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Negrita (Cmd+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Itálica (Cmd+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolButton>
        <Divider />
        <ToolButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Lista"
        >
          <List className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Lista numerada"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Cita"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          title="Código"
        >
          <Code className="h-3.5 w-3.5" />
        </ToolButton>
        <Divider />
        <ToolButton
          onClick={editor.isActive("link") ? unsetLink : setLink}
          active={editor.isActive("link")}
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolButton>
        <Divider />
        {variables.length > 0 && (
          <>
            {variables.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => editor.chain().focus().insertContent(v).run()}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10.5px] font-mono text-fuchsia-700 hover:bg-fuchsia-50"
                title={`Insertar ${v}`}
              >
                <Tag className="h-3 w-3" />
                {v}
              </button>
            ))}
            <Divider />
          </>
        )}
        <ToolButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Deshacer (Cmd+Z)"
        >
          <Undo className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Rehacer (Cmd+Shift+Z)"
        >
          <Redo className="h-3.5 w-3.5" />
        </ToolButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

function ToolButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`grid h-7 w-7 place-items-center rounded transition disabled:opacity-40 ${
        active ? "bg-fuchsia-100 text-fuchsia-700" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-zinc-200" />;
}
