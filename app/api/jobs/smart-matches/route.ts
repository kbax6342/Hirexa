import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSmartMatchSearchConfigForUser,
  type SmartMatchSearchConfig,
} from "@/app/lib/jobs/smartMatchSearch";
import type { Job } from "@/app/lib/jobs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Cursor = {
  variantIndex: number;
  page: number;
};

type SearchVariant = {
  query: string;
  location: string;
  strategy:
    | "title"
    | "title-keywords"
    | "skills"
    | "remote"
    | "fallback-location"
    | "fallback-broad";
};

type SmartMatchesApiResponse = {
  jobs: Job[];
  nextCursor: string;
  meta: {
    query: string;
    preferredLocation: string | null;
    includeRemote: boolean;
    expanded: boolean;
    usedVariants: Array<{
      query: string;
      location: string | null;
      page: number;
      strategy: SearchVariant["strategy"];
      results: number;
      uniqueResults: number;
    }>;
  };
};

type GreenhouseApiJob = {
  sourceId: string;
  title: string;
  companyLabel: string;
  location: string | null;
  updatedAt: string | null;
  absoluteUrl: string;
  department: string | null;
};

type GreenhouseApiResponse = {
  jobs?: GreenhouseApiJob[];
};

type AdzunaApiJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  description?: string;
  salary?: string;
};

type AdzunaApiResponse = {
  jobs?: AdzunaApiJob[];
};

type ProviderJob = Job & {
  sortTimestamp: number;
  relevanceScore: number;
  dedupeKey: string;
};

type ProviderFetchResult = {
  job: Job;
  rawTimestamp?: string | null;
};

const DEFAULT_LIMIT = 20;
const MIN_VARIANT_RESULTS = 10;
const postedDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const TITLE_NOISE_WORDS = new Set([
  "sr",
  "senior",
  "jr",
  "junior",
  "lead",
  "principal",
  "staff",
  "ii",
  "iii",
  "iv",
  "contract",
  "temporary",
]);

function decodeCursor(raw: string | null): Cursor {
  if (!raw) return { variantIndex: 0, page: 1 };

  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<Cursor>;

    return {
      variantIndex:
        typeof parsed.variantIndex === "number" && parsed.variantIndex >= 0
          ? parsed.variantIndex
          : 0,
      page: typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : 1,
    };
  } catch {
    return { variantIndex: 0, page: 1 };
  }
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawValue of values) {
    const value = rawValue?.trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(value);
  }

  return result;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simplifyTitle(title: string) {
  const tokens = normalizeText(title)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !TITLE_NOISE_WORDS.has(token));

  if (tokens.length === 0) return "";
  return dedupeStrings([tokens.slice(0, 4).join(" "), tokens.slice(-3).join(" ")])[0] ?? "";
}

