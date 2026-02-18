import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compress responses for faster transfer
  compress: true,

  // Minimize server-side external module bundling overhead
  serverExternalPackages: ["ws"],

  // Optimize images
  images: {
    formats: ["image/webp"],
  },

  // Performance headers
  headers: async () => [
    {
      // Cache static assets aggressively
      source: "/(.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff2?))",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, stale-while-revalidate=604800",
        },
      ],
    },
    {
      // Short cache for API responses (browser-level stale-while-revalidate)
      source: "/api/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "private, max-age=0, stale-while-revalidate=10",
        },
      ],
    },
  ],
};

export default nextConfig;
