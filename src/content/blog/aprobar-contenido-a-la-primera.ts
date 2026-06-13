import type { Article } from "@/lib/blog";

export const article: Article = {
  slug: "aprobar-contenido-a-la-primera",
  title: "Cómo lograr que tu cliente apruebe el contenido a la primera",
  description:
    "Las rondas de revisión interminables matan la rentabilidad de una agencia. Estrategias concretas para que tus clientes aprueben el contenido a la primera, o casi.",
  category: "Agencias",
  date: "2026-06-08",
  author: "Equipo MarketaFlow",
  readingMinutes: 6,
  tags: ["aprobación", "clientes", "agencias", "feedback"],
  body: [
    {
      type: "p",
      text: "Cada ronda extra de revisión te cuesta dinero. Lo que parecía un proyecto rentable se convierte en pérdida cuando el cliente pide la quinta versión del mismo post. La buena noticia: la mayoría de esas rondas no se deben a que tu trabajo sea malo, sino a fallas evitables en cómo presentas y gestionas la aprobación. Aquí van las estrategias que más ayudan.",
    },
    {
      type: "h2",
      text: "1. Alinea expectativas antes de crear, no después",
    },
    {
      type: "p",
      text: "El 90% de los cambios de último momento nacen de un brief flojo. Antes de producir, asegúrate de tener claro el objetivo de la pieza, el tono de la marca, las referencias visuales y lo que el cliente **no** quiere ver. Un brief sólido ahorra tres rondas de revisión.",
    },
    {
      type: "h2",
      text: "2. Presenta en contexto, no como archivo suelto",
    },
    {
      type: "p",
      text: "Mandar un JPG por WhatsApp invita a un feedback vago: \"no me convence\". En cambio, mostrar la pieza **en su contexto real** —cómo se verá en el feed, en la historia, en el sitio— le da al cliente el marco para opinar con precisión. Cuando ve el resultado final, aprueba con más confianza.",
    },
    {
      type: "h2",
      text: "3. Haz que el feedback sea específico y accionable",
    },
    {
      type: "p",
      text: "\"Cámbiale algo al diseño\" es imposible de ejecutar. \"Mueve el logo a la esquina superior derecha\" es un cambio de dos minutos. La diferencia no es el cliente: es la herramienta. Cuando el cliente puede **comentar clickeando sobre el punto exacto** de la imagen o el segundo del video, el feedback deja de ser ambiguo.",
    },
    {
      type: "callout",
      title: "Vago vs. accionable",
      text: "\"No me gusta el copy\" genera otra ronda. \"En la línea 2, cambia 'oferta' por 'lanzamiento'\" se resuelve al instante. Diseña tu proceso para provocar lo segundo.",
    },
    {
      type: "h2",
      text: "4. Centraliza la conversación en un solo lugar",
    },
    {
      type: "p",
      text: "Cuando el feedback llega por WhatsApp, email y llamadas a la vez, algo se pierde sí o sí. Una sola fuente de verdad —donde estén la pieza, los comentarios y el historial— evita el clásico \"pero yo te dije que...\". Si quedó registrado, no hay discusión.",
    },
    {
      type: "h2",
      text: "5. Deja registro de cada aprobación",
    },
    {
      type: "quote",
      text: "Una aprobación que no quedó registrada es una aprobación que el cliente puede negar después.",
    },
    {
      type: "p",
      text: "Cuando cada \"OK\" queda guardado con fecha y autor, proteges a tu agencia. Si más adelante el cliente dice que nunca aprobó algo, tienes el registro. Esto no es desconfianza: es profesionalismo, y te ahorra conflictos incómodos.",
    },
    {
      type: "h2",
      text: "6. Limita las rondas… desde el contrato",
    },
    {
      type: "p",
      text: "Define en la propuesta cuántas rondas de revisión incluye cada pieza (por ejemplo, dos). A partir de ahí, las rondas extra se cobran. No es ser rígido: es proteger tu rentabilidad y, de paso, incentivar al cliente a dar feedback más cuidado desde el principio.",
    },
    {
      type: "cta",
      text: "MarketaFlow hace que tus clientes aprueben en contexto, con comentarios precisos y todo registrado.",
      href: "/register",
      label: "Empezar gratis",
    },
    {
      type: "h2",
      text: "Conclusión",
    },
    {
      type: "p",
      text: "Aprobar a la primera no es suerte ni depende de tener clientes \"fáciles\". Es el resultado de un buen brief, una presentación en contexto, un feedback que se puede ejecutar y un proceso donde todo queda registrado. Ordena esos cuatro puntos y verás cómo las rondas interminables —y la pérdida de rentabilidad que traen— se vuelven la excepción, no la regla.",
    },
  ],
};
