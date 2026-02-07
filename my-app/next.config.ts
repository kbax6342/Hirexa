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
  serverExternalPackages: [
    "pdfjs-dist",
    
  ],
};

export default nextConfig;
