import type { MetadataRoute } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { getSiteUrl } from "@/app/lib/site-url";

const PUBLIC_SITEMAP_ROUTES = [
  "/",
  "/about",
  "/accessibility",
  "/ai-disclosure",
  "/blog",
  "/contact",
  "/contact-us",
  "/do-not-sell",
  "/features",
  "/fraud-awareness",
  "/help",
  "/help-center",
  "/how-it-works",
  "/newsletter",
  "/pricing",
  "/privacy",
  "/terms",
] as const;

function routeExists(route: string) {
  const routeSegments = route === "/" ? [] : route.slice(1).split("/");
  const pageDir = join(process.cwd(), "app", ...routeSegments);

  return ["page.tsx", "page.ts", "page.jsx", "page.js"].some((fileName) =>
    existsSync(join(pageDir, fileName))
  );
}

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  return PUBLIC_SITEMAP_ROUTES.filter(routeExists).map((route) => ({
    url: new URL(route, siteUrl).toString(),
    lastModified,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/pricing" ? 0.9 : 0.7,
  }));
}
