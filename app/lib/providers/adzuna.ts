import type { Job } from "../jobs/types";

type AdzunaSearchResponse = {
  results: Array<{
    id: string | number;
    title: string;
    created: string;
    redirect_url?: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
    salary_min?: number;
    salary_max?: number;
    description?: string;
  }>;
};

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const CACHE_TTL = 5 * 60 * 1000;
const jobCache = new Map<string, CacheEntry<Job[]>>();

function getCachedJobs(cacheKey: string) {
  const cached = jobCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  return null;
}

function cleanText(value: unknown, maxLength?: number) {
  if (typeof value !== "string") return "";

  const text = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function moneyRange(min?: number, max?: number) {
  if (!min && !max) return undefined;
  if (min && max) return `$${Math.round(min).toLocaleString()} - $${Math.round(max).toLocaleString()} / year`;
  if (min) return `From $${Math.round(min).toLocaleString()} / year`;
  return `Up to $${Math.round(max!).toLocaleString()} / year`;
}

function formatPosted(iso?: string) {
  if (!iso) return "Recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";

  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  if (days < 30) return `Posted ${days} days ago`;
  return "Posted 30+ days ago";
}

export async function fetchAdzunaJobs(args: {
  query: string;
  page: number;
  limit: number;
}): Promise<Job[]> {
  const { query, page, limit } = args;
  const cacheKey = `${query.trim().toLowerCase()}|${page}|${limit}`;
  const cachedJobs = getCachedJobs(cacheKey);
  if (cachedJobs) {
    return cachedJobs;
  }

  const staleJobs = jobCache.get(cacheKey)?.data ?? null;
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return staleJobs ?? [];
  }

  try {
    const params = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      results_per_page: String(limit),
      what: query,
      "content-type": "application/json",
    });

    const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Adzuna error ${res.status}`);
    }

    const data = (await res.json()) as AdzunaSearchResponse;
    const jobs: Job[] = (data.results ?? []).map((result) => ({
      id: `adzuna:${result.id}`,
      source: "adzuna",
      title: cleanText(result.title) || "Untitled role",
      company: cleanText(result.company?.display_name) || "Unknown",
      location: cleanText(result.location?.display_name) || "Unknown",
      posted: formatPosted(result.created),
      salary: moneyRange(result.salary_min, result.salary_max),
      description: cleanText(result.description, 240) || undefined,
      jobUrl: cleanText(result.redirect_url) || undefined,
    }));

    jobCache.set(cacheKey, {
      data: jobs,
      timestamp: Date.now(),
    });

    return jobs;
  } catch (error) {
    console.error("Adzuna jobs fetch failed:", error);
    return staleJobs ?? [];
  }
}

export async function fetchAdzunaJobDetails(
  fullId: string,
  origin: string
): Promise<Job | null> {
  const [, providerId] = fullId.split(":");
  if (!providerId) return null;

  const res = await fetch(
    `${origin}/api/adzuna/details?id=${encodeURIComponent(providerId)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Adzuna details failed: ${res.status} :: ${body}`);
  }

  const data = await res.json();

  return {
    id: `adzuna:${providerId}`,
    source: "adzuna",
    title: data.title ?? "Untitled role",
    company: data.company ?? "Unknown company",
    location: data.location ?? "Unknown location",
    posted: data.posted ?? "Recently",
    salary: data.salary,
    jobUrl: data.jobUrl,
    description: data.description ?? "",
  };
}
