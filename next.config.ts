import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const enableVercelLiveFeedback =
  !isProduction || process.env.NEXT_PUBLIC_ENABLE_VERCEL_LIVE_FEEDBACK === "true";
const enableTikTokPixel = process.env.NEXT_PUBLIC_ENABLE_TIKTOK_PIXEL === "true";

const contentSecurityPolicyDirectives = [
  "default-src 'self'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    !isProduction ? "'unsafe-eval'" : null,
    "https://js.stripe.com",
    "https://checkout.stripe.com",
    "https://connect.facebook.net",
    "https://accounts.google.com",
    "https://apis.google.com",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.recaptcha.net",
    "https://www.dropbox.com",
    enableVercelLiveFeedback ? "https://vercel.live" : null,
    enableTikTokPixel ? "https://analytics.tiktok.com" : null,
    // TODO(security): Expand script-src only when additional client-side providers
    // are verified in production. Keep Google OAuth / Drive Picker in sync here.
  ]
    .filter(Boolean)
    .join(" "),
  "style-src 'self' 'unsafe-inline'",
  // Meta Pixel uses a noscript image beacon against www.facebook.com/tr.
  [
    "img-src",
    "'self'",
    "data:",
    "blob:",
    "https:",
    "https://www.facebook.com",
    enableTikTokPixel ? "https://analytics.tiktok.com" : null,
    enableTikTokPixel ? "https://ads.tiktok.com" : null,
  ]
    .filter(Boolean)
    .join(" "),
  "font-src 'self' data:",
  [
    "connect-src",
    "'self'",
    "https://api.stripe.com",
    "https://checkout.stripe.com",
    "https://js.stripe.com",
    "https://www.googleapis.com",
    "https://content.googleapis.com",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.facebook.com",
    "https://connect.facebook.net",
    "https://vitals.vercel-insights.com",
    "https://api.linkedin.com",
    "https://www.linkedin.com",
    "https://www.dropbox.com",
    "https://content.dropboxapi.com",
    enableVercelLiveFeedback ? "https://vercel.live" : null,
    enableTikTokPixel ? "https://analytics.tiktok.com" : null,
    enableTikTokPixel ? "https://ads.tiktok.com" : null,
    enableTikTokPixel ? "https://analytics-ipv6.tiktokw.us" : null,
    // TODO(security): Expand connect-src if new browser-side SaaS integrations
    // are added. Prefer explicit domains over broad wildcards.
  ]
    .filter(Boolean)
    .join(" "),
  [
    "frame-src",
    "'self'",
    "https://js.stripe.com",
    "https://hooks.stripe.com",
    "https://checkout.stripe.com",
    "https://accounts.google.com",
    "https://docs.google.com",
    "https://drive.google.com",
    "https://content.googleapis.com",
    "https://www.google.com",
    "https://recaptcha.google.com",
    "https://www.recaptcha.net",
    "https://www.facebook.com",
    enableVercelLiveFeedback ? "https://vercel.live" : null,
  ]
    .filter(Boolean)
    .join(" "),
  "worker-src 'self' blob:",
  "child-src 'self' blob: https://docs.google.com https://drive.google.com https://content.googleapis.com https://checkout.stripe.com https://js.stripe.com",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://accounts.google.com https://www.linkedin.com https://www.google.com https://www.facebook.com",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    // HirePilot uses microphone + display capture only. Keep camera blocked until
    // a first-party camera feature actually ships.
    value:
      "accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), payment=(self), usb=(), microphone=(self), display-capture=(self), clipboard-read=(self), clipboard-write=(self)",
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicyDirectives },
  // Keep Google OAuth / Picker popup compatibility intact.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
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
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
