import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, ArrowRight } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import JsonLd from "@/components/JsonLd";
import ArticleBody from "@/components/ArticleBody";
import {
  getArticleBySlug,
  getAllArticleSlugs,
  getAllArticles,
  formatArticleDate,
} from "@/lib/blog";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { articleSchema, breadcrumbSchema } from "@/lib/structured-data";

export function generateStaticParams() {
  return getAllArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return { title: "Artículo no encontrado" };

  const url = absoluteUrl(`/blog/${article.slug}`);
  const ogImage = absoluteUrl(`/blog/${article.slug}/opengraph-image`);
  return {
    title: article.title,
    description: article.description,
    keywords: article.tags,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      url,
      publishedTime: article.date,
      modifiedTime: article.updated ?? article.date,
      authors: [article.author],
      tags: article.tags,
      images: [{ url: ogImage, width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images: [ogImage],
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const related = getAllArticles()
    .filter((a) => a.slug !== article.slug)
    .slice(0, 2);

  return (
    <div className="theme-dark flex min-h-screen flex-col bg-black">
      <JsonLd
        data={[
          articleSchema({
            title: article.title,
            description: article.description,
            slug: article.slug,
            datePublished: article.date,
            dateModified: article.updated,
            author: article.author,
            image: absoluteUrl(`/blog/${article.slug}/opengraph-image`),
          }),
          breadcrumbSchema([
            { name: "Inicio", url: "/" },
            { name: "Blog", url: "/blog" },
            { name: article.title, url: `/blog/${article.slug}` },
          ]),
        ]}
      />
      <PublicHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:py-16">
        {/* Columna de lectura alineada a la IZQUIERDA del contenedor (mismo
            borde que el navbar/landing), no centrada: el título queda a la
            altura del logo "MarketaFlow". El ancho del frame = max-w-6xl como
            todo el sitio; la medida de lectura se mantiene cómoda con 3xl. */}
        <div className="max-w-3xl">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver al blog
        </Link>

        <article className="mt-6">
          <header>
            <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-fuchsia-300 ring-1 ring-white/10">
              {article.category}
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              {article.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-zinc-400">
              {article.description}
            </p>
            <div className="mt-5 flex items-center gap-3 border-b divider pb-6 text-xs text-zinc-500">
              <span>{article.author}</span>
              <span aria-hidden>·</span>
              <time dateTime={article.date}>{formatArticleDate(article.date)}</time>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {article.readingMinutes} min de lectura
              </span>
            </div>
          </header>

          <div className="mt-8">
            <ArticleBody blocks={article.body} />
          </div>

          {article.tags.length > 0 && (
            <div className="mt-10 flex flex-wrap gap-2 border-t divider pt-6">
              {article.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-zinc-400 ring-1 ring-white/5"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </article>

        {/* CTA final */}
        <div className="mt-12 overflow-hidden rounded-2xl border divider bg-white/[0.03] p-7 text-center">
          <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Aprueba contenido sin caos de WhatsApp
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
            {SITE_NAME} reúne la aprobación del cliente y las tareas del equipo
            en un solo lugar, en tiempo real.
          </p>
          <Link
            href="/register"
            className="btn-gradient mt-5 inline-block rounded-full px-6 py-2.5 text-[13px] font-semibold"
          >
            Empezar gratis
          </Link>
        </div>

        {/* Relacionados */}
        {related.length > 0 && (
          <section className="mt-12">
            <p className="text-2xs font-semibold uppercase tracking-widest text-zinc-500">
              Seguir leyendo
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {related.map((a) => (
                <Link
                  key={a.slug}
                  href={`/blog/${a.slug}`}
                  className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-white/15"
                >
                  <h3 className="text-base font-semibold tracking-tight text-white">
                    {a.title}
                  </h3>
                  <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-zinc-400">
                    {a.description}
                  </p>
                  <span className="mt-3 flex items-center gap-1 text-xs font-medium text-fuchsia-300 transition group-hover:gap-2">
                    Leer
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
