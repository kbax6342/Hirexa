import type { Job } from "../jobs/types";
import { LEVER_COMPANIES } from "../jobs/sources/boards";
import { buildJobId, formatPostedLabel } from "../jobs/sources/common";
import {
  fetchGreenhouseListings,
  filterGreenhouseJobs,
  type GreenhouseBoardConfig,
} from "../jobs/fetchGreenhouseJobs";

export type WorkdayBoardConfig = {
  company: string;
  host: string;
  tenant: string;
  site: string;
  locale?: string;
};

type JsonObject = Record<string, unknown>;
type LeverJobPayload = {
  id?: string | number;
  text?: string;
  createdAt?: string | number;
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  description?: string;
  categories?: {
    location?: string;
    team?: string;
    commitment?: string;
    allLocations?: string[] | string;
  };
};

const LEVER_SOURCE_TIMEOUT_MS = 3000;
const LEVER_LABEL_OVERRIDES: Record<string, string> = {
  usmobile: "US Mobile",
  nium: "Nium",
  jobgether: "Jobgether",
  "daniels-sharpsmart": "Daniels Sharpsmart",
  doola: "Doola",
  netomi: "Netomi",
  ginkgobioworks: "Ginkgo Bioworks",
};

function parseCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;

  const normalized = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" ? (value as JsonObject) : {};
}

function stripWrappingQuotes(value: string) {
  return value.trim().replace(/^['"]+|['"]+$/g, "");
}

function normalizeWorkdayHost(value: string) {
  return stripWrappingQuotes(value).replace(/\/+$/, "");
}

function normalizeWorkdaySegment(value: string) {
  return stripWrappingQuotes(value).replace(/^\/+|\/+$/g, "");
}

function normalizeWorkdayBoard(board: WorkdayBoardConfig): WorkdayBoardConfig {
  return {
    company: stripWrappingQuotes(board.company),
    host: normalizeWorkdayHost(board.host),
    tenant: normalizeWorkdaySegment(board.tenant),
    site: normalizeWorkdaySegment(board.site),
    locale: board.locale ? normalizeWorkdaySegment(board.locale) : undefined,
  };
}

function toPostedLabel(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "Recently";

  const d =
    typeof value === "number"
      ? new Date(value)
      : /^\d+$/.test(String(value))
        ? new Date(Number(value))
        : new Date(String(value));

  if (Number.isNaN(d.getTime())) return "Recently";

  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  if (days < 30) return `Posted ${days} days ago`;
  return "Posted 30+ days ago";
}

function encodeId(parts: string[]) {
  return Buffer.from(parts.join("::"), "utf8").toString("base64url");
}

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = 8000
): Promise<unknown> {
  const controller = init?.signal ? null : new AbortController();
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: init?.signal ?? controller?.signal,
    });

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }

    return res.json();
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

export async function fetchGreenhouseJobs(args: {
  boardTokens: string[];
  query: string;
  limit: number;
  page: number;
}): Promise<Job[]> {
  const boards: GreenhouseBoardConfig[] = args.boardTokens.map((board) => ({ board }));
  const greenhouse = await fetchGreenhouseListings(boards);
  const filtered = filterGreenhouseJobs(greenhouse.jobs, {
    query: args.query,
  });
  const start = Math.max(0, (args.page - 1) * args.limit);

  return filtered.slice(start, start + args.limit).map((job) => {
    const rawJobId = job.sourceId.startsWith(`${job.board}:`)
      ? job.sourceId.slice(job.board.length + 1)
      : job.sourceId;

    return {
      id: buildJobId("greenhouse", job.board, rawJobId),
      source: "greenhouse" as const,
      title: job.title,
      company: job.board,
      location: job.location ?? "Remote",
      posted: formatPostedLabel(job.updatedAt),
      description: job.absoluteUrl,
      jobUrl: job.absoluteUrl,
    };
  });
}

function humanizeCompanySlug(slug: string) {
  const normalizedKey = slug.trim().toLowerCase();
  const override = LEVER_LABEL_OVERRIDES[normalizedKey];
  if (override) return override;

  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLeverCompanySlugs(values: readonly string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const slug = value.trim();
    if (!slug) return false;

    const key = slug.toLowerCase();
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function fetchLeverCompanyJobs(companySlug: string) {
  const slug = companySlug.trim();
  if (!slug) return [] as Job[];

  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const payload = await fetchJson(url, undefined, LEVER_SOURCE_TIMEOUT_MS);

  if (!Array.isArray(payload)) {
    throw new Error(`Unexpected Lever payload for ${slug}`);
  }

  const companyLabel = humanizeCompanySlug(slug);

  return payload.map((raw, index): Job => {
    const job = asObject(raw) as LeverJobPayload;
    const categories = job.categories ?? {};
    const allLocations = Array.isArray(categories.allLocations)
      ? categories.allLocations.filter((value): value is string => typeof value === "string")
      : typeof categories.allLocations === "string"
        ? [categories.allLocations]
        : [];
    const location =
      cleanText(categories.location) ||
      cleanText(allLocations.join(", ")) ||
      "Remote";

    return {
      id: `lever:${encodeId([slug, String(job.id ?? index)])}`,
      source: "lever",
      title: cleanText(job.text, "Untitled role"),
      company: companyLabel,
      location,
      posted: toPostedLabel(job.createdAt ?? null),
      description:
        cleanText(job.descriptionPlain || job.description).slice(0, 240) || undefined,
      jobUrl: cleanText(job.hostedUrl || job.applyUrl) || undefined,
    };
  });
}

export async function fetchLeverJobs(args: {
  companySlugs: string[];
  query: string;
  page: number;
  limit: number;
}): Promise<Job[]> {
  const { companySlugs, query, page, limit } = args;
  const normalizedSlugs = normalizeLeverCompanySlugs(companySlugs);

  if (normalizedSlugs.length === 0) return [];

  const settled = await Promise.allSettled(
    normalizedSlugs.map((slug) => fetchLeverCompanyJobs(slug))
  );

  const merged: Job[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
      return;
    }

    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.warn(`[jobs:lever] board=${normalizedSlugs[index]} ${reason}`);
  });

  const q = query.trim().toLowerCase();
  const filtered = q
    ? merged.filter((job) =>
        `${job.title} ${job.company} ${job.location} ${job.description ?? ""}`
          .toLowerCase()
          .includes(q)
      )
    : merged;

  const start = Math.max(0, (page - 1) * limit);
  return filtered.slice(start, start + limit);
}

