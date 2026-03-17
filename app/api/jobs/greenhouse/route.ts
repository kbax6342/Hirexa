import { NextResponse } from "next/server";
import {
  fetchGreenhouseListings,
  filterGreenhouseJobs,
  type GreenhouseBoardConfig,
  type GreenhouseNormalizedJob,
  type GreenhouseWarning,
} from "../../../lib/jobs/fetchGreenhouseJobs";

export const runtime = "nodejs";
export const revalidate = 0;

type JobCategory = "tech" | "healthcare" | "finance" | "trades";

type Job = Omit<GreenhouseNormalizedJob<JobCategory>, "category"> & {
  category: JobCategory;
};
type Warning = GreenhouseWarning;

type JobsResponse = {
  jobs: Job[];
  meta: {
    total: number;
    offset: number;
    limit: number;
    fetchedAt: string;
    warnings?: Warning[];
  };
};

type BoardConfig = GreenhouseBoardConfig<JobCategory> & {
  label: string;
  category: JobCategory;
};

const techCompanies = [
  "stripe",
  "airbnb",
  "coinbase",
  "discord",
  "shopify",
  "notion",
  "figma",
  "robinhood",
  "databricks",
  "openai",
  "scaleai",
  "plaid",
  "instacart",
  "dropbox",
  "cloudflare",
  "zapier",
  "asana",
  "intercom",
  "brex",
  "gusto",
] as const;

const healthcareCompanies = [
  "ro",
  "himsandhers",
  "caredx",
  "devotedhealth",
  "includedhealth",
  "carbonhealth",
  "cityblockhealth",
  "modernhealth",
  "noom",
  "springhealth",
  "headspace",
  "talkspace",
] as const;

const financeCompanies = [
  "chime",
  "brex",
  "plaid",
  "robinhood",
  "coinbase",
  "wise",
  "affirm",
  "klarna",
  "square",
  "ramp",
  "checkout",
  "stripe",
] as const;

const tradesCompanies = [
  "tesla",
  "spacex",
  "rivian",
  "jobyaviation",
  "anduril",
  "proterra",
  "commonenergy",
  "crusoe",
  "formenergy",
  "aurorainnovation",
] as const;

const LABEL_OVERRIDES: Record<string, string> = {
  himsandhers: "Hims & Hers",
  openai: "OpenAI",
  spacex: "SpaceX",
  cityblockhealth: "Cityblock Health",
  includedhealth: "Included Health",
  modernhealth: "Modern Health",
  devotedhealth: "Devoted Health",
  caredx: "CareDx",
  jobyaviation: "Joby Aviation",
  aurorainnovation: "Aurora Innovation",
  formenergy: "Form Energy",
  commonenergy: "Common Energy",
};

const CACHE_TTL_MS = 10 * 60 * 1000;

const responseCache = new Map<string, { expiresAt: number; value: JobsResponse }>();

function toTitleCaseSlug(slug: string) {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function makeBoards(): BoardConfig[] {
  const map = new Map<string, BoardConfig>();

  const addList = (category: JobCategory, slugs: readonly string[]) => {
    for (const slug of slugs) {
      if (!slug || map.has(slug)) continue;
      map.set(slug, {
        board: slug,
        label: LABEL_OVERRIDES[slug] ?? toTitleCaseSlug(slug),
        category,
      });
    }
  };

  addList("tech", techCompanies);
  addList("healthcare", healthcareCompanies);
  addList("finance", financeCompanies);
  addList("trades", tradesCompanies);

  return Array.from(map.values());
}

const BOARDS = makeBoards() as readonly BoardConfig[];

function parseCategory(value: string | null): JobCategory | null {
  if (!value) return null;
  if (value === "tech" || value === "healthcare" || value === "finance" || value === "trades") {
    return value;
  }
  return null;
}

function getCacheKey(params: {
  q: string;
  location: string;
  category: JobCategory | null;
  limit: number;
  offset: number;
}) {
  const boardKey = BOARDS.map((board) => `${board.board}:${board.category}`).join(",");
  return JSON.stringify({ boardKey, ...params });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const location = (searchParams.get("location") ?? "").trim().toLowerCase();
  const category = parseCategory(searchParams.get("category"));
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 100), 250));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  const cacheKey = getCacheKey({ q, location, category, limit, offset });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[jobs:greenhouse] routeCache=hit");
    }
    return NextResponse.json(cached.value);
  }

  const greenhouse = await fetchGreenhouseListings(BOARDS);
  const mergedJobs = greenhouse.jobs.filter((job): job is Job => job.category !== null);

  if (mergedJobs.length === 0 && greenhouse.warnings.length === BOARDS.length) {
    return NextResponse.json(
      {
        jobs: [],
        meta: {
          total: 0,
          offset,
          limit,
          fetchedAt: new Date().toISOString(),
          warnings: greenhouse.warnings,
        },
      } satisfies JobsResponse,
      { status: 502 }
    );
  }

  const filtered = filterGreenhouseJobs(mergedJobs, {
    query: q,
    location,
    category,
  }) as Job[];

  filtered.sort((a, b) => {
    const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bt - at;
  });

  const paginated = filtered.slice(offset, offset + limit) as Job[];

  const body: JobsResponse = {
    jobs: paginated,
    meta: {
      total: filtered.length,
      offset,
      limit,
      fetchedAt: new Date().toISOString(),
      ...(greenhouse.warnings.length > 0 ? { warnings: greenhouse.warnings } : {}),
    },
  };

  responseCache.set(cacheKey, {
    value: body,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return NextResponse.json(body);
}
