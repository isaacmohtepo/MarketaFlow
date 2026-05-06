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
 *
 * NO ponemos Content-Security-Policy global todavía — colidiría con Vercel
 * analytics y los iframes del web feedback. Es deuda futura: diseñar un
 * nonce-based CSP con cuidado.
 */
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