function buildSearchVariants(config: SmartMatchSearchConfig): SearchVariant[] {
  const exactTitles = dedupeStrings(config.jobTitles).slice(0, 4);
  const titleKeywords = dedupeStrings(exactTitles.map((title) => simplifyTitle(title))).slice(0, 3);
  const skillQueries = dedupeStrings(config.skillTerms).slice(0, 4);

  const primaryLocations = dedupeStrings([
    config.preferredLocation,
    ...config.locationOptions,
  ]).slice(0, 2);

  const focusedLocations = primaryLocations.length > 0 ? primaryLocations : [""];
  const remoteAwareLocations = dedupeStrings([
    focusedLocations[0],
    config.includeRemote ? "remote" : null,
    "",
  ]);

  const variants: SearchVariant[] = [];
  const seen = new Set<string>();

  const pushVariant = (variant: SearchVariant) => {
    const query = variant.query.trim() || "jobs";
    const location = variant.location.trim();
    const key = `${query.toLowerCase()}|${location.toLowerCase()}|${variant.strategy}`;
    if (seen.has(key)) return;

    seen.add(key);
    variants.push({ ...variant, query, location });
  };

  for (const title of exactTitles) {
    for (const location of focusedLocations) {
      pushVariant({ query: title, location, strategy: "title" });
    }
  }

  for (const query of titleKeywords) {
    pushVariant({
      query,
      location: focusedLocations[0] ?? "",
      strategy: "title-keywords",
    });
  }

  for (const query of skillQueries) {
    for (const location of remoteAwareLocations.slice(0, 2)) {
      pushVariant({ query, location, strategy: "skills" });
    }
  }

  if (config.includeRemote) {
    pushVariant({
      query: exactTitles[0] ?? titleKeywords[0] ?? skillQueries[0] ?? "jobs",
      location: "remote",
      strategy: "remote",
    });
  }

  pushVariant({
    query: exactTitles[0] ?? skillQueries[0] ?? "jobs",
    location: focusedLocations[0] ?? "",
    strategy: "fallback-location",
  });

  if (config.includeRemote) {
    pushVariant({
      query: "jobs",
      location: "remote",
      strategy: "fallback-broad",
    });
  }

  pushVariant({
    query: "jobs",
    location: "",
    strategy: "fallback-broad",
  });

  return variants.length > 0
    ? variants
    : [{ query: "jobs", location: "", strategy: "fallback-broad" }];
}

function buildProviderFallbackVariants(variant: SearchVariant): SearchVariant[] {
  const simplifiedQuery = simplifyTitle(variant.query);
  const candidates: SearchVariant[] = [
    variant,
    variant.location ? { ...variant, location: "" } : null,
    simplifiedQuery && simplifiedQuery !== variant.query
      ? { ...variant, query: simplifiedQuery }
      : null,
    simplifiedQuery && simplifiedQuery !== variant.query
      ? { ...variant, query: simplifiedQuery, location: "" }
      : null,
    variant.query.toLowerCase() !== "jobs"
      ? {
          query: "jobs",
          location: variant.location.toLowerCase() === "remote" ? "remote" : "",
          strategy: "fallback-broad",
        }
      : null,
    {
      query: "jobs",
      location: "",
      strategy: "fallback-broad",
    },
  ].filter((value): value is SearchVariant => Boolean(value));

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.query.toLowerCase()}|${candidate.location.toLowerCase()}|${candidate.strategy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatPostedDate(iso: string | null | undefined) {
  if (!iso) return "";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  return postedDateFormatter.format(new Date(parsed));
}

function normalizeUrl(url: string | undefined) {
  if (!url) return "";

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

function buildDedupeKey(job: Pick<Job, "jobUrl" | "title" | "company" | "location">) {
  const normalizedUrl = normalizeUrl(job.jobUrl);
  if (normalizedUrl) return normalizedUrl;

  return normalizeText(`${job.title} ${job.company} ${job.location}`);
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildRelevanceScore(job: Job, query: string) {
  const tokens = dedupeStrings(normalizeText(query).split(" "));
  if (tokens.length === 0) return 0;

  const title = normalizeText(job.title);
  const company = normalizeText(job.company);
  const location = normalizeText(job.location);
  const description = normalizeText(job.description ?? "");

  let score = 0;

  for (const token of tokens) {
    if (!token) continue;
    if (title.includes(token)) score += 8;
    if (company.includes(token)) score += 3;
    if (location.includes(token)) score += 2;
    if (description.includes(token)) score += 1;
  }

  if (tokens.length > 1 && title.includes(tokens.join(" "))) {
    score += 10;
  }

  return score;
}

function toProviderJob(job: Job, query: string, rawTimestamp?: string | null): ProviderJob {
  return {
    ...job,
    dedupeKey: buildDedupeKey(job),
    sortTimestamp: parseTimestamp(rawTimestamp ?? job.posted),
    relevanceScore: buildRelevanceScore(job, query),
  };
}

function sortProviderJobs(jobs: ProviderJob[]) {
  return [...jobs].sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }

    if (b.sortTimestamp !== a.sortTimestamp) {
      return b.sortTimestamp - a.sortTimestamp;
    }

    return a.title.localeCompare(b.title);
  });
}

