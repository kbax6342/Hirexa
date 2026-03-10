import { NextResponse } from "next/server";
import type { Job } from "../../lib/jobs/types";
import { fetchAdzunaJobs } from "../../lib/providers/adzuna";
import {
  fetchGreenhouseJobs,
  fetchIcimsJobs,
  fetchJazzHrJobs,
  fetchWorkdayJobs,
  getGreenhouseBoards,
  getWorkdayBoards,
} from "../../lib/providers/ats-aggregator";

type Cursor = {
  adzunaPage: number;
  greenhousePage: number;
  jazzhrPage: number;
  icimsPage: number;
  workdayOffset: number;
};

function decodeCursor(raw: string | null): Cursor {
  if (!raw) {
    return {
      adzunaPage: 1,
      greenhousePage: 1,
      jazzhrPage: 1,
      icimsPage: 1,
      workdayOffset: 0,
    };
  }

  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return {
      adzunaPage: typeof parsed.adzunaPage === "number" ? parsed.adzunaPage : 1,
      greenhousePage:
        typeof parsed.greenhousePage === "number" ? parsed.greenhousePage : 1,
      jazzhrPage: typeof parsed.jazzhrPage === "number" ? parsed.jazzhrPage : 1,
      icimsPage: typeof parsed.icimsPage === "number" ? parsed.icimsPage : 1,
      workdayOffset:
        typeof parsed.workdayOffset === "number" ? parsed.workdayOffset : 0,
    };
  } catch {
    return {
      adzunaPage: 1,
      greenhousePage: 1,
      jazzhrPage: 1,
      icimsPage: 1,
      workdayOffset: 0,
    };
  }
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function isHiringEventJob(job: Job) {
  const title = (job.title ?? "").toLowerCase();
  const description = (job.description ?? "").toLowerCase();

  return title.includes("hiring event") || description.includes("hiring event");
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

function dedupeJobs(jobs: Job[]) {
  const seen = new Set<string>();

  return jobs.filter((job) => {
    const dedupeKey =
      normalizeJobUrl(job.jobUrl) ||
      `${job.source}:${String(job.id ?? "").trim().toLowerCase()}`;

    if (!dedupeKey || seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  const rawCategory = (searchParams.get("category") ?? "").trim().toLowerCase();
  const q = (searchParams.get("q") ?? mapCategoryToQuery(rawCategory)).trim();
  const cursor = decodeCursor(searchParams.get("cursor"));

  const greenhouseBoards = getGreenhouseBoards();
  const workdayBoards = getWorkdayBoards();

  const providerResults = await Promise.allSettled([
    fetchAdzunaJobs({ query: q, page: cursor.adzunaPage, limit }),
    greenhouseBoards.length > 0
      ? fetchGreenhouseJobs({
          boardTokens: greenhouseBoards,
          query: q,
          page: cursor.greenhousePage,
          limit,
        })
      : Promise.resolve([]),
    fetchJazzHrJobs({ query: q, page: cursor.jazzhrPage, limit }),
    fetchIcimsJobs({ query: q, page: cursor.icimsPage, limit }),
    workdayBoards.length > 0
      ? fetchWorkdayJobs({
          boards: workdayBoards,
          query: q,
          limit,
          offset: cursor.workdayOffset,
        })
      : Promise.resolve([]),
  ]);

  const [
    adzunaResult,
    greenhouseResult,
    jazzhrResult,
    icimsResult,
    workdayResult,
  ] = providerResults;

  const adzunaJobs = adzunaResult.status === "fulfilled" ? adzunaResult.value : [];
  const greenhouseJobs =
    greenhouseResult.status === "fulfilled" ? greenhouseResult.value : [];
  const jazzhrJobs = jazzhrResult.status === "fulfilled" ? jazzhrResult.value : [];
  const icimsJobs = icimsResult.status === "fulfilled" ? icimsResult.value : [];
  const workdayJobs =
    workdayResult.status === "fulfilled" ? workdayResult.value : [];

  const merged = dedupeJobs([
    ...greenhouseJobs,
    ...adzunaJobs,
    ...jazzhrJobs,
    ...icimsJobs,
    ...workdayJobs,
  ]).filter((job) => !isHiringEventJob(job));

  const nextCursor = encodeCursor({
    ...cursor,
    adzunaPage: cursor.adzunaPage + 1,
    greenhousePage: cursor.greenhousePage + 1,
    jazzhrPage: cursor.jazzhrPage + 1,
    icimsPage: cursor.icimsPage + 1,
    workdayOffset: cursor.workdayOffset + limit,
  });

  const providerErrors = providerResults
    .map((result, index) => ({
      source: ["adzuna", "greenhouse", "jazzhr", "icims", "workday"][index],
      reason:
        result.status === "rejected"
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : null,
    }))
    .filter((value) => value.reason);

  return NextResponse.json({
    ok: true,
    query: q,
    jobs: merged,
    items: merged,
    bySource: {
      adzuna: adzunaJobs,
      greenhouse: greenhouseJobs,
      jazzhr: jazzhrJobs,
      icims: icimsJobs,
      workday: workdayJobs,
    },
    count: merged.length,
    providerErrors,
    nextCursor,
  });
}

function mapCategoryToQuery(category: string) {
  if (!category) return "software engineer";

  const normalized = category.replace(/[-_]+/g, " ").trim();

  const queryByCategory: Record<string, string> = {
    healthcare: "healthcare",
    technology: "software engineer",
    tech: "software engineer",
    "skilled trades": "electrician OR plumber OR hvac technician",
    "skill trades": "electrician OR plumber OR hvac technician",
    finance: "finance",
  };

  return queryByCategory[normalized] ?? normalized;
}
