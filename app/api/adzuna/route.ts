import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60;
export const dynamic = "force-dynamic";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  salary?: string;
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

type JobCacheValue = {
  data: Job[];
  timestamp: number;
};

type JobSearchSource = {
  name: string;
  searchJobs: (args: {
    term: string;
    page: number;
    perPage: number;
    location?: string;
  }) => Promise<Job[]>;
};

type GlobalCached = {
  expiresAt: number;
  key: string;
  version: string;
  body: Payload;
};

declare global {
  // eslint-disable-next-line no-var
  var __adzunaCache: GlobalCached | undefined;
}

const CACHE = new Map<string, CacheValue>();
const IN_FLIGHT = new Map<string, Promise<Payload>>();
const JOB_CACHE = new Map<string, JobCacheValue>();
const DEFAULT_JOBS_PER_SECTION = 3;
const MAX_PAGES_PER_SOURCE = 4;
const GLOBAL_CACHE_TTL_MS = 5 * 60 * 1000;
const JOB_CACHE_TTL_MS = 5 * 60 * 1000;
const RECENT_POSTING_DAYS = 7;
const ADZUNA_CACHE_VERSION = `recent-${RECENT_POSTING_DAYS}d`;

function getGlobalCache(key: string) {
  const cached = globalThis.__adzunaCache;
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) return null;
  if (cached.version !== ADZUNA_CACHE_VERSION) return null;
  if (cached.key !== key) return null;
  return cached.body;
}

function setGlobalCache(key: string, body: Payload) {
  globalThis.__adzunaCache = {
    expiresAt: Date.now() + GLOBAL_CACHE_TTL_MS,
    key,
    version: ADZUNA_CACHE_VERSION,
    body,
  };
}

function cacheKeyFromUrl(url: URL) {
  const health = (url.searchParams.get("health") ?? "healthcare").trim();
  const tech = (url.searchParams.get("tech") ?? "software engineer").trim();
  const finance = (url.searchParams.get("finance") ?? "finance").trim();
  const location = (url.searchParams.get("location") ?? "").trim().toLowerCase();
  return `${ADZUNA_CACHE_VERSION}|homeSections|${health}|${tech}|${finance}|${location}`;
}

function jobCacheKey(args: {
  term: string;
  page: number;
  perPage: number;
  location?: string;
}) {
  return `${ADZUNA_CACHE_VERSION}|${args.term
    .trim()
    .toLowerCase()}|${(args.location ?? "").trim().toLowerCase()}|${args.page}|${args.perPage}`;
}

function getCachedJobs(cacheKey: string) {
  const cached = JOB_CACHE.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp < JOB_CACHE_TTL_MS) return cached.data;
  return null;
}

