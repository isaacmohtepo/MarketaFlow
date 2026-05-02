import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg", "@prisma/adapter-pg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pub-77b716a803224625943a1a96c345eb45.r2.dev" },
    ],
  },
};

export default nextConfig;
