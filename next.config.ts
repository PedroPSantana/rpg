import type { NextConfig } from "next";

// Cache Components is intentionally disabled: almost every page reads
// per-player campaign state from PostgreSQL, so request-time rendering is the
// correct default and keeps the data flow easy to reason about.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
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
