import "server-only";

import { applyLocationMatchMetadata } from "@/app/lib/jobs/locationMatch";
import { cleanText, humanizeSlug, summarizeHtmlText } from "./sources/common";

export type GreenhouseBoardConfig<TCategory extends string = string> = {
  board: string;
  label?: string | null;
  category?: TCategory | null;
};

export type GreenhouseNormalizedJob<TCategory extends string = string> = {
  source: "greenhouse";
  sourceId: string;
  board: string;
  companyLabel: string;
  title: string;
  location: string | null;
  department: string | null;
  description: string | null;
  absoluteUrl: string;
  updatedAt: string | null;
  category: TCategory | null;
};

export type GreenhouseWarning = {
  board: string;
  error: string;
};

type GreenhouseJobPayload = {
  id?: string | number;
  title?: string | null;
  location?: { name?: string | null } | null;
  departments?: Array<{ name?: string | null }> | null;
  content?: string | null;
  absolute_url?: string | null;
  updated_at?: string | null;
};

type GreenhousePayload = {
  jobs?: GreenhouseJobPayload[];
};

type CachedGreenhouseBoardJob = {
  jobId: string;
  title: string;
  location: string | null;
  department: string | null;
  description: string | null;
  absoluteUrl: string;
  updatedAt: string | null;
};

const GREENHOUSE_CACHE_TTL_MS = 10 * 60 * 1000;
const GREENHOUSE_BOARD_TIMEOUT_MS = 3500;
const GREENHOUSE_MAX_CONCURRENCY = 5;

const boardCache = new Map<
  string,
  {
    expiresAt: number;
    jobs: CachedGreenhouseBoardJob[];
  }
>();

