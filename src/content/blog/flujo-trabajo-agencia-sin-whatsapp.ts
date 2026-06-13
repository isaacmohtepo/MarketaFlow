import type { Article } from "@/lib/blog";

export const article: Article = {
  slug: "flujo-trabajo-agencia-sin-whatsapp",
  title: "Cómo armar un flujo de trabajo de contenido sin caos de WhatsApp",
  description:
    "Una guía para agencias que quieren dejar de aprobar posts por chat: cómo estructurar el proceso de creación, revisión y publicación con el cliente en orden y sin perder nada.",
  category: "Flujo de trabajo",
  date: "2026-05-20",
  author: "Equipo MarketaFlow",
  readingMinutes: 6,
  tags: ["flujo de trabajo", "agencias", "productividad", "gestión de tareas"],
  body: [
    {
      type: "p",
      text: "WhatsApp es genial para coordinar un almuerzo. Es terrible para aprobar el contenido de una marca. Y, sin embargo, la mayoría de las agencias aprueba campañas enteras entre audios, capturas y mensajes que se pierden. Si tu agencia vive así, esta guía es para ti: cómo armar un flujo de trabajo de contenido que no dependa del chat.",
    },
    {
      type: "h2",
      text: "Por qué el chat se rompe a escala",
    },
    {
      type: "p",
      text: "Con un cliente y cinco posts al mes, WhatsApp funciona. Con diez clientes y cientos de piezas, se convierte en un agujero negro:",
    },
    {
      type: "ul",
      items: [
        "**Nada queda registrado.** ¿El cliente aprobó esta versión? ¿Cuándo? Nadie está seguro.",
        "**El contexto se pierde.** Un comentario sin la imagen al lado no significa nada dos días después.",
        "**Las versiones se mezclan.** El cliente comenta sobre una pieza que ya cambiaste.",
        "**El equipo no ve el estado.** ¿Qué falta aprobar? ¿Qué está listo para publicar? Imposible saberlo de un vistazo.",
      ],
    },
    {
      type: "h2",
      text: "Las cuatro etapas de un flujo ordenado",
    },
    {
      type: "h3",
      text: "1. Planificación",
    },
    {
      type: "p",
      text: "Antes de crear nada, el equipo ve el feed planeado del mes: qué se publica, qué día y en qué orden. Ver el feed completo —como se verá en el perfil— evita sorpresas y reduce los cambios de último momento.",
    },
    {
      type: "h3",
      text: "2. Creación y revisión interna",
    },
    {
      type: "p",
      text: "El equipo produce las piezas (con o sin ayuda de IA) y hace una revisión interna **antes** de mostrarle nada al cliente. Esta etapa filtra los errores obvios y asegura que lo que llega al cliente ya tiene un estándar.",
    },
    {
      type: "h3",
      text: "3. Aprobación del cliente",
    },
    {
      type: "p",
      text: "Aquí es donde el chat mata a las agencias. En un flujo ordenado, el cliente recibe un link, ve cada pieza en contexto y **comenta clickeando sobre el punto exacto** —la imagen o el segundo del video—, aprueba o pide cambios con un botón. Todo queda registrado: quién dijo qué y cuándo.",
    },
    {
      type: "h3",
      text: "4. Publicación",
    },
    {
      type: "p",
      text: "Cuando una pieza queda aprobada, pasa a \"lista para publicar\" con su caption final. Sin volver a preguntar, sin malentendidos, con todo el historial guardado por si alguien pregunta después.",
    },
    {
      type: "callout",
      title: "La señal de que tu flujo funciona",
      text: "Cualquier persona del equipo puede responder, en cinco segundos y sin abrir WhatsApp: ¿qué está pendiente de aprobar y qué está listo para publicar?",
    },
    {
      type: "h2",
      text: "El equipo también necesita su propio orden",
    },
    {
      type: "p",
      text: "La aprobación del cliente es la mitad de la historia. La otra mitad es el trabajo interno: quién hace qué, para cuándo, en qué estado está cada tarea. Un flujo completo conecta ambas cosas — cuando un cliente pide un cambio, eso debería convertirse en una **tarea asignada** con su fecha, no en un audio que alguien escuchará \"más tarde\".",
    },
    {
      type: "quote",
      text: "El feedback del cliente y las tareas del equipo no son dos mundos separados. En una agencia ordenada, uno alimenta al otro.",
    },
    {
      type: "cta",
      text: "MarketaFlow une las dos mitades: aprobación del cliente y tablero de tareas del equipo, en tiempo real.",
      href: "/register",
      label: "Ver cómo funciona",
    },
    {
      type: "h2",
      text: "Conclusión",
    },
    {
      type: "p",
      text: "Dejar WhatsApp no es una cuestión de disciplina, es una cuestión de sistema. Con las cuatro etapas claras —planificar, crear, aprobar, publicar— y un lugar único donde todo queda registrado, tu agencia deja de perseguir mensajes y empieza a entregar con orden. El caos no se gestiona con más voluntad: se gestiona con un mejor proceso.",
    },
  ],
};
