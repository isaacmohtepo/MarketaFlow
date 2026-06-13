/**
 * Builders de datos estructurados (schema.org) para SEO. Centralizados para
 * mantener consistente el @id de la organización entre páginas.
 */
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  absoluteUrl,
} from "./site";

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** La agencia/empresa detrás del producto. */
export function organizationSchema(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon"),
    description: SITE_DESCRIPTION,
  };
}

/** El sitio web (habilita el sitelinks searchbox a futuro). */
export function websiteSchema(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "es",
    publisher: { "@id": ORG_ID },
  };
}

/** El producto SaaS en sí (precio "desde", categoría). */
export function softwareApplicationSchema(): Record<string, unknown> {
  return {
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    publisher: { "@id": ORG_ID },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "COP",
      description: "Plan gratuito para empezar; planes pagos para escalar.",
    },
  };
}

/** Grafo completo para la landing. */
export function landingGraph(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationSchema(),
      websiteSchema(),
      softwareApplicationSchema(),
    ],
  };
}

/** Un artículo del blog (BlogPosting). */
export function articleSchema(opts: {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
  author: string;
  image: string;
}): Record<string, unknown> {
  const url = absoluteUrl(`/blog/${opts.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: opts.title,
    description: opts.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    image: opts.image,
    inLanguage: "es",
    author: { "@type": "Organization", name: opts.author },
    publisher: { "@id": ORG_ID },
  };
}

/** Breadcrumb (lista de migas) para una ruta. */
export function breadcrumbSchema(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.url),
    })),
  };
}
