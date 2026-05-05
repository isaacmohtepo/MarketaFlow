import type { NextConfig } from "next";

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
};

export default nextConfig;
