import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Extra hostnames allowed to open the dev server (e.g. your LAN IP), comma-separated
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS || "127.0.0.1")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