function mergeProviderJobs(providerLists: ProviderJob[][], limit: number): Job[] {
  const seenKeys = new Set<string>();
  const merged: Job[] = [];

  for (const jobs of providerLists) {
    for (const nextJob of jobs) {
      if (!nextJob?.id || seenKeys.has(nextJob.dedupeKey)) {
        continue;
      }

      seenKeys.add(nextJob.dedupeKey);
      const { sortTimestamp, relevanceScore, dedupeKey, ...job } = nextJob;
      merged.push(job);

      if (merged.length >= limit) {
        return merged;
      }
    }
  }

  return merged;
}

async function fetchGreenhouseJobs(
  origin: string,
  variant: SearchVariant,
  page: number,
  limit: number
): Promise<ProviderFetchResult[]> {
  const url = new URL("/api/jobs/greenhouse", origin);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(Math.max(0, page - 1) * limit));

  if (variant.query && variant.query.toLowerCase() !== "jobs") {
    url.searchParams.set("q", variant.query);
  }

  if (variant.location) {
    url.searchParams.set("location", variant.location);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as GreenhouseApiResponse;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];

  return jobs.map((job) => ({
    rawTimestamp: job.updatedAt,
    job: {
      id: job.sourceId,
      source: "greenhouse",
      title: job.title ?? "Untitled role",
      company: job.companyLabel ?? "Unknown company",
      location: job.location ?? "Unknown location",
      posted: formatPostedDate(job.updatedAt),
      description: job.department ? `Department: ${job.department}` : undefined,
      jobUrl: job.absoluteUrl ?? undefined,
    },
  }));
}

async function fetchAdzunaJobs(
  origin: string,
  variant: SearchVariant,
  page: number,
  limit: number
): Promise<ProviderFetchResult[]> {
  const url = new URL("/api/adzuna/search", origin);
  url.searchParams.set("q", variant.query || "jobs");
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(limit));

  if (variant.location) {
    url.searchParams.set("location", variant.location);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as AdzunaApiResponse;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];

  return jobs.map((job) => ({
    rawTimestamp: job.posted,
    job: {
      id: `adzuna:${job.id}`,
      source: "adzuna",
      title: job.title ?? "Untitled role",
      company: job.company ?? "Unknown company",
      location: job.location ?? "Unknown location",
      posted: formatPostedDate(job.posted) || "Recently",
      salary: job.salary,
      description: job.description,
      jobUrl: job.jobUrl ?? undefined,
    },
  }));
}

async function fetchVariantJobs(
  origin: string,
  variant: SearchVariant,
  page: number,
  limit: number
) {
  const providerVariants = buildProviderFallbackVariants(variant);

  const fetchProviderWithFallback = async (
    provider: "greenhouse" | "adzuna",
    fetcher: (providerVariant: SearchVariant) => Promise<ProviderFetchResult[]>
  ) => {
    for (const providerVariant of providerVariants) {
      const jobs = await fetcher(providerVariant);
      if (jobs.length > 0) {
        if (
          providerVariant.query !== variant.query ||
          providerVariant.location !== variant.location
        ) {
          console.log("[SMART_MATCHES] provider fallback", {
            provider,
            fromQuery: variant.query,
            fromLocation: variant.location || null,
            toQuery: providerVariant.query,
            toLocation: providerVariant.location || null,
            page,
            results: jobs.length,
          });
        }
        return sortProviderJobs(
          jobs.map(({ job, rawTimestamp }) =>
            toProviderJob(job, providerVariant.query, rawTimestamp)
          )
        );
      }
    }

    return [] as ProviderJob[];
  };

  const [greenhouseJobs, adzunaJobs] = await Promise.all([
    fetchProviderWithFallback("greenhouse", (providerVariant) =>
      fetchGreenhouseJobs(origin, providerVariant, page, limit)
    ),
    fetchProviderWithFallback("adzuna", (providerVariant) =>
      fetchAdzunaJobs(origin, providerVariant, page, limit)
    ),
  ]);

  const orderedJobs = mergeProviderJobs([greenhouseJobs, adzunaJobs], limit);

  console.log("[SMART_MATCHES] ordered results", {
    query: variant.query,
    location: variant.location || null,
    page,
    greenhouse: greenhouseJobs.length,
    adzuna: adzunaJobs.length,
    returned: orderedJobs.length,
  });

  return orderedJobs;
}

