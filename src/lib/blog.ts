/**
 * Modelo del blog (contenido como archivos en el repo, versionado en git —
 * sin DB). Cada artículo es un objeto tipado con su cuerpo en bloques. El
 * render vive en src/components/ArticleBody.tsx.
 *
 * Para agregar un artículo: crear src/content/blog/<slug>.ts y registrarlo en
 * src/content/blog/index.ts. El sitemap, el índice del blog y los datos
 * estructurados se actualizan solos.
 */

/** Bloques de contenido de un artículo. El texto admite inline con
 *  **negrita**, *itálica*, `código` y [enlace](url) (ver ArticleBody). */
export type ArticleBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string; cite?: string }
  | { type: "callout"; title?: string; text: string }
  | { type: "cta"; text: string; href: string; label: string };

export type Article = {
  slug: string;
  /** Título (h1 + <title> + og:title). */
  title: string;
  /** Resumen para meta description, og y la card del índice. */
  description: string;
  /** Categoría visible (ej. "IA para agencias"). */
  category: string;
  /** Fecha de publicación ISO (yyyy-mm-dd). */
  date: string;
  /** Fecha de última edición ISO (opcional). */
  updated?: string;
  author: string;
  /** Minutos estimados de lectura. */
  readingMinutes: number;
  tags: string[];
  body: ArticleBlock[];
};

import { articles } from "@/content/blog";

/** Todos los artículos, del más nuevo al más viejo. */
export function getAllArticles(): Article[] {
  return [...articles].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Un artículo por slug, o null si no existe. */
export function getArticleBySlug(slug: string): Article | null {
  return articles.find((a) => a.slug === slug) ?? null;
}

/** Slugs (para generateStaticParams). */
export function getAllArticleSlugs(): string[] {
  return articles.map((a) => a.slug);
}

/** Fecha legible en español (ej. "13 de junio de 2026"). */
export function formatArticleDate(iso: string): string {
  // Construcción manual para evitar dependencias de Date.now/locale en SSR.
  const [y, m, d] = iso.split("-").map(Number);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  if (!y || !m || !d) return iso;
  return `${d} de ${meses[m - 1]} de ${y}`;
}
