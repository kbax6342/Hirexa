import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 30;
export const dynamic = "force-dynamic";



type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  salary?: string; // ✅ add salary
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

function formatMoney(n: number) {
  // no cents; matches your pill look
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatAdzunaSalary(j: any): string | undefined {
  const min = typeof j.salary_min === "number" ? j.salary_min : null;
  const max = typeof j.salary_max === "number" ? j.salary_max : null;

  if (min == null && max == null) return undefined;

  const currency =
    typeof j.salary_currency === "string" && j.salary_currency.length
      ? j.salary_currency
      : "USD";

  const symbol =
    currency === "USD" ? "$" :
    currency === "GBP" ? "£" :
    currency === "EUR" ? "€" :
    `${currency} `;

  // Adzuna sometimes returns an interval (year/month/week/day/hour)
  const interval =
    typeof j.salary_interval === "string" && j.salary_interval.length
      ? j.salary_interval
      : "year";

  const suffix = ` / ${interval}`;

  // Prefer range when both exist
  if (min != null && max != null) {
    return `${symbol}${formatMoney(min)} – ${symbol}${formatMoney(max)}${suffix}`;
  }

  const one = (min ?? max)!;
  return `${symbol}${formatMoney(one)}${suffix}`;
}

// export async function GET(req: Request) {
//   console.log("🔥 HIT /api/adzuna", new Date().toISOString());
//   const appId = process.env.ADZUNA_APP_ID;
//   const appKey = process.env.ADZUNA_APP_KEY;

//   if (!appId || !appKey) {
//     return NextResponse.json(
//       { error: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in .env.local" },
//       { status: 500 }
//     );
//   }

//   const url = new URL(req.url);
//   const key = cacheKeyFromUrl(url);
//   const now = Date.now();

//   const cached = CACHE.get(key);
//   if (cached && cached.expiresAt > now) {
//     return NextResponse.json(cached.payload, {
//       headers: { "X-Cache": "HIT", "Cache-Control": "public, max-age=30" },
//     });
//   }

//   const existing = IN_FLIGHT.get(key);
//   if (existing) return existing;

//   const promise = (async () => {
//     try {
//       const q = url.searchParams.get("q") ?? "software engineer";
//       const page = Number(url.searchParams.get("page") ?? "1") || 1;
//       const perPage = Number(url.searchParams.get("perPage") ?? "10") || 10;
//       const country = url.searchParams.get("country") ?? "us";

//       const adzunaUrl = new URL(
//         `http://api.adzuna.com/v1/api/jobs/${country}/search/${page}`
//       );
//       adzunaUrl.searchParams.set("app_id", appId);
//       adzunaUrl.searchParams.set("app_key", appKey);
//       adzunaUrl.searchParams.set("results_per_page", String(perPage));
//       adzunaUrl.searchParams.set("what", q);

//       const res = await fetchWithRetry(adzunaUrl.toString(), 2);

//       if (!res.ok) {
//         const text = await res.text();
//         return NextResponse.json(
//           {
//             error: "Adzuna request failed",
//             status: res.status, // ✅ fixed
//             contentType: res.headers.get("content-type"),
//             bodyPreview: text.slice(0, 500),
//           },
//           { status: 502 }
//         );
//       }

//       const data = await res.json();
//       console.log("This is some text")
//       console.log(data)

//       console.log("Adzuna raw job sample:", data.results?.[0]);
//       console.log("[adzuna] CACHE MISS", key);
//       console.log("[adzuna] results length:", data?.results?.length);
//       console.log("[adzuna] raw sample:", data?.results?.[0]);
//       console.log("[adzuna] salary fields sample:", {
//         salary_min: data?.results?.[0]?.salary_min,
//         salary_max: data?.results?.[0]?.salary_max,
//         salary_currency: data?.results?.[0]?.salary_currency,
//         salary_interval: data?.results?.[0]?.salary_interval,
//       });

//       (data.results ?? []).forEach((j: any, i: number) => {
//         console.log(`Job ${i}`, {
//           title: j.title,
//           salary_min: j.salary_min,
//           salary_max: j.salary_max,
//           salary_currency: j.salary_currency,
//           salary_interval: j.salary_interval,
//         });
//       });


//       const jobs: Job[] = (data.results ?? []).map((j: any, idx: number) => ({
//         id: String(j.id ?? `fallback-${page}-${idx}`),
//         title: String(j.title ?? "Untitled role"),
//         company: String(j.company?.display_name ?? "Unknown company"),
//         location: String(j.location?.display_name ?? "Unknown location"),
//         posted: String(j.created ?? ""),
//         jobUrl: String(j.redirect_url ?? ""),
//         salary: formatAdzunaSalary(j), // ✅ add salary
//         description: typeof j.description === "string" ? j.description : undefined,
//       }));

//       const payload = { q, page, perPage, jobs };
//       CACHE.set(key, { expiresAt: now + 30_000, payload });
//       const cached = CACHE.get(key);
//       if (cached && cached.expiresAt > now) {
//         console.log("[adzuna] CACHE HIT", key);
//         console.log("[adzuna] cached sample job:", cached.payload?.jobs?.[0]);
//         return NextResponse.json(cached.payload, {
//           headers: { "X-Cache": "HIT", "Cache-Control": "public, max-age=30" },
//         });
//       }

//       return NextResponse.json(payload, {
//         headers: { "X-Cache": "MISS", "Cache-Control": "public, max-age=30" },
//       });
//     } finally {
//       IN_FLIGHT.delete(key);
//     }
//   })();

//   IN_FLIGHT.set(key, promise);
//   return promise;
// }

// export async function GET(req: Request) {
//   console.log("🔥 HIT /api/adzuna", new Date().toISOString());

//   const appId = process.env.ADZUNA_APP_ID;
//   const appKey = process.env.ADZUNA_APP_KEY;

//   if (!appId || !appKey) {
//     console.log("❌ Missing env keys", { appId: !!appId, appKey: !!appKey });
//     return NextResponse.json(
//       { error: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in .env.local" },
//       { status: 500 }
//     );
//   }

//   const url = new URL(req.url);
//   const q = url.searchParams.get("q") ?? "software engineer";
//   const page = Number(url.searchParams.get("page") ?? "1") || 1;
//   const perPage = Number(url.searchParams.get("perPage") ?? "10") || 10;
//   const country = url.searchParams.get("country") ?? "us";

//   const adzunaUrl = new URL(`http://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
//   adzunaUrl.searchParams.set("app_id", appId);
//   adzunaUrl.searchParams.set("app_key", appKey);
//   adzunaUrl.searchParams.set("results_per_page", String(perPage));
//   adzunaUrl.searchParams.set("what", q);

//   console.log("➡️ Fetching:", adzunaUrl.toString());

//   const res = await fetch(adzunaUrl.toString(), {
//     cache: "no-store",
//     headers: { Accept: "application/json", "User-Agent": "Hirexa/1.0 (+nextjs)" },
//   });

//   console.log("⬅️ Adzuna status:", res.status);

//   const data = await res.json();

//   console.log("✅ results length:", data?.results?.length);
//   console.log("✅ first job salary fields:", {
//     salary_min: data?.results?.[0]?.salary_min,
//     salary_max: data?.results?.[0]?.salary_max,
//     salary_currency: data?.results?.[0]?.salary_currency,
//     salary_interval: data?.results?.[0]?.salary_interval,
//   });

//   return NextResponse.json(data);
// }
