export type Plan = {
  id: "free" | "pro" | "agency";
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  highlight?: boolean;
  features: string[];
  cta: string;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceNote: "/mes",
    tagline: "Para empezar a probar el flujo con un cliente.",
    features: [
      "1 marca",
      "Hasta 30 posts/mes",
      "1 cliente invitado",
      "Aprobación con comentarios",
      "Vista feed y calendario",
    ],
    cta: "Empezar gratis",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    priceNote: "/mes",
    tagline: "El plan ideal para freelancers y dúos creativos.",
    highlight: true,
    features: [
      "Hasta 5 marcas",
      "Posts ilimitados",
      "Clientes ilimitados por marca",
      "Comentarios anclados tipo Figma",
      "Carrusel multi-imagen",
      "Auto-publicación a Instagram",
      "Notificaciones in-app",
    ],
    cta: "Probar 14 días gratis",
  },
  {
    id: "agency",
    name: "Agency",
    price: "$89",
    priceNote: "/mes",
    tagline: "Para agencias con varios equipos y marcas.",
    features: [
      "Marcas ilimitadas",
      "Equipo con roles (owner, editor)",
      "White-label con tu logo",
      "Publicación a IG + Facebook + TikTok",
      "Plantillas y biblioteca de hashtags",
      "Métricas y reportes mensuales",
      "Soporte prioritario",
    ],
    cta: "Hablar con ventas",
  },
];
