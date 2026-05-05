// Tipos de entregable que MarketaFlow soporta. La idea es generalizar más allá de IG.
// social_post = post para redes (IG/FB/TikTok/etc) — flujo completo con feed/preview/programación.
// web_design = mockups de landing pages, sitios, dashboards.
// graphic = piezas gráficas sueltas (banners, flyers, ads).
// video = piezas de video (puede tener thumb como imageUrl).
// branding = identidad de marca (logos, manuales, sistemas visuales).
// other = cualquier otra cosa.

export const ASSET_TYPES = [
  "social_post",
  "web_design",
  "graphic",
  "video",
  "branding",
  "other",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  social_post: "Post de redes",
  web_design: "Diseño web",
  graphic: "Pieza gráfica",
  video: "Video",
  branding: "Identidad",
  other: "Otro",
};

// Label singular ("un post", "un diseño web") para titulares y CTAs
export const ASSET_TYPE_SINGULAR: Record<AssetType, string> = {
  social_post: "post",
  web_design: "diseño web",
  graphic: "pieza gráfica",
  video: "video",
  branding: "pieza de identidad",
  other: "archivo",
};

// Label plural ("posts", "diseños web") para listados / vacíos
export const ASSET_TYPE_PLURAL: Record<AssetType, string> = {
  social_post: "posts",
  web_design: "diseños web",
  graphic: "piezas gráficas",
  video: "videos",
  branding: "piezas de identidad",
  other: "archivos",
};

// Label corto del tab (igual al que aparece en las pestañas del brand)
export const ASSET_TYPE_TAB_LABEL: Record<AssetType, string> = {
  social_post: "Posts",
  web_design: "Webs",
  graphic: "Gráficos",
  video: "Videos",
  branding: "Identidad",
  other: "Otros",
};

// CTA "Nuevo X"
export const ASSET_TYPE_NEW_CTA: Record<AssetType, string> = {
  social_post: "Nuevo post",
  web_design: "Nuevo diseño web",
  graphic: "Nueva pieza",
  video: "Nuevo video",
  branding: "Nueva pieza de identidad",
  other: "Nuevo archivo",
};

// Texto del campo "caption" personalizado por tipo
export const ASSET_TYPE_CAPTION_LABEL: Record<AssetType, string> = {
  social_post: "Caption",
  web_design: "Descripción / brief",
  graphic: "Descripción",
  video: "Descripción / guion",
  branding: "Notas",
  other: "Descripción",
};

// Placeholder del input de caption por tipo
export const ASSET_TYPE_CAPTION_PLACEHOLDER: Record<AssetType, string> = {
  social_post: "Escribe el caption del post…",
  web_design: "Qué es esta web, qué secciones tiene, qué quieres validar…",
  graphic: "Qué es esta pieza, dónde se va a usar…",
  video: "De qué trata este video, duración, plataforma…",
  branding: "Qué incluye esta entrega de identidad…",
  other: "Notas sobre este archivo…",
};

export const ASSET_TYPE_TINT: Record<AssetType, string> = {
  social_post: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
  web_design: "bg-blue-50 text-blue-700 ring-blue-100",
  graphic: "bg-amber-50 text-amber-700 ring-amber-100",
  video: "bg-rose-50 text-rose-700 ring-rose-100",
  branding: "bg-violet-50 text-violet-700 ring-violet-100",
  other: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export function isAssetType(value: unknown): value is AssetType {
  return typeof value === "string" && (ASSET_TYPES as readonly string[]).includes(value);
}

export function assetTypeLabel(value: string | null | undefined): string {
  if (!value) return ASSET_TYPE_LABEL.social_post;
  return isAssetType(value) ? ASSET_TYPE_LABEL[value] : value;
}

export function assetTypeTint(value: string | null | undefined): string {
  if (!value) return ASSET_TYPE_TINT.social_post;
  return isAssetType(value) ? ASSET_TYPE_TINT[value] : ASSET_TYPE_TINT.other;
}