export async function fetchWorkdayJobs(args: {
  boards: WorkdayBoardConfig[];
  limit: number;
  offset: number;
  query: string;
}): Promise<Job[]> {
  const { boards, limit, offset, query } = args;
  const q = query.trim().toLowerCase();

  const result = await Promise.all(
    boards.map(async (rawBoard) => {
      const board = normalizeWorkdayBoard(rawBoard);
      const url = `${board.host}/wday/cxs/${board.tenant}/${board.site}/jobs`;
      const json = asObject(
        await fetchJson(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-requested-with": "XMLHttpRequest",
          },
          body: JSON.stringify({
            appliedFacets: {},
            limit,
            offset,
            searchText: query,
            sortBy: "mostRecent",
          }),
        })
      );

      const postings = Array.isArray(json.jobPostings) ? json.jobPostings : [];

      return postings.map((raw): Job => {
        const posting = asObject(raw);
        const externalPath = asText(posting.externalPath);

        return {
          id: `workday:${encodeId([board.company, externalPath || asText(posting.title)])}`,
          source: "workday",
          title: asText(posting.title, "Untitled role"),
          company: board.company,
          location: asText(posting.locationsText, "Remote"),
          posted: toPostedLabel(asText(posting.postedOn)),
          description: "",
          jobUrl: `${board.host}/${board.locale ?? "en-US"}/${board.site}${externalPath}`,
        };
      });
    })
  );

  const merged = result.flat();
  return q
    ? merged.filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q))
    : merged;
}

async function fetchGenericFeeds(args: {
  source: Job["source"];
  urls: string[];
  fallbackCompany: string;
  query: string;
  page: number;
  limit: number;
}) {
  const { source, urls, fallbackCompany, query, page, limit } = args;

  const payloads = await Promise.all(
    urls.map(async (url) => {
      const json = await fetchJson(url);
      const obj = asObject(json);
      if (Array.isArray(json)) return json;
      if (Array.isArray(obj.jobs)) return obj.jobs;
      if (Array.isArray(obj.results)) return obj.results;
      return [];
    })
  );

  const allJobs = payloads.flat().map((raw, index): Job => {
    const j = asObject(raw);
    const title = asText(j.title || j.name, "Untitled role");
    const company = asText(j.company || j.company_name, fallbackCompany);
    const location = asText(j.location || j.job_location, "Remote");
    const created = asText(j.created || j.created_at || j.updated_at);
    const url = asText(j.url || j.jobUrl || j.apply_url || j.absolute_url);

    return {
      id: `${source}:${encodeId([company, String(j.id ?? index), title])}`,
      source,
      title,
      company,
      location,
      posted: toPostedLabel(created),
      description: asText(j.description || j.short_description).slice(0, 240),
      jobUrl: url,
    };
  });

  const q = query.trim().toLowerCase();
  const filtered = q
    ? allJobs.filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q))
    : allJobs;

  const start = Math.max(0, (page - 1) * limit);
  return filtered.slice(start, start + limit);
}

export async function fetchJazzHrJobs(args: { query: string; page: number; limit: number }) {
  const urls = parseCsvEnv("JAZZHR_JOB_FEEDS");
  if (urls.length === 0) return [];

  return fetchGenericFeeds({
    source: "jazzhr",
    urls,
    fallbackCompany: "JazzHR Company",
    query: args.query,
    page: args.page,
    limit: args.limit,
  });
}

export async function fetchIcimsJobs(args: { query: string; page: number; limit: number }) {
  const urls = parseCsvEnv("ICIMS_JOB_FEEDS");
  if (urls.length === 0) return [];

  return fetchGenericFeeds({
    source: "icims",
    urls,
    fallbackCompany: "iCIMS Company",
    query: args.query,
    page: args.page,
    limit: args.limit,
  });
}

export function getGreenhouseBoards() {
  const configuredBoards = parseCsvEnv("GREENHOUSE_BOARD_TOKENS");

  // Greenhouse Job Board API is public, so we can still return jobs
  // without requiring an API key or env configuration.
  if (configuredBoards.length > 0) {
    return configuredBoards;
  }

  return [
    "airbnb",
    "coinbase",
    "doordash",
    "duolingo",
    "lyft",
    "openai",
    "reddit",
    "robinhood",
    "shopify",
    "stripe",
  ];
}

export function getLeverCompanySlugs() {
  const configured = parseCsvEnv("LEVER_COMPANY_SLUGS");
  return normalizeLeverCompanySlugs(
    configured.length > 0 ? [...configured, ...LEVER_COMPANIES] : [...LEVER_COMPANIES]
  );
}

export function getWorkdayBoards() {
  const raw = process.env.WORKDAY_BOARDS_JSON;
  if (!raw) return [] as WorkdayBoardConfig[];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed
          .filter(Boolean)
          .map((board) => normalizeWorkdayBoard(board as WorkdayBoardConfig))
          .filter((board) => board.host && board.tenant && board.site) as WorkdayBoardConfig[])
      : [];
  } catch {
    return [];
  }
}
