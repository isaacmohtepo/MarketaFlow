import type { NextConfig } from "next";

/**
 * Headers de seguridad globales. Aplican a TODAS las rutas excepto el script
 * del widget y los endpoints CORS-públicos del widget feedback.
 *
 * - Strict-Transport-Security: fuerza HTTPS por 2 años (incl. subdominios).
 * - X-Content-Type-Options: nosniff → browser no adivina MIME types
 *   (mitiga uploads de archivos disfrazados).
 * - X-Frame-Options: SAMEORIGIN → clickjacking protection.
 * - Referrer-Policy: strict-origin-when-cross-origin → no leak de paths
 *   privados a terceros via Referer.
 * - Permissions-Policy: deshabilita features peligrosas que no usamos.
 * - Content-Security-Policy: restringe orígenes de scripts/imágenes/etc.
 *   Permitimos:
 *   • script-src: self + 'unsafe-inline' (Next inline scripts) + Vercel analytics
 *   • style-src: self + 'unsafe-inline' (Tailwind runtime + Geist)
 *   • img-src: self, data:, R2 público, Wompi (logos checkout)
 *   • frame-src: self + Wompi checkout
 *   • connect-src: self + R2, Wompi APIs, Vercel
 *   • frame-ancestors: 'self' — no permite que MarketaFlow sea embebido
 *     en otros sitios (clickjacking)
 *
 * Evitamos 'strict-dynamic' por la complejidad de nonces con Next 16. Esta
 * policy es "moderada estricta" — bloquea la mayoría de XSS sin romper la app.
 */
const R2_HOST = "https://pub-77b716a803224625943a1a96c345eb45.r2.dev";
const WOMPI_HOSTS = "https://*.wompi.co https://*.wompi.com";
const VERCEL_HOSTS = "https://*.vercel-analytics.com https://vitals.vercel-insights.com";

/**
 * CSP en producción. En dev (NODE_ENV !== production) Next necesita
 * 'unsafe-eval' para HMR/refresh, así que lo agregamos condicionalmente.
 *
 * frame-src amplio (https:, http:): el WebDesignBoard embebe el sitio
 * staging del CLIENTE de la agencia — esa URL es arbitraria. Necesitamos
 * permitir cualquier https. Esto NO es un riesgo de XSS porque iframes
 * cross-origin están sandboxed por el navegador.
 *
 * connect-src amplio (https:): mismo motivo — el iframe del cliente puede
 * hacer fetches a sus propios servicios; nuestro frontend no controla eso.
 */
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${VERCEL_HOSTS}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `img-src 'self' data: blob: https: ${R2_HOST}`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `media-src 'self' data: blob: https: ${R2_HOST}`,
  `connect-src 'self' https: ${R2_HOST} ${WOMPI_HOSTS} ${VERCEL_HOSTS}`,
  `frame-src 'self' https: ${WOMPI_HOSTS}`,
  `frame-ancestors 'self'`,
  `base-uri 'self'`,
  `form-action 'self' ${WOMPI_HOSTS}`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg", "@prisma/adapter-pg"],
  // Permite acceso al dev server desde la red LAN y túneles públicos.
  // Sin esto, Next 16 bloquea recursos cliente en orígenes que no sean localhost
  // (causa: el form cae a submit nativo GET porque el JS no se carga).
  allowedDevOrigins: [
    "192.168.1.5",
    "192.168.0.0/16",
    "*.loca.lt",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pub-77b716a803224625943a1a96c345eb45.r2.dev" },
    ],
  },
  async headers() {
    return [
      {
        // Aplica a todo, excepto las rutas que necesitan ser embebibles
        // (widget script y endpoints CORS del widget feedback).
        source: "/:path((?!widget\\.js|api/widget/.*).*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
