const CACHE_VERSION = "hirexa-pwa-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

const STATIC_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

const PUBLIC_NAVIGATION_PATHS = new Set([
  "/",
  "/about",
  "/blog",
  "/contact-us",
  "/features",
  "/fraud-awareness",
  "/help-center",
  "/how-it-works",
  "/pricing",
  "/privacy",
  "/terms",
  "/accessibility",
  "/ai-disclosure",
  "/do-not-sell",
  "/billing-and-credits",
]);

const EXCLUDED_PREFIXES = [
  "/api/",
  "/applications",
  "/auth",
  "/benefits",
  "/billing",
  "/checkout",
  "/dashboard",
  "/forgot-password",
  "/jobs",
  "/login",
  "/onboarding",
  "/plans",
  "/profile",
  "/questions",
  "/register",
  "/reset-password",
  "/resume",
  "/signup",
  "/stripe",
  "/webhooks",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_SHELL);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (shouldBypass(url.pathname)) {
    return;
  }

  if (request.mode === "navigate" && PUBLIC_NAVIGATION_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(request, PAGE_CACHE));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

function shouldBypass(pathname) {
  return EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon-16x16.png" ||
    pathname === "/favicon-32x32.png" ||
    pathname === "/apple-touch-icon.png" ||
    pathname.startsWith("/icons/")
  );
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  return networkResponse || Response.error();
}
