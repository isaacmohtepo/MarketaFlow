import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { ArticleBlock } from "@/lib/blog";

/**
 * Renderiza el cuerpo de un artículo (bloques tipados) en el tema oscuro del
 * sitio público. Soporta inline ligero: **negrita**, *itálica*, `código` y
 * [texto](url). El contenido es nuestro (no input de usuario), así que el
 * parser es deliberadamente simple.
 */

/** Convierte una cadena con marcas inline en nodos React. */
function inline(text: string): ReactNode {
  // Tokeniza por los patrones soportados, en orden.
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em] text-fuchsia-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      const external = /^https?:\/\//.test(href);
      return (
        <Link
          key={i}
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="font-medium text-fuchsia-300 underline decoration-fuchsia-500/40 underline-offset-2 hover:decoration-fuchsia-400"
        >
          {label}
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function ArticleBody({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                className="scroll-mt-24 pt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl"
              >
                {inline(block.text)}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={i}
                className="scroll-mt-24 pt-2 text-lg font-semibold tracking-tight text-white sm:text-xl"
              >
                {inline(block.text)}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="text-[15px] leading-relaxed text-zinc-300 sm:text-base">
                {inline(block.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="space-y-2 pl-1">
                {block.items.map((it, j) => (
                  <li key={j} className="flex gap-3 text-[15px] leading-relaxed text-zinc-300 sm:text-base">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full brand-gradient" />
                    <span>{inline(it)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="space-y-2 pl-1">
                {block.items.map((it, j) => (
                  <li key={j} className="flex gap-3 text-[15px] leading-relaxed text-zinc-300 sm:text-base">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-2xs font-bold text-white">
                      {j + 1}
                    </span>
                    <span>{inline(it)}</span>
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-2 border-fuchsia-500/60 pl-4 text-lg font-medium italic text-zinc-200"
              >
                {inline(block.text)}
                {block.cite && (
                  <cite className="mt-2 block text-sm not-italic text-zinc-500">
                    — {block.cite}
                  </cite>
                )}
              </blockquote>
            );
          case "callout":
            return (
              <div
                key={i}
                className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.06] p-4"
              >
                {block.title && (
                  <p className="mb-1 text-sm font-semibold text-white">
                    {inline(block.title)}
                  </p>
                )}
                <p className="text-[15px] leading-relaxed text-zinc-300">
                  {inline(block.text)}
                </p>
              </div>
            );
          case "cta":
            return (
              <div
                key={i}
                className="flex flex-col items-start gap-3 rounded-2xl border divider bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-[15px] font-medium text-zinc-200">
                  {inline(block.text)}
                </p>
                <Link
                  href={block.href}
                  className="btn-gradient shrink-0 rounded-full px-5 py-2.5 text-[13px] font-semibold"
                >
                  {block.label}
                </Link>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
