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
  salary?: string;
  salaryIsEstimated?: boolean;
  description?: string;
};

type AdzunaSearchJob = {
  id?: string | number;
  title?: string;
  created?: string;
  redirect_url?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_interval?: string;
  salary_is_predicted?: boolean | number | string;
  company?: { display_name?: string };
  location?: { display_name?: string };
};

type CacheValue = {
  expiresAt: number;
  payload: { q: string; page: number; perPage: number; jobs: Job[] };
};

const CACHE = new Map<string, CacheValue>();
const IN_FLIGHT = new Map<string, Promise<Response>>();

function cacheKeyFromUrl(url: URL) {
  const q = url.searchParams.get("q") ?? "";
  const page = url.searchParams.get("page") ?? "1";
  const perPage = url.searchParams.get("perPage") ?? "10";
  const country = url.searchParams.get("country") ?? "us";
  const location = url.searchParams.get("location") ?? "";
  return `${country}|${q}|${location}|${page}|${perPage}`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(input: string, tries = 2) {
  let lastRes: Response | null = null;

  for (let index = 0; index < tries; index += 1) {
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
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 400 * (index + 1);
      await sleep(waitMs);
      continue;
    }

    return res;
  }

  return lastRes!;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function isPredictedSalary(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function getCurrencySymbol(currency: unknown) {
  if (currency === "GBP") return "\u00A3";
  if (currency === "EUR") return "\u20AC";
  if (typeof currency === "string" && currency.trim()) return `${currency.trim()} `;
  return "$";
}

function formatAdzunaSalary(job: AdzunaSearchJob): string | undefined {
  const min = typeof job.salary_min === "number" ? job.salary_min : null;
  const max = typeof job.salary_max === "number" ? job.salary_max : null;

  if (min == null && max == null) return undefined;

  const symbol = getCurrencySymbol(job.salary_currency);
  const interval =
    typeof job.salary_interval === "string" && job.salary_interval.trim()
      ? job.salary_interval.trim()
      : "year";
  const suffix = ` / ${interval}`;
  const estimatedSuffix = isPredictedSalary(job.salary_is_predicted)
    ? " - estimated"
    : "";

  if (min != null && max != null) {
    if (Math.round(min) === Math.round(max)) {
      return `${symbol}${formatMoney(min)}${suffix}${estimatedSuffix}`;
    }

    return `${symbol}${formatMoney(min)} - ${symbol}${formatMoney(max)}${suffix}${estimatedSuffix}`;
  }

  const singleValue = min ?? max;
  return `${symbol}${formatMoney(singleValue!)}${suffix}${estimatedSuffix}`;
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
      const q = (url.searchParams.get("q") ?? "").trim() || "jobs";
      const page = Number(url.searchParams.get("page") ?? "1") || 1;
      const perPage = Number(url.searchParams.get("perPage") ?? "10") || 10;
      const country = url.searchParams.get("country") ?? "us";
      const location = (url.searchParams.get("location") ?? "").trim();

      const adzunaUrl = new URL(
        `http://api.adzuna.com/v1/api/jobs/${country}/search/${page}`
      );
      adzunaUrl.searchParams.set("app_id", appId);
      adzunaUrl.searchParams.set("app_key", appKey);
      adzunaUrl.searchParams.set("results_per_page", String(perPage));
      adzunaUrl.searchParams.set("what", q);
      if (location) {
        adzunaUrl.searchParams.set("where", location);
      }

      const res = await fetchWithRetry(adzunaUrl.toString(), 2);

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          {
            error: "Adzuna request failed",
            status: res.status,
            contentType: res.headers.get("content-type"),
            bodyPreview: text.slice(0, 500),
          },
          { status: 502 }
        );
      }

      const data = (await res.json()) as { results?: AdzunaSearchJob[] };

      const jobs: Job[] = (data.results ?? []).map((job, index: number) => ({
        id: String(job.id ?? `fallback-${page}-${index}`),
        title: String(job.title ?? "Untitled role"),
        company: String(job.company?.display_name ?? "Unknown company"),
        location: String(job.location?.display_name ?? "Unknown location"),
        posted: String(job.created ?? ""),
        jobUrl: String(job.redirect_url ?? ""),
        salary: formatAdzunaSalary(job),
        salaryIsEstimated: isPredictedSalary(job.salary_is_predicted),
        description: typeof job.description === "string" ? job.description : undefined,
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
