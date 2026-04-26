import type { Job, JobDetail } from "../jobs/types";

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
    salary_is_predicted?: boolean | number | string;
    description?: string;
  }>;
};

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const CACHE_TTL = 5 * 60 * 1000;
const RECENT_POSTING_DAYS = 7;
const ADZUNA_NUMERIC_ID_PATTERN = /^\d+$/;
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

function isPredictedSalary(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function moneyRange(min?: number, max?: number, predicted?: unknown) {
  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);

  if (!hasMin && !hasMax) return undefined;

  const estimatedSuffix = isPredictedSalary(predicted) ? " - estimated" : "";

  if (hasMin && hasMax) {
    const roundedMin = Math.round(min);
    const roundedMax = Math.round(max);

    if (roundedMin === roundedMax) {
      return `$${roundedMin.toLocaleString()} / year${estimatedSuffix}`;
    }

    return `$${roundedMin.toLocaleString()} - $${roundedMax.toLocaleString()} / year${estimatedSuffix}`;
  }

  if (hasMin) return `From $${Math.round(min).toLocaleString()} / year${estimatedSuffix}`;
  return `Up to $${Math.round(max!).toLocaleString()} / year${estimatedSuffix}`;
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

function isRecentPosting(iso?: string, maxAgeDays = RECENT_POSTING_DAYS) {
  if (!iso) return false;

  const postedAt = new Date(iso);
  if (Number.isNaN(postedAt.getTime())) return false;

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return Date.now() - postedAt.getTime() <= maxAgeMs;
}

function extractPlainNumericAdzunaId(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  const firstSegment = normalized
    .split("::")
    .map((part) => part.trim())
    .find(Boolean);
  if (!firstSegment) return null;

  return ADZUNA_NUMERIC_ID_PATTERN.test(firstSegment) ? firstSegment : null;
}

function looksLikeEncodedAdzunaProviderId(value: string) {
  const normalized = value.trim();
  if (!normalized || ADZUNA_NUMERIC_ID_PATTERN.test(normalized)) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(normalized);
}

function resolveAdzunaProviderIdWithMeta(rawProviderId: string): {
  providerId: string;
  decodingUsed: boolean;
} {
  const normalizedRawProviderId = rawProviderId.trim();
  if (!normalizedRawProviderId) {
    return {
      providerId: "",
      decodingUsed: false,
    };
  }

  const directNumericId = extractPlainNumericAdzunaId(normalizedRawProviderId);
  if (directNumericId) {
    return {
      providerId: directNumericId,
      decodingUsed: false,
    };
  }

  if (!looksLikeEncodedAdzunaProviderId(normalizedRawProviderId)) {
    return {
      providerId: normalizedRawProviderId,
      decodingUsed: false,
    };
  }

  try {
    const decoded = Buffer.from(normalizedRawProviderId, "base64url").toString("utf8");
    if (!decoded || /[\u0000-\u001F\u007F\uFFFD]/.test(decoded)) {
      return {
        providerId: normalizedRawProviderId,
        decodingUsed: false,
      };
    }

    const decodedNumericId = extractPlainNumericAdzunaId(decoded);
    if (!decodedNumericId) {
      return {
        providerId: normalizedRawProviderId,
        decodingUsed: false,
      };
    }

    return {
      providerId: decodedNumericId,
      decodingUsed: true,
    };
  } catch {
    return {
      providerId: normalizedRawProviderId,
      decodingUsed: false,
    };
  }
}

// Examples:
// resolveAdzunaProviderId("5711084570") => "5711084570"
// resolveAdzunaProviderId(Buffer.from("5711084570::adzuna", "utf8").toString("base64url")) => "5711084570"
// resolveAdzunaProviderId("bad-garbage") => "bad-garbage"
export function resolveAdzunaProviderId(rawProviderId: string): string {
  return resolveAdzunaProviderIdWithMeta(rawProviderId).providerId;
}

export async function fetchAdzunaJobs(args: {
  query: string;
  page: number;
  limit: number;
  location?: string;
}): Promise<Job[]> {
  const { query, page, limit, location } = args;
  const normalizedLocation = location?.trim() ?? "";
  const cacheKey = `recent-${RECENT_POSTING_DAYS}|${query
    .trim()
    .toLowerCase()}|${normalizedLocation.toLowerCase()}|${page}|${limit}`;
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
      sort_by: "date",
      "content-type": "application/json",
    });
    if (normalizedLocation) {
      params.set("where", normalizedLocation);
    }

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
    const jobs: Job[] = (data.results ?? [])
      .filter((result) => isRecentPosting(result.created))
      .map((result) => ({
        id: `adzuna:${result.id}`,
        source: "adzuna",
        title: cleanText(result.title) || "Untitled role",
        company: cleanText(result.company?.display_name) || "Unknown",
        location: cleanText(result.location?.display_name) || "Unknown",
        posted: formatPosted(result.created),
        salary: moneyRange(
          result.salary_min,
          result.salary_max,
          result.salary_is_predicted
        ),
        salaryIsEstimated: isPredictedSalary(result.salary_is_predicted),
        description: cleanText(result.description) || undefined,
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
): Promise<JobDetail | null> {
  const [, rawProviderId] = fullId.split(":", 2);
  const { providerId, decodingUsed } = resolveAdzunaProviderIdWithMeta(
    rawProviderId ?? "",
  );

  if (!providerId) return null;

  const res = await fetch(
    `${origin}/api/adzuna/details?id=${encodeURIComponent(providerId)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    const body = await res.text();
    console.warn("[ADZUNA_DETAILS] provider detail request failed", {
      rawProviderId: rawProviderId?.trim() ?? "",
      providerId,
      resolvedProviderId: providerId,
      decodingUsed,
      route: "/api/adzuna/details",
      status: res.status,
      fallbackPath: "detail-resolver",
      bodySnippet: body.slice(0, 160),
    });
    throw new Error(`Adzuna details failed: ${res.status} :: ${body}`);
  }

  const data = await res.json();
  const rawDescription =
    typeof data.rawDescription === "string"
      ? data.rawDescription
      : typeof data.content === "string"
        ? data.content
        : typeof data.descriptionText === "string"
          ? data.descriptionText
          : typeof data.description === "string"
            ? data.description
            : null;

  return {
    id: `adzuna:${providerId}`,
    source: "adzuna",
    title: data.title ?? "Untitled role",
    company: data.company ?? data.companyName ?? "Unknown company",
    location: data.location ?? "Unknown location",
    posted: data.posted ?? "Recently",
    remote:
      data.remote === "Remote" ||
      /remote/i.test(String(data.remote ?? "")) ||
      /remote/i.test(String(data.location ?? ""))
        ? true
        : undefined,
    salary: data.salary ?? data.compensation ?? undefined,
    salaryText: data.salaryText ?? data.salary ?? data.compensation ?? null,
    salaryMin:
      typeof data.salaryMin === "number" ? data.salaryMin : null,
    salaryMax:
      typeof data.salaryMax === "number" ? data.salaryMax : null,
    salaryIsEstimated: Boolean(data.salaryIsEstimated),
    employmentType: data.employmentType ?? data.schedule ?? null,
    category:
      typeof data.category === "string"
        ? data.category
        : typeof data.metadata?.category === "string"
          ? data.metadata.category
          : null,
    jobUrl: data.jobUrl ?? data.detailsUrl ?? data.url,
    applyUrl: data.applyUrl ?? data.jobUrl ?? data.detailsUrl ?? data.url ?? null,
    externalUrl:
      data.externalUrl ?? data.jobUrl ?? data.detailsUrl ?? data.url ?? null,
    description: data.descriptionText ?? data.description ?? rawDescription ?? "",
    descriptionIntro: Array.isArray(data.descriptionIntro)
      ? data.descriptionIntro.filter((value: unknown) => typeof value === "string")
      : null,
    descriptionHtml: data.descriptionHtml ?? null,
    contentHtml: data.contentHtml ?? data.descriptionHtml ?? null,
    content: data.content ?? rawDescription ?? data.descriptionText ?? data.description ?? null,
    descriptionPlain: rawDescription ?? data.descriptionText ?? data.description ?? null,
    summary: data.summary ?? rawDescription ?? data.descriptionText ?? data.description ?? null,
    snippet: data.snippet ?? rawDescription ?? data.descriptionText ?? data.description ?? null,
    duties: Array.isArray(data.responsibilities)
      ? data.responsibilities.filter((value: unknown) => typeof value === "string")
      : [],
    requirements: Array.isArray(data.qualifications)
      ? data.qualifications.filter((value: unknown) => typeof value === "string")
      : [],
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? data.metadata
        : {
            source: "Adzuna",
            category:
              typeof data.category === "string" ? data.category : null,
            postedLabel:
              typeof data.postedLabel === "string" ? data.postedLabel : null,
            remote:
              typeof data.remote === "string" ? data.remote : null,
          },
  };
}
