import type { Job, JobSource } from "../types";

export type SourceFetchArgs = {
  query?: string;
  location?: string;
  page?: number;
  limit?: number;
  includeRemote?: boolean;
  skipLocalMatch?: boolean;
};

const DEFAULT_SOURCE_TIMEOUT_MS = 8000;
export const ATS_SOURCE_TIMEOUT_MS = 3000;
const QA_QUERY_VARIANTS = [
  "qa",
  "quality assurance",
  "qa engineer",
  "test engineer",
  "sdet",
  "software development engineer in test",
  "automation tester",
  "software tester",
  "cypress io",
];

export function parseCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function humanizeSlug(value: string) {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

export function decodeBasicHtmlEntities(value: string) {
  return value.replace(
    /&nbsp;|&amp;|&quot;|&#39;|&apos;|&lt;|&gt;/g,
    (entity) => HTML_ENTITY_MAP[entity] ?? entity
  );
}

export function summarizeHtmlText(value: unknown, maxLength = 220) {
  if (typeof value !== "string") return "";

  const plainText = decodeBasicHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) return "";
  if (plainText.length <= maxLength) return plainText;

  return `${plainText.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function buildJobId(source: JobSource, ...parts: Array<string | number | null | undefined>) {
  const body = parts.map((part) => String(part ?? "")).join("::");
  return `${source}:${Buffer.from(body, "utf8").toString("base64url")}`;
}

export function formatPostedLabel(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Recently";

  const parsed =
    typeof value === "number"
      ? new Date(value)
      : /^\d+$/.test(String(value))
        ? new Date(Number(value))
        : new Date(String(value));

  if (Number.isNaN(parsed.getTime())) return "Recently";

  const diffMs = Date.now() - parsed.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  if (days < 30) return `Posted ${days} days ago`;
  return "Posted 30+ days ago";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandQueryVariants(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const looksLikeQaQuery = QA_QUERY_VARIANTS.some((term) => normalized.includes(term));
  return looksLikeQaQuery ? [normalized, ...QA_QUERY_VARIANTS] : [normalized];
}

function isRemoteFriendlyJob(job: Job) {
  return (
    job.source === "remotive" ||
    job.source === "remoteok" ||
    normalizeText(job.location).includes("remote")
  );
}

function buildSearchableText(job: Job) {
  return normalizeText(
    [
      job.title,
      job.company,
      job.location,
      job.description,
      job.searchText,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function matchesQuery(job: Job, args: SourceFetchArgs) {
  const query = (args.query ?? "").trim().toLowerCase();
  if (!query) return true;

  const queryVariants = expandQueryVariants(query);
  const searchableText = buildSearchableText(job);

  return queryVariants.some((variant) => searchableText.includes(variant));
}

function matchesLocation(job: Job, args: SourceFetchArgs) {
  const location = (args.location ?? "").trim().toLowerCase();
  const includeRemote = args.includeRemote !== false;
  const isRemoteJob = isRemoteFriendlyJob(job);

  if (!location) {
    return includeRemote || !isRemoteJob;
  }

  return (
    job.location.toLowerCase().includes(location) ||
    (includeRemote && isRemoteJob)
  );
}

export function matchesSearch(job: Job, args: SourceFetchArgs) {
  return matchesQuery(job, args) && matchesLocation(job, args);
}

export function filterJobs(jobs: Job[], args: SourceFetchArgs) {
  return jobs.filter((job) => matchesSearch(job, args));
}

export function applyJobMatchStages(jobs: Job[], args: SourceFetchArgs) {
  const queryMatchedJobs = jobs.filter((job) => matchesQuery(job, args));
  const locationMatchedJobs = queryMatchedJobs.filter((job) =>
    matchesLocation(job, args)
  );
  const dedupedJobs = dedupeJobs(locationMatchedJobs);
  const finalJobs = paginateJobs(dedupedJobs, args);

  return {
    rawJobs: jobs,
    queryMatchedJobs,
    locationMatchedJobs,
    dedupedJobs,
    finalJobs,
    counts: {
      raw: jobs.length,
      matched: queryMatchedJobs.length,
      postLocation: locationMatchedJobs.length,
      postDedupe: dedupedJobs.length,
      final: finalJobs.length,
    },
  };
}

export function paginateJobs(jobs: Job[], args: SourceFetchArgs) {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.max(1, args.limit ?? jobs.length ?? 1);
  const start = (page - 1) * limit;

  return jobs.slice(start, start + limit);
}

export function filterAndPaginateJobs(jobs: Job[], args: SourceFetchArgs) {
  return paginateJobs(filterJobs(jobs, args), args);
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_SOURCE_TIMEOUT_MS
): Promise<T> {
  const controller = init?.signal ? null : new AbortController();
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: init?.signal ?? controller?.signal,
      headers: {
        accept: "application/json",
        "user-agent": "Hirexa/1.0",
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Request failed (${res.status}) for ${url}`);
    }

    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out for ${url}`);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeJobUrl(url: string | undefined) {
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

function classifySourceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/timed out/i.test(message)) {
    return "timeout";
  }

  if (error instanceof SyntaxError || /Unexpected token/i.test(message)) {
    return "parse_error";
  }

  if (/Request failed \(\d{3}\)/.test(message)) {
    return "http_error";
  }

  return "error";
}

function formatSourcePrefix(source: string, target?: string) {
  return target ? `[jobs:${source}] board=${target}` : `[jobs:${source}]`;
}

export function logSourceSuccess(
  source: string,
  metrics: {
    ms: number;
    raw: number;
    matched: number;
    postLocation?: number;
    postDedupe?: number;
    final?: number;
    board?: string;
  }
) {
  const postLocation =
    typeof metrics.postLocation === "number"
      ? ` postLocation=${metrics.postLocation}`
      : "";
  const postDedupe =
    typeof metrics.postDedupe === "number"
      ? ` postDedupe=${metrics.postDedupe}`
      : "";
  const final = typeof metrics.final === "number" ? ` final=${metrics.final}` : "";
  console.log(
    `${formatSourcePrefix(source, metrics.board)} status=ok ms=${metrics.ms} raw=${metrics.raw} matched=${metrics.matched}${postLocation}${postDedupe}${final}`
  );
}

export function logSourceFailure(
  source: string,
  target: string | undefined,
  error: unknown,
  metrics: {
    ms: number;
    raw?: number;
    matched?: number;
  }
) {
  const message = error instanceof Error ? error.message : String(error);
  const status = classifySourceError(error);
  const detail = /Request failed \((\d{3})\)/.test(message) ? message : status === "timeout" ? message : "";
  const detailText = detail ? ` detail="${detail}"` : "";
  console.warn(
    `${formatSourcePrefix(source, target)} status=${status} ms=${metrics.ms} raw=${metrics.raw ?? 0} matched=${metrics.matched ?? 0}${detailText}`
  );
}

export function dedupeJobs(jobs: Job[]) {
  const seen = new Set<string>();

  return jobs.filter((job) => {
    const key = normalizeJobUrl(job.jobUrl) || `${job.source}:${job.id}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function shuffleArray<T>(array: T[]) {
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}
