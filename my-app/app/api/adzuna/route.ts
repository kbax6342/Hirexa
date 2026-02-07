import "server-only";
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
  detailsHref?: string;
};

type CategorySection = {
  name: string;
  viewAllHref: string;
  jobs: Job[];
};

type Payload = {
  sections: CategorySection[];
  generatedAt: string;
};

type CacheValue = {
  expiresAt: number;     // fresh until
  staleUntil: number;    // serve stale on 429/502/503 until
  payload: Payload;
};

const CACHE = new Map<string, CacheValue>();
//const IN_FLIGHT = new Map<string, Promise<any>>();

function cacheKeyFromUrl(url: URL) {
  // cache by the 3 terms so different terms don’t collide
  const health = (url.searchParams.get("health") ?? "healthcare").trim();
  const tech = (url.searchParams.get("tech") ?? "software engineer").trim();
  const trade = (url.searchParams.get("trade") ?? "electrician").trim();
  return `homeSections|${health}|${tech}|${trade}`;
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

    // transient retry
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

async function getJobs(term: string, perPage = 3): Promise<Job[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    throw new Error("Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in .env.local");
  }

  const country = "us";
  const page = 1;

  // IMPORTANT: use http://api.adzuna.com to reduce proxy weirdness
  const url = new URL(`http://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", String(perPage));
  url.searchParams.set("what", term);

  const res = await fetchWithRetry(url.toString(), 2);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Adzuna failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();

  return (data.results ?? []).slice(0, perPage).map((j: any, idx: number) => {
    const id = String(j.id ?? `fallback-${term}-${idx}`);
    return {
      id,
      title: String(j.title ?? "Untitled role"),
      company: String(j.company?.display_name ?? "Unknown company"),
      location: String(j.location?.display_name ?? "Unknown location"),
      posted: String(j.created ?? ""),
      jobUrl: String(j.redirect_url ?? ""),
      description: typeof j.description === "string" ? j.description : undefined,
      detailsHref: `/jobs/details/${id}`,
    };
  });
}

// export async function GET(req: Request) {
//   const url = new URL(req.url);
//   const key = cacheKeyFromUrl(url);
//   const now = Date.now();

//   // ✅ Serve fresh cache
//   const cached = CACHE.get(key);
//   if (cached && cached.expiresAt > now) {
//     return NextResponse.json(cached.payload, {
//       headers: { "X-Cache": "HIT", "Cache-Control": "public, max-age=30" },
//     });
//   }

//   // ✅ De-dupe identical concurrent requests
//   const existing = IN_FLIGHT.get(key);
//   if (existing) {
//     const payload = await existing;          // ✅ payload promise
//     return NextResponse.json(payload);       // ✅ new response
//   }

//   const promise = (async () => {
//     try {
//       const healthTerm = (url.searchParams.get("health") ?? "healthcare").trim();
//       const techTerm = (url.searchParams.get("tech") ?? "software engineer").trim();
//       const tradeTerm = (url.searchParams.get("trade") ?? "electrician").trim();

//       let sections: CategorySection[];

//       try {
//         const [healthcareJobs, technologyJobs, skilledTradeJobs] = await Promise.all([
//           getJobs(healthTerm, 3),
//           getJobs(techTerm, 3),
//           getJobs(tradeTerm, 3),
//         ]);

//         sections = [
//           {
//             name: "Healthcare",
//             viewAllHref: `/jobs?cat=healthcare&q=${encodeURIComponent(healthTerm)}`,
//             jobs: healthcareJobs,
//           },
//           {
//             name: "Technology",
//             viewAllHref: `/jobs?cat=technology&q=${encodeURIComponent(techTerm)}`,
//             jobs: technologyJobs,
//           },
//           {
//             name: "Skilled Trades",
//             viewAllHref: `/jobs?cat=skilled-trades&q=${encodeURIComponent(tradeTerm)}`,
//             jobs: skilledTradeJobs,
//           },
//         ];
//       } catch (e: any) {
//         // ✅ If Adzuna rate limits or hiccups, serve stale cache for a few minutes
//         if (cached && cached.staleUntil > now) {
//           return NextResponse.json(cached.payload, {
//             headers: { "X-Cache": "STALE", "Cache-Control": "public, max-age=10" },
//           });
//         }
//         throw e;
//       }

//       const payload: Payload = {
//         sections,
//         generatedAt: new Date().toISOString(),
//       };

//       // ✅ cache: fresh 30s, stale allowed 5 min
//       CACHE.set(key, {
//         expiresAt: now + 30_000,
//         staleUntil: now + 5 * 60_000,
//         payload,
//       });

//       return NextResponse.json(payload, {
//         headers: { "X-Cache": "MISS", "Cache-Control": "public, max-age=30" },
//       });
//     } finally {
//       IN_FLIGHT.delete(key);
//     }
//   })();

//   IN_FLIGHT.set(key, promise);

//    try {
//     const payload = await promise;
//     CACHE.set(key, { expiresAt: now + 30_000, payload });
//     return NextResponse.json(payload);
//   } finally {
//     IN_FLIGHT.delete(key);
//   }
// }

//IN_FLIGHT must be Promise<Payload>, not Promise<Response>
const IN_FLIGHT = new Map<string, Promise<Payload>>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = cacheKeyFromUrl(url);
  const now = Date.now();

  const cached = CACHE.get(key);

  // 1) Serve fresh cache immediately
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, max-age=30" },
    });
  }

  // 2) Reuse in-flight payload computation
  const existing = IN_FLIGHT.get(key);
  if (existing) {
    try {
      const payload = await existing;
      return NextResponse.json(payload, {
        headers: { "X-Cache": "IN-FLIGHT", "Cache-Control": "public, max-age=10" },
      });
    } catch {
      // fall through to rebuild
    }
  }

  // 3) Build payload (ONLY data)
  const promise = (async (): Promise<Payload> => {
    const healthTerm = (url.searchParams.get("health") ?? "healthcare").trim();
    const techTerm = (url.searchParams.get("tech") ?? "software engineer").trim();
    const tradeTerm = (url.searchParams.get("trade") ?? "electrician").trim();

    const [healthcareJobs, technologyJobs, skilledTradeJobs] = await Promise.all([
      getJobs(healthTerm, 3),
      getJobs(techTerm, 3),
      getJobs(tradeTerm, 3),
    ]);

    const sections: CategorySection[] = [
      {
        name: "Healthcare",
        viewAllHref: `/jobs?cat=healthcare&q=${encodeURIComponent(healthTerm)}`,
        jobs: healthcareJobs,
      },
      {
        name: "Technology",
        viewAllHref: `/jobs?cat=technology&q=${encodeURIComponent(techTerm)}`,
        jobs: technologyJobs,
      },
      {
        name: "Skilled Trades",
        viewAllHref: `/jobs?cat=skilled-trades&q=${encodeURIComponent(tradeTerm)}`,
        jobs: skilledTradeJobs,
      },
    ];

    // ✅ return just the payload object
    return {
      sections,
      generatedAt: new Date().toISOString(),
    };
  })();

  IN_FLIGHT.set(key, promise);

  try {
    const payload = await promise;

    // 4) Cache payload
    CACHE.set(key, {
      expiresAt: now + 30_000,
      staleUntil: now + 5 * 60_000,
      payload,
    });

    // 5) Return a NEW response each request
    return NextResponse.json(payload, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, max-age=30" },
    });
  } catch (e: any) {
    // ✅ stale fallback happens OUTSIDE the promise
    if (cached && cached.staleUntil > now) {
      return NextResponse.json(cached.payload, {
        headers: { "X-Cache": "STALE", "Cache-Control": "public, max-age=10" },
      });
    }

    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  } finally {
    IN_FLIGHT.delete(key);
  }
}