async function fetchLastResortJobs(origin: string, limit: number): Promise<Job[]> {
  const url = new URL("/api/jobs", origin);
  url.searchParams.set("q", "jobs");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { jobs?: Job[] };
  return Array.isArray(data.jobs)
    ? mergeProviderJobs(
        [
          sortProviderJobs(
            data.jobs
              .filter((job) => job.source === "greenhouse")
              .map((job) => toProviderJob(job, "jobs", job.posted))
          ),
          sortProviderJobs(
            data.jobs
              .filter((job) => job.source === "adzuna")
              .map((job) => toProviderJob(job, "jobs", job.posted))
          ),
          sortProviderJobs(
            data.jobs
              .filter(
                (job) => job.source !== "greenhouse" && job.source !== "adzuna"
              )
              .map((job) => toProviderJob(job, "jobs", job.posted))
          ),
        ],
        limit
      )
    : [];
}

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const searchConfig = userId
    ? await getSmartMatchSearchConfigForUser(userId)
    : {
        searchQuery: "jobs",
        jobTitles: [],
        skillTerms: [],
        preferredLocation: null,
        locationOptions: [],
        includeRemote: true,
      };

  const url = new URL(request.url);
  const limit = Math.max(
    10,
    Math.min(Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT), 30)
  );
  const origin = url.origin;
  const variants = buildSearchVariants(searchConfig);
  const initialCursor = decodeCursor(url.searchParams.get("cursor"));

  let variantIndex = Math.min(initialCursor.variantIndex, variants.length - 1);
  let page = Math.max(initialCursor.page, 1);
  let jobs: Job[] = [];
  const seen = new Set<string>();
  const usedVariants: SmartMatchesApiResponse["meta"]["usedVariants"] = [];
  const maxAttempts = Math.max(variants.length, 4);

  for (let attempt = 0; attempt < maxAttempts && jobs.length < limit; attempt += 1) {
    const currentVariant = variants[Math.min(variantIndex, variants.length - 1)];
    const batch = await fetchVariantJobs(origin, currentVariant, page, limit);
    const uniqueBatch = batch.filter((job) => {
      if (!job?.id || seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });

    jobs = [...jobs, ...uniqueBatch].slice(0, limit);
    usedVariants.push({
      query: currentVariant.query,
      location: currentVariant.location || null,
      page,
      strategy: currentVariant.strategy,
      results: batch.length,
      uniqueResults: uniqueBatch.length,
    });

    const isLastVariant = variantIndex >= variants.length - 1;
    const strongBatch = uniqueBatch.length >= Math.min(MIN_VARIANT_RESULTS, limit);

    if (strongBatch || (batch.length > 0 && jobs.length >= limit)) {
      page += 1;
      break;
    }

    if (isLastVariant) {
      page += 1;
      break;
    }

    variantIndex += 1;
    page = 1;
  }

  if (jobs.length === 0) {
    jobs = await fetchLastResortJobs(origin, limit);
    variantIndex = variants.length - 1;
    page = 2;
  }

  return NextResponse.json({
    jobs,
    nextCursor: encodeCursor({ variantIndex, page }),
    meta: {
      query: searchConfig.searchQuery,
      preferredLocation: searchConfig.preferredLocation,
      includeRemote: searchConfig.includeRemote,
      expanded: usedVariants.length > 1,
      usedVariants,
    },
  } satisfies SmartMatchesApiResponse);
}