function normalizeBoardKey(value: string) {
  return value.trim().toLowerCase();
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

function dedupeBoards<TCategory extends string>(
  boards: readonly GreenhouseBoardConfig<TCategory>[]
) {
  const seen = new Set<string>();

  return boards.filter((board) => {
    const key = normalizeBoardKey(board.board);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBoardJobs(payload: GreenhousePayload) {
  const rawJobs = Array.isArray(payload.jobs) ? payload.jobs : [];

  return rawJobs
    .map((job) => {
      if (!job.absolute_url || !job.title || job.id === undefined || job.id === null) {
        return null;
      }

      const departmentNames = Array.isArray(job.departments)
        ? job.departments.map((department) => department?.name).filter(Boolean)
        : [];
      const department = cleanText(departmentNames.join(" ")) || null;
      const description = summarizeHtmlText(job.content) || department;

      return {
        jobId: String(job.id),
        title: cleanText(job.title, "Untitled role"),
        location: cleanText(job.location?.name) || null,
        department,
        description,
        absoluteUrl: cleanText(job.absolute_url),
        updatedAt: cleanText(job.updated_at) || null,
      } satisfies CachedGreenhouseBoardJob;
    })
    .filter((job): job is CachedGreenhouseBoardJob => job !== null);
}

async function fetchGreenhouseBoard(board: string): Promise<CachedGreenhouseBoardJob[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GREENHOUSE_BOARD_TIMEOUT_MS);

  try {
    const url = new URL(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs`
    );
    url.searchParams.set("content", "true");

    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
        "user-agent": "Hirexa/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Greenhouse API ${response.status}`);
    }

    const payload = (await response.json()) as GreenhousePayload;
    return normalizeBoardJobs(payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Greenhouse board timed out after ${GREENHOUSE_BOARD_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getCachedBoardJobs(board: string) {
  const key = normalizeBoardKey(board);
  const cached = boardCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return { jobs: cached.jobs, cacheHit: true };
  }

  const jobs = await fetchGreenhouseBoard(board);
  boardCache.set(key, {
    jobs,
    expiresAt: Date.now() + GREENHOUSE_CACHE_TTL_MS,
  });

  return { jobs, cacheHit: false };
}

function buildCompanyLabel<TCategory extends string>(board: GreenhouseBoardConfig<TCategory>) {
  return cleanText(board.label) || humanizeSlug(board.board);
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesGreenhouseLocation(
  job: Pick<GreenhouseNormalizedJob, "location">,
  location: string
) {
  if (!location) return true;

  const normalizedLocation = normalizeSearchText(location);
  const normalizedJobLocation = normalizeSearchText(job.location ?? "");

  if (!normalizedLocation || !normalizedJobLocation) return !normalizedLocation;
  if (normalizedJobLocation.includes(normalizedLocation)) return true;

  const significantTokens = normalizedLocation
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2);

  if (significantTokens.length === 0) {
    return normalizedJobLocation.includes(normalizedLocation);
  }

  return significantTokens.every((token) => normalizedJobLocation.includes(token));
}

export function filterGreenhouseJobs<TCategory extends string>(
  jobs: readonly GreenhouseNormalizedJob<TCategory>[],
  options: {
    query?: string;
    location?: string;
    category?: TCategory | null;
    includeRemote?: boolean;
  }
) {
  const query = (options.query ?? "").trim().toLowerCase();
  const filtered = jobs.filter((job) => {
    if (options.category && job.category !== options.category) return false;

    if (query) {
      const haystack =
        `${job.title} ${job.companyLabel} ${job.location ?? ""} ${job.department ?? ""} ${
          job.description ?? ""
        }`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });

  if (!options.location?.trim()) {
    return filtered;
  }

  const ranked = applyLocationMatchMetadata(
    filtered.map((job) => ({
      id: `${job.source}:${job.sourceId}`,
      source: job.source,
      title: job.title,
      company: job.companyLabel,
      location: job.location ?? "",
      posted: job.updatedAt ?? "",
      description: job.description ?? undefined,
      jobUrl: job.absoluteUrl,
      searchText: [job.department, job.description].filter(Boolean).join(" "),
    })),
    options.location,
    options.includeRemote !== false
  );
  const rankedIds = new Map(
    ranked.map((job, index) => [job.id.replace(/^greenhouse:/, ""), index] as const)
  );

  return filtered
    .filter((job) => rankedIds.has(job.sourceId))
    .sort((left, right) => {
      const leftRank = rankedIds.get(left.sourceId) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rankedIds.get(right.sourceId) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
}

export async function fetchGreenhouseListings<TCategory extends string = string>(
  boards: readonly GreenhouseBoardConfig<TCategory>[]
) {
  const normalizedBoards = dedupeBoards(boards);
  const runLimited = makeLimiter(GREENHOUSE_MAX_CONCURRENCY);

  const settled = await Promise.allSettled(
    normalizedBoards.map((board) =>
      runLimited(async () => {
        const { jobs, cacheHit } = await getCachedBoardJobs(board.board);
        return { board, jobs, cacheHit };
      })
    )
  );

  const warnings: GreenhouseWarning[] = [];
  const jobs: GreenhouseNormalizedJob<TCategory>[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value.cacheHit) {
        cacheHits += 1;
      } else {
        cacheMisses += 1;
      }

      const companyLabel = buildCompanyLabel(result.value.board);
      jobs.push(
        ...result.value.jobs.map((job) => ({
          source: "greenhouse" as const,
          sourceId: `${result.value.board.board}:${job.jobId}`,
          board: result.value.board.board,
          companyLabel,
          title: job.title,
          location: job.location,
          department: job.department,
          description: job.description,
          absoluteUrl: job.absoluteUrl,
          updatedAt: job.updatedAt,
          category: result.value.board.category ?? null,
        }))
      );
      return;
    }

    warnings.push({
      board: normalizedBoards[index]?.board ?? "unknown",
      error: result.reason instanceof Error ? result.reason.message : "Unknown fetch error",
    });
  });

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[jobs:greenhouse] boards=${normalizedBoards.length} cacheHits=${cacheHits} cacheMisses=${cacheMisses} warnings=${warnings.length}`
    );
  }

  warnings.forEach((warning) => {
    console.warn(`[jobs:greenhouse] board=${warning.board} ${warning.error}`);
  });

  return {
    jobs,
    warnings,
    meta: {
      boardCount: normalizedBoards.length,
      cacheHits,
      cacheMisses,
      fetchedAt: new Date().toISOString(),
    },
  };
}
