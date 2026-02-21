import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;

type JobCategory = "tech" | "healthcare" | "finance" | "trades";

type Job = {
  source: "greenhouse";
  sourceId: string;
  board: string;
  companyLabel: string;
  title: string;
  location: string | null;
  department: string | null;
  absoluteUrl: string;
  updatedAt: string | null;
  category: JobCategory;
};

type Warning = {
  board: string;
  error: string;
};

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

type BoardConfig = {
  board: string;
  label: string;
  category: JobCategory;
};

const BOARDS = [
  { board: "stripe", label: "Stripe", category: "finance" },
  { board: "airbnb", label: "Airbnb", category: "tech" },
  { board: "coinbase", label: "Coinbase", category: "finance" },
  { board: "discord", label: "Discord", category: "tech" },
  { board: "shopify", label: "Shopify", category: "tech" },
  { board: "ro", label: "Ro", category: "healthcare" },
  { board: "himsandhers", label: "Hims & Hers", category: "healthcare" },
  { board: "tesla", label: "Tesla", category: "trades" },
  { board: "spacex", label: "SpaceX", category: "trades" },
] as const satisfies readonly BoardConfig[];

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CONCURRENCY = 5;

const responseCache = new Map<string, { expiresAt: number; value: JobsResponse }>();

type GreenhouseJobPayload = {
  id: number | string;
  title?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  absolute_url?: string;
  updated_at?: string;
};

function parseCategory(value: string | null): JobCategory | null {
  if (!value) return null;
  if (value === "tech" || value === "healthcare" || value === "finance" || value === "trades") {
    return value;
  }
  return null;
}

function normalizeBoardJob(board: BoardConfig, job: GreenhouseJobPayload): Job | null {
  if (!job.absolute_url || !job.title || job.id === undefined || job.id === null) {
    return null;
  }

  return {
    source: "greenhouse",
    sourceId: `${board.board}:${String(job.id)}`,
    board: board.board,
    companyLabel: board.label,
    title: job.title,
    location: job.location?.name ?? null,
    department: job.departments?.[0]?.name ?? null,
    absoluteUrl: job.absolute_url,
    updatedAt: job.updated_at ?? null,
    category: board.category,
  };
}

function makeLimiter(maxConcurrent: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount -= 1;
    const run = queue.shift();
    if (run) run();
  };

  return async function runLimited<T>(task: () => Promise<T>): Promise<T> {
    if (activeCount >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    activeCount += 1;
    try {
      return await task();
    } finally {
      next();
    }
  };
}

async function fetchBoardJobs(board: BoardConfig): Promise<Job[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.board)}/jobs`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Greenhouse API ${response.status}`);
  }

  const payload = (await response.json()) as { jobs?: GreenhouseJobPayload[] };
  const rawJobs = Array.isArray(payload.jobs) ? payload.jobs : [];

  return rawJobs
    .map((job) => normalizeBoardJob(board, job))
    .filter((job): job is Job => job !== null);
}

function matchesSearch(job: Job, query: string): boolean {
  if (!query) return true;
  const haystack = `${job.title} ${job.companyLabel} ${job.location ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

function getCacheKey(params: { q: string; category: JobCategory | null; limit: number; offset: number }): string {
  const boardKey = BOARDS.map((board) => `${board.board}:${board.category}`).join(",");
  return JSON.stringify({ boardKey, ...params });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const category = parseCategory(searchParams.get("category"));
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 100), 250));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  const cacheKey = getCacheKey({ q, category, limit, offset });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.value);
  }

  const limitRun = makeLimiter(MAX_CONCURRENCY);
  const boardResults = await Promise.allSettled(
    BOARDS.map((board) =>
      limitRun(async () => ({ board: board.board, jobs: await fetchBoardJobs(board) })),
    ),
  );

  const warnings: Warning[] = [];
  const mergedJobs: Job[] = [];

  boardResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      mergedJobs.push(...result.value.jobs);
      return;
    }

    warnings.push({
      board: BOARDS[index]?.board ?? "unknown",
      error: result.reason instanceof Error ? result.reason.message : "Unknown fetch error",
    });
  });

  if (mergedJobs.length === 0 && warnings.length === BOARDS.length) {
    return NextResponse.json(
      {
        jobs: [],
        meta: {
          total: 0,
          offset,
          limit,
          fetchedAt: new Date().toISOString(),
          warnings,
        },
      } satisfies JobsResponse,
      { status: 502 },
    );
  }

  const filtered = mergedJobs.filter((job) => {
    if (category && job.category !== category) return false;
    return matchesSearch(job, q);
  });

  const paginated = filtered.slice(offset, offset + limit);

  const body: JobsResponse = {
    jobs: paginated,
    meta: {
      total: filtered.length,
      offset,
      limit,
      fetchedAt: new Date().toISOString(),
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };

  responseCache.set(cacheKey, { value: body, expiresAt: Date.now() + CACHE_TTL_MS });

  return NextResponse.json(body);
}
