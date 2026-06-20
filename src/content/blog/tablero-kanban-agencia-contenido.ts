import type { Article } from "@/lib/blog";

export const article: Article = {
  slug: "tablero-kanban-agencia-contenido",
  title: "Tableros Kanban para agencias: cómo organizar el trabajo del equipo",
  description:
    "Un tablero Kanban bien armado le da a tu agencia visibilidad total del trabajo en curso. Te mostramos cómo diseñar las columnas, evitar el cuello de botella de la aprobación y usar límites de trabajo en progreso.",
  category: "Planificación",
  date: "2026-06-15",
  author: "Equipo MarketaFlow",
  readingMinutes: 6,
  tags: ["kanban", "planificador de tareas", "agencias", "flujo de trabajo"],
  body: [
    {
      type: "p",
      text: "El tablero Kanban es la forma más simple y honesta de ver el trabajo de un equipo: tarjetas que se mueven de izquierda a derecha a medida que avanzan. Para una agencia de marketing, donde el contenido pasa por varias manos antes de publicarse, es casi el formato perfecto. Pero un Kanban mal armado se vuelve un caos de tarjetas. Esta guía es para armar uno que funcione.",
    },
    {
      type: "h2",
      text: "Qué resuelve un Kanban en una agencia",
    },
    {
      type: "p",
      text: "La pregunta que más se repite en una agencia es \"¿en qué está esto?\". Un tablero Kanban la responde de un vistazo: cada tarjeta está en una columna que indica su estado. Nadie tiene que preguntar, nadie tiene que abrir un chat. El trabajo es visible, y lo que es visible se gestiona.",
    },
    {
      type: "h2",
      text: "Cómo diseñar las columnas",
    },
    {
      type: "p",
      text: "El error más común es copiar columnas genéricas (\"por hacer / haciendo / hecho\") que no dicen nada sobre tu proceso real. Para una agencia de contenido, un set que sí funciona es:",
    },
    {
      type: "ol",
      items: [
        "**Por hacer** — el trabajo planeado pero no empezado.",
        "**En producción** — alguien lo está creando ahora.",
        "**Revisión interna** — terminado, esperando el ok del equipo antes de mostrarlo.",
        "**Esperando al cliente** — enviado, pendiente de su aprobación.",
        "**Aprobado / listo para publicar** — luz verde, con todo definido.",
      ],
    },
    {
      type: "p",
      text: "Lo importante no es copiar estas columnas exactas, sino que reflejen las etapas reales por las que pasa tu trabajo. Si tu agencia tiene un paso de \"corrección de diseño\" o \"guion aprobado\", merece su columna.",
    },
    {
      type: "callout",
      title: "Regla de oro",
      text: "Si dos tareas en la misma columna están en situaciones muy distintas, te falta una columna. Si una columna está siempre vacía, te sobra. El tablero tiene que contar la verdad.",
    },
    {
      type: "h2",
      text: "El cuello de botella siempre es la aprobación",
    },
    {
      type: "p",
      text: "En casi toda agencia, la columna que se llena es \"esperando al cliente\". Las tarjetas entran y no salen, porque el cliente no responde o el feedback llega por canales sueltos. Ese atasco es la causa número uno de campañas que se retrasan.",
    },
    {
      type: "p",
      text: "La solución no es presionar más al cliente, sino hacerle la aprobación fácil: que vea cada pieza en contexto, comente sobre el punto exacto y apruebe con un botón. Cuando aprobar toma treinta segundos en vez de abrir un hilo de WhatsApp, las tarjetas vuelven a moverse.",
    },
    {
      type: "h2",
      text: "Límites de trabajo en progreso (WIP)",
    },
    {
      type: "p",
      text: "Una técnica simple y poderosa: poner un tope de tarjetas por columna. Si \"en producción\" no puede tener más de cinco tareas a la vez, el equipo se obliga a terminar antes de empezar algo nuevo. Suena restrictivo, pero es lo contrario: evita que todo esté empezado y nada terminado, que es el estado natural de un equipo sin límites.",
    },
    {
      type: "quote",
      text: "Empezar es fácil y se siente productivo. Terminar es lo difícil. Un buen tablero premia terminar, no empezar.",
    },
    {
      type: "h2",
      text: "Una columna por cliente, cuando hace falta",
    },
    {
      type: "p",
      text: "Algunas agencias prefieren ver el trabajo agrupado por marca en lugar de por estado. Un buen planificador te deja las dos cosas: un tablero por estados para el flujo diario, y la posibilidad de filtrar o agrupar por cliente cuando necesitas enfocarte en una cuenta. No tienes que elegir para siempre.",
    },
    {
      type: "h2",
      text: "Conecta las tarjetas con el contenido",
    },
    {
      type: "p",
      text: "Un Kanban de tareas sueltas, sin relación con las piezas que produces, te obliga a saltar entre herramientas. El tablero gana muchísimo cuando una tarjeta está vinculada al post o al diseño concreto: abres la tarea y ves de qué pieza se trata, y cuando el cliente pide un cambio, esa solicitud nace ya como una tarjeta en el tablero.",
    },
    {
      type: "cta",
      text: "En MarketaFlow el tablero del equipo y el contenido de cada marca viven juntos: las tarjetas se conectan con los posts y el feedback del cliente entra directo al tablero.",
      href: "/register",
      label: "Ver el tablero en acción",
    },
    {
      type: "h2",
      text: "Conclusión",
    },
    {
      type: "p",
      text: "Un tablero Kanban no es magia: es disciplina hecha visible. Columnas que reflejan tu proceso real, un tope de trabajo en progreso para forzar el cierre, una aprobación de cliente que no atasque, y tarjetas conectadas con el contenido. Con eso, tu agencia deja de preguntar \"¿en qué está esto?\" y empieza a verlo. El trabajo que se ve, se termina.",
    },
  ],
};
