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
  salary?: string; // ✅ add salary
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
  expiresAt: number;
  staleUntil: number;
  payload: Payload;
};

const CACHE = new Map<string, CacheValue>();
const IN_FLIGHT = new Map<string, Promise<Payload>>();
const DEFAULT_JOBS_PER_SECTION = 3;
const MAX_PAGES_PER_SOURCE = 4;

type JobSearchSource = {
  name: string;
  searchJobs: (args: {
    term: string;
    page: number;
    perPage: number;
  }) => Promise<Job[]>;
};

function cacheKeyFromUrl(url: URL) {
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

function formatSalary(j: any): string | undefined {
  const min = typeof j?.salary_min === "number" ? j.salary_min : null;
  const max = typeof j?.salary_max === "number" ? j.salary_max : null;

  if (min == null && max == null) return undefined;

  const currency = String(j?.salary_currency ?? "USD");
  const interval = String(j?.salary_interval ?? "year"); // year/month/week/day

  // Prefer showing whole dollars (no decimals)
  const nf = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  const left = min != null ? nf.format(min) : null;
  const right = max != null ? nf.format(max) : null;

  if (left && right) return `${left} – ${right} / ${interval}`;
  if (left) return `${left} / ${interval}`;
  if (right) return `${right} / ${interval}`;
  return undefined;
}

function dedupeKey(job: Job): string {
  const fallback = `${job.title}|${job.company}|${job.location}`;
  return String(job.id || fallback).trim().toLowerCase();
}

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

async function getJobsFromAdzuna(args: {
  term: string;
  page?: number;
  perPage?: number;
}): Promise<Job[]> {
  const { term, page = 1, perPage = DEFAULT_JOBS_PER_SECTION } = args;
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    throw new Error("Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in .env.local");
  }

  const country = "us";

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
      salary: formatSalary(j), // ✅ IMPORTANT
      description: typeof j.description === "string" ? j.description : undefined,
      detailsHref: `/jobs/details/${id}`,
    };
  });
}

const ATS_JOB_SOURCES: JobSearchSource[] = [
  {
    name: "adzuna",
    searchJobs: ({ term, page, perPage }) => getJobsFromAdzuna({ term, page, perPage }),
  },
];

async function getUniqueJobsForTerm(args: {
  term: string;
  targetCount?: number;
  sources?: JobSearchSource[];
  excludedKeys?: Set<string>;
}) {
  const {
    term,
    targetCount = DEFAULT_JOBS_PER_SECTION,
    sources = ATS_JOB_SOURCES,
    excludedKeys = new Set<string>(),
  } = args;

  const uniqueJobs: Job[] = [];
  const seenKeys = new Set<string>(excludedKeys);
  const seenTitles = new Set<string>();

  for (const source of sources) {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE && uniqueJobs.length < targetCount; page++) {
      const jobs = await source.searchJobs({
        term,
        page,
        perPage: targetCount * 2,
      });

      if (!jobs.length) break;

      for (const job of jobs) {
        const key = dedupeKey(job);
        const normalizedTitle = titleKey(job.title);

        if (seenKeys.has(key)) continue;
        if (!normalizedTitle || seenTitles.has(normalizedTitle)) continue;

        seenKeys.add(key);
        seenTitles.add(normalizedTitle);
        uniqueJobs.push(job);

        if (uniqueJobs.length >= targetCount) break;
      }
    }
  }

  return uniqueJobs;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = cacheKeyFromUrl(url);
  const now = Date.now();

  const cached = CACHE.get(key);

  // 1) Fresh cache
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, max-age=30" },
    });
  }

  // 2) In-flight
  const existing = IN_FLIGHT.get(key);
  if (existing) {
    try {
      const payload = await existing;
      return NextResponse.json(payload, {
        headers: { "X-Cache": "IN-FLIGHT", "Cache-Control": "public, max-age=10" },
      });
    } catch {
      // fall through
    }
  }

  const promise = (async (): Promise<Payload> => {
    const healthTerm = (url.searchParams.get("health") ?? "healthcare").trim();
    const techTerm = (url.searchParams.get("tech") ?? "software engineer").trim();
    const tradeTerm = (url.searchParams.get("trade") ?? "electrician").trim();

    const allSeenKeys = new Set<string>();

    const healthcareJobs = await getUniqueJobsForTerm({
      term: healthTerm,
      targetCount: DEFAULT_JOBS_PER_SECTION,
      excludedKeys: allSeenKeys,
    });
    healthcareJobs.forEach((job) => allSeenKeys.add(dedupeKey(job)));

    const technologyJobs = await getUniqueJobsForTerm({
      term: techTerm,
      targetCount: DEFAULT_JOBS_PER_SECTION,
      excludedKeys: allSeenKeys,
    });
    technologyJobs.forEach((job) => allSeenKeys.add(dedupeKey(job)));

    const skilledTradeJobs = await getUniqueJobsForTerm({
      term: tradeTerm,
      targetCount: DEFAULT_JOBS_PER_SECTION,
      excludedKeys: allSeenKeys,
    });

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

    return {
      sections,
      generatedAt: new Date().toISOString(),
    };
  })();

  IN_FLIGHT.set(key, promise);

  try {
    const payload = await promise;

    CACHE.set(key, {
      expiresAt: now + 30_000,
      staleUntil: now + 5 * 60_000,
      payload,
    });

    return NextResponse.json(payload, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, max-age=30" },
    });
  } catch (e: any) {
    // stale fallback
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
