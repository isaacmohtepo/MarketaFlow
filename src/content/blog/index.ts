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
import { article as herramientasImprescindibles } from "./herramientas-imprescindibles-agencia-marketing";
import { article as aprobarALaPrimera } from "./aprobar-contenido-a-la-primera";
import { article as planificadorTareas } from "./planificador-tareas-agencia-marketing";
import { article as tableroKanban } from "./tablero-kanban-agencia-contenido";
import { article as planificarMesContenido } from "./planificar-mes-contenido-varias-marcas";

export const articles: Article[] = [
  planificadorTareas,
  tableroKanban,
  planificarMesContenido,
  iaParaAgencias2026,
  aprobacionConIa,
  herramientasIa,
  flujoSinWhatsapp,
  herramientasImprescindibles,
  aprobarALaPrimera,
];
