// /next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "iili.io",
        port: "",
        pathname: "/**",
      },
    ],
  },

  // ✅ Keep pdfjs-dist out of Next's server bundling (fixes fake worker/module path issues)
  serverExternalPackages: ["pdfjs-dist"],

  // ✅ Fix Google OAuth/Picker popup issues (window.opener blocked by COOP)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
          { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },
};

export default nextConfig;
