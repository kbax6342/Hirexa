import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdzunaJob = {
  id: string | number;
  title?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  created?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
};

type JobCard = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  description?: string;
  pill?: string;
  logoText: string;
};

type LocationSection = {
  name: string;
  href: string;
  jobs: JobCard[];
};

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const CACHE_TTL = 5 * 60 * 1000;
const jobCache = new Map<string, CacheEntry<JobCard[]>>();

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

function money(n?: number) {
  if (typeof n !== "number") return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPosted(iso?: string) {
  if (!iso) return "Recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";
  const diffMs = Date.now() - d.getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  return `Posted ${days} days ago`;
}

function normalizeLocationFromAdzuna(job: AdzunaJob) {
  return cleanText(job.location?.display_name) || "United States";
}

function salaryPill(job: AdzunaJob) {
  const min = job.salary_min;
  const max = job.salary_max;
  if (typeof min === "number" && typeof max === "number") {
    return `$${money(min)} - $${money(max)} / year`;
  }
  if (typeof min === "number") return `From $${money(min)} / year`;
  if (typeof max === "number") return `Up to $${money(max)} / year`;
  return undefined;
}

function toJobCard(job: AdzunaJob): JobCard | null {
  const title = cleanText(job.title);
  const company = cleanText(job.company?.display_name) || "Unknown";
  const jobUrl = cleanText(job.redirect_url);

  if (!title || !jobUrl) return null;

  return {
    id: String(job.id),
    title,
    company,
    location: normalizeLocationFromAdzuna(job),
    posted: formatPosted(job.created),
    jobUrl,
    description: cleanText(job.description, 180) || undefined,
    pill: salaryPill(job),
    logoText: company.slice(0, 1).toUpperCase(),
  };
}

async function fetchAdzunaByState(params: {
  stateName: string;
  resultsPerSection: number;
}) {
  const { stateName, resultsPerSection } = params;
  const cacheKey = `${stateName.trim().toLowerCase()}|${resultsPerSection}`;
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
    const url = new URL("https://api.adzuna.com/v1/api/jobs/us/search/1");
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("results_per_page", String(resultsPerSection));
    url.searchParams.set("sort_by", "date");
    url.searchParams.set("where", stateName);

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Adzuna error ${res.status}`);
    }

    const data = (await res.json()) as { results?: AdzunaJob[] };
    const jobs = (data.results ?? [])
      .map(toJobCard)
      .filter(Boolean)
      .slice(0, resultsPerSection) as JobCard[];

    jobCache.set(cacheKey, {
      data: jobs,
      timestamp: Date.now(),
    });

    return jobs;
  } catch (error) {
    console.error(`Adzuna by-location fetch failed for ${stateName}:`, error);
    return staleJobs ?? [];
  }
}

export async function GET(request: Request) {
  const generatedAt = new Date().toISOString();

  try {
    const url = new URL(request.url);
    const statesParam = url.searchParams.get("states") ?? "California,Texas,Florida";
    const n = Number(url.searchParams.get("n") ?? "3");
    const resultsPerSection = Number.isFinite(n) && n > 0 && n <= 10 ? n : 3;

    const stateNames = statesParam
      .split(",")
      .map((stateName) => stateName.trim())
      .filter(Boolean);

    const sections = await Promise.all(
      stateNames.map(async (stateName) => ({
        name: stateName,
        href: `/jobs?state=${encodeURIComponent(stateName)}`,
        jobs: await fetchAdzunaByState({ stateName, resultsPerSection }),
      }))
    );

    return NextResponse.json(
      {
        ok: true,
        sections,
        generatedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("by-location route error:", error);
    return NextResponse.json(
      {
        ok: false,
        sections: [] as LocationSection[],
        generatedAt,
        error: "Job provider temporarily unavailable",
      },
      { status: 200 }
    );
  }
}