function cleanText(value: unknown, maxLength?: number) {
  if (typeof value !== "string") return "";

  const text = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function emptyPayload(error?: string): Payload & { error?: string } {
  return {
    sections: [],
    generatedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
}

function hasJobs(payload: Payload) {
  return payload.sections.some((section) => section.jobs.length > 0);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

function formatSalary(job: any): string | undefined {
  const min = typeof job?.salary_min === "number" ? job.salary_min : null;
  const max = typeof job?.salary_max === "number" ? job.salary_max : null;

  if (min == null && max == null) return undefined;

  const currency = String(job?.salary_currency ?? "USD");
  const interval = String(job?.salary_interval ?? "year");
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  const left = min != null ? formatter.format(min) : null;
  const right = max != null ? formatter.format(max) : null;

  if (left && right) return `${left} - ${right} / ${interval}`;
  if (left) return `${left} / ${interval}`;
  if (right) return `${right} / ${interval}`;
  return undefined;
}

function dedupeKey(job: Job): string {
  const fallback = `${job.title}|${job.company}|${job.location}`;
  return String(job.id || fallback).trim().toLowerCase();
}

function titleKey(title: string) {
  return title.trim().toLowerCase();
}

function isRecentPosting(iso?: string, maxAgeDays = RECENT_POSTING_DAYS) {
  if (!iso) return false;

  const postedAt = new Date(iso);
  if (Number.isNaN(postedAt.getTime())) return false;

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return Date.now() - postedAt.getTime() <= maxAgeMs;
}

async function getJobsFromAdzuna(args: {
  term: string;
  page?: number;
  perPage?: number;
  location?: string;
}): Promise<Job[]> {
  const {
    term,
    page = 1,
    perPage = DEFAULT_JOBS_PER_SECTION,
    location = "",
  } = args;
  const normalizedLocation = location.trim();
  const key = jobCacheKey({ term, page, perPage, location: normalizedLocation });
  const cachedJobs = getCachedJobs(key);
  if (cachedJobs) {
    return cachedJobs;
  }

  const staleJobs = JOB_CACHE.get(key)?.data ?? null;
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return staleJobs ?? [];
  }

  try {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/us/search/${page}`);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("results_per_page", String(perPage));
    url.searchParams.set("what", term);
    url.searchParams.set("sort_by", "date");
    if (normalizedLocation) {
      url.searchParams.set("where", normalizedLocation);
    }

    const res = await fetchWithRetry(url.toString(), 2);
    if (!res.ok) {
      throw new Error(`Adzuna failed (${res.status})`);
    }

    const data = await res.json();
    const jobs: Job[] = (data.results ?? [])
      .filter((item: any) => isRecentPosting(item.created))
      .slice(0, perPage)
      .map((item: any, index: number) => {
        const id = String(item.id ?? `fallback-${term}-${index}`);

        return {
          id,
          title: cleanText(item.title) || "Untitled role",
          company: cleanText(item.company?.display_name) || "Unknown company",
          location: cleanText(item.location?.display_name) || "Unknown location",
          posted: String(item.created ?? ""),
          jobUrl: cleanText(item.redirect_url),
          salary: formatSalary(item),
          description: cleanText(item.description, 240) || undefined,
          detailsHref: `/jobs/details/${id}`,
        };
      });

    JOB_CACHE.set(key, {
      data: jobs,
      timestamp: Date.now(),
    });

    return jobs;
  } catch (error) {
    console.error(`Adzuna home feed fetch failed for "${term}":`, error);
    return staleJobs ?? [];
  }
}

const ATS_JOB_SOURCES: JobSearchSource[] = [
  {
    name: "adzuna",
    searchJobs: ({ term, page, perPage, location }) =>
      getJobsFromAdzuna({ term, page, perPage, location }),
  },
];

async function getUniqueJobsForTerm(args: {
  term: string;
  targetCount?: number;
  sources?: JobSearchSource[];
  excludedKeys?: Set<string>;
  location?: string;
}) {
  const {
    term,
    targetCount = DEFAULT_JOBS_PER_SECTION,
    sources = ATS_JOB_SOURCES,
    excludedKeys = new Set<string>(),
    location = "",
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
        location,
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
  const location = (url.searchParams.get("location") ?? "").trim();

  const globalCached = getGlobalCache(key);
  if (globalCached) {
    return NextResponse.json({ ...globalCached, cached: true }, { status: 200 });
  }

  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, max-age=30" },
    });
  }

  const existing = IN_FLIGHT.get(key);
  if (existing) {
    try {
      const payload = await existing;
      return NextResponse.json(payload, {
        headers: { "X-Cache": "IN-FLIGHT", "Cache-Control": "public, max-age=10" },
      });
    } catch {
      // fall through to the request path below
    }
  }

  const promise = (async (): Promise<Payload> => {
    const healthTerm = (url.searchParams.get("health") ?? "healthcare").trim();
    const techTerm = (url.searchParams.get("tech") ?? "software engineer").trim();
    const tradeTerm = (url.searchParams.get("trade") ?? "electrician OR plumber").trim();
    const financeTerm = (url.searchParams.get("finance") ?? "finance").trim();

    const allSeenKeys = new Set<string>();

    const healthcareJobs = await getUniqueJobsForTerm({
      term: healthTerm,
      targetCount: DEFAULT_JOBS_PER_SECTION,
      excludedKeys: allSeenKeys,
      location,
    });
    healthcareJobs.forEach((job) => allSeenKeys.add(dedupeKey(job)));

    const technologyJobs = await getUniqueJobsForTerm({
      term: techTerm,
      targetCount: DEFAULT_JOBS_PER_SECTION,
      excludedKeys: allSeenKeys,
      location,
    });
    technologyJobs.forEach((job) => allSeenKeys.add(dedupeKey(job)));

    const skilledTradeJobs = await getUniqueJobsForTerm({
      term: tradeTerm,
      targetCount: DEFAULT_JOBS_PER_SECTION,
      excludedKeys: allSeenKeys,
      location,
    });

    const financeJobs = await getUniqueJobsForTerm({
      term: financeTerm,
      targetCount: DEFAULT_JOBS_PER_SECTION,
      excludedKeys: allSeenKeys,
      location,
    });

    return {
      sections: [
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
        {
          name: "Finance",
          viewAllHref: `/jobs?cat=finance&q=${encodeURIComponent(financeTerm)}`,
          jobs: financeJobs,
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  })();

  IN_FLIGHT.set(key, promise);

  try {
    const payload = await promise;
    const payloadHasJobs = hasJobs(payload);

    if (payloadHasJobs) {
      CACHE.set(key, {
        expiresAt: now + 30_000,
        staleUntil: now + 5 * 60_000,
        payload,
      });
      setGlobalCache(key, payload);
    }

    return NextResponse.json(payload, {
      headers: {
        "X-Cache": payloadHasJobs ? "MISS" : "MISS-DEGRADED",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (error) {
    console.error("Adzuna route error:", error);

    if (cached && cached.staleUntil > now) {
      return NextResponse.json(cached.payload, {
        headers: { "X-Cache": "STALE", "Cache-Control": "public, max-age=10" },
      });
    }

    return NextResponse.json(emptyPayload("Job provider temporarily unavailable"), {
      status: 200,
    });
  } finally {
    IN_FLIGHT.delete(key);
  }
}
