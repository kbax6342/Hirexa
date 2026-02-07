import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 30;

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  description?: string;
};

type CacheValue = { expiresAt: number; payload: any };

const CACHE = new Map<string, CacheValue>();
const IN_FLIGHT = new Map<string, Promise<Response>>();

function cacheKeyFromUrl(url: URL) {
  const q = url.searchParams.get("q") ?? "";
  const page = url.searchParams.get("page") ?? "1";
  const perPage = url.searchParams.get("perPage") ?? "10";
  const country = url.searchParams.get("country") ?? "us";
  return `${country}|${q}|${page}|${perPage}`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(input: string, tries = 2) {
  let lastRes: Response | null = null;

  for (let i = 0; i < tries; i++) {
    const res = await fetch(input, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Hirexa/1.0 (+nextjs)",
      },
    });

    lastRes = res;
    if (res.ok) return res;

    if (res.status === 429 || res.status === 502 || res.status === 503) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 400 * (i + 1);
      await sleep(waitMs);
      continue;
    }

    return res;
  }

  return lastRes!;
}

export async function GET(req: Request) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return NextResponse.json(
      { error: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in .env.local" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const key = cacheKeyFromUrl(url);
  const now = Date.now();

  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, max-age=30" },
    });
  }

  const existing = IN_FLIGHT.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const q = url.searchParams.get("q") ?? "software engineer";
      const page = Number(url.searchParams.get("page") ?? "1") || 1;
      const perPage = Number(url.searchParams.get("perPage") ?? "10") || 10;
      const country = url.searchParams.get("country") ?? "us";

      // NOTE: use http://api.adzuna.com (Adzuna often serves API here)
      const adzunaUrl = new URL(`http://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
      adzunaUrl.searchParams.set("app_id", appId);
      adzunaUrl.searchParams.set("app_key", appKey);
      adzunaUrl.searchParams.set("results_per_page", String(perPage));
      adzunaUrl.searchParams.set("what", q);

      const res = await fetchWithRetry(adzunaUrl.toString(), 2);

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          {
            error: "Adzuna request failed",
            status: res.statusf;
            contentType: res.headers.get("content-type"),
            bodyPreview: text.slice(0, 500),
          },
          { status: 502 }
        );
      }

      const data = await res.json();

      const jobs: Job[] = (data.results ?? []).map((j: any, idx: number) => ({
        id: String(j.id ?? `fallback-${page}-${idx}`),
        title: String(j.title ?? "Untitled role"),
        company: String(j.company?.display_name ?? "Unknown company"),
        location: String(j.location?.display_name ?? "Unknown location"),
        posted: String(j.created ?? ""),
        jobUrl: String(j.redirect_url ?? ""),
        description: typeof j.description === "string" ? j.description : undefined,
      }));

      const payload = { q, page, perPage, jobs };
      CACHE.set(key, { expiresAt: now + 30_000, payload });

      return NextResponse.json(payload, {
        headers: { "X-Cache": "MISS", "Cache-Control": "public, max-age=30" },
      });
    } finally {
      IN_FLIGHT.delete(key);
    }
  })();

  IN_FLIGHT.set(key, promise);
  return promise;
}
