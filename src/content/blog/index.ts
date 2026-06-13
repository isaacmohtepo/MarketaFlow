/**
 * Registro de artículos del blog. Para publicar uno nuevo: crear el archivo
 * <slug>.ts en esta carpeta y agregarlo a este array. El índice del blog, el
 * sitemap y los datos estructurados lo toman de aquí automáticamente.
 */
import type { Article } from "@/lib/blog";

import { article as iaParaAgencias2026 } from "./ia-para-agencias-de-marketing-2026";
import { article as aprobacionConIa } from "./aprobacion-de-contenido-con-ia";
import { article as herramientasIa } from "./herramientas-ia-crear-contenido-redes";
import { article as flujoSinWhatsapp } from "./flujo-trabajo-agencia-sin-whatsapp";

export const articles: Article[] = [
  iaParaAgencias2026,
  aprobacionConIa,
  herramientasIa,
  flujoSinWhatsapp,
];
