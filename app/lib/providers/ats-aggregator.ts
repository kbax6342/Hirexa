import type { Job } from "../jobs/types";

export type WorkdayBoardConfig = {
  company: string;
  host: string;
  tenant: string;
  site: string;
  locale?: string;
};

type JsonObject = Record<string, unknown>;

function parseCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
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

function toPostedLabel(iso?: string) {
  if (!iso) return "Recently";
  const d = new Date(iso);
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

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function fetchGreenhouseJobs(args: {
  boardTokens: string[];
  query: string;
  limit: number;
  page: number;
}): Promise<Job[]> {
  const { boardTokens, query, limit, page } = args;

  const all = await Promise.all(
    boardTokens.map(async (token) => {
      const url = new URL(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
      url.searchParams.set("content", "false");
      const json = asObject(await fetchJson(url.toString()));
      const jobs = Array.isArray(json.jobs) ? json.jobs : [];

      return jobs.map((raw): Job => {
        const job = asObject(raw);
        const location = asObject(job.location);

        return {
          id: `greenhouse:${encodeId([token, String(job.id ?? "")])}`,
          source: "greenhouse",
          title: asText(job.title, "Untitled role"),
          company: token,
          location: asText(location.name, "Remote"),
          posted: toPostedLabel(asText(job.updated_at)),
          description: asText(job.absolute_url),
          jobUrl: asText(job.absolute_url),
        };
      });
    })
  );

  const merged = all.flat();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? merged.filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q))
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
