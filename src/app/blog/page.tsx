import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import JsonLd from "@/components/JsonLd";
import { getAllArticles, formatArticleDate } from "@/lib/blog";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog — IA, agencias y flujo de trabajo",
  description:
    "Ideas prácticas sobre inteligencia artificial, gestión de agencias de marketing y cómo producir y aprobar contenido sin caos.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    title: `Blog · ${SITE_NAME}`,
    description:
      "Ideas prácticas sobre IA, agencias de marketing y flujo de trabajo de contenido.",
    url: absoluteUrl("/blog"),
  },
};

export default function BlogIndex() {
  const articles = getAllArticles();

  // ItemList para que Google entienda el listado del blog.
  const listSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `Blog de ${SITE_NAME}`,
    url: absoluteUrl("/blog"),
    inLanguage: "es",
    blogPost: articles.map((a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      description: a.description,
      url: absoluteUrl(`/blog/${a.slug}`),
      datePublished: a.date,
    })),
  };

  return (
    <div className="theme-dark flex min-h-screen flex-col bg-black">
      <JsonLd data={listSchema} />
      <PublicHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16 sm:py-20">
        <header className="text-center">
          <p className="text-2xs font-semibold uppercase tracking-widest brand-gradient-text">
            Blog
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            IA, agencias y contenido
            <br />
            <span className="text-zinc-500">sin las complicaciones.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-400">
            Ideas prácticas para producir, aprobar y publicar contenido con tu
            equipo y tus clientes — y para usar la IA con criterio.
          </p>
        </header>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {articles.map((a, i) => (
            <Link
              key={a.slug}
              href={`/blog/${a.slug}`}
              className={`card group relative flex flex-col overflow-hidden p-6 transition hover:-translate-y-0.5 hover:border-white/15 ${
                i === 0 ? "sm:col-span-2" : ""
              }`}
            >
              <span className="inline-flex w-fit items-center rounded-full bg-white/[0.06] px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-fuchsia-300 ring-1 ring-white/10">
                {a.category}
              </span>
              <h2
                className={`mt-3 font-bold tracking-tight text-white ${
                  i === 0 ? "text-2xl sm:text-3xl" : "text-lg"
                }`}
              >
                {a.title}
              </h2>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-zinc-400">
                {a.description}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span className="flex items-center gap-3">
                  <span>{formatArticleDate(a.date)}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {a.readingMinutes} min
                  </span>
                </span>
                <span className="flex items-center gap-1 font-medium text-fuchsia-300 transition group-hover:gap-2">
                  Leer
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
