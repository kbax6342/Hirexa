import type { Job } from "../types";
import {
  applyJobMatchStages,
  buildJobId,
  cleanText,
  fetchJson,
  formatPostedLabel,
  humanizeSlug,
  logSourceSuccess,
  logSourceFailure,
  type SourceFetchArgs,
} from "./common";

const LEVER_SOURCE_TIMEOUT_MS = 1750;
const LEVER_CIRCUIT_BREAKER_MS = 10 * 60 * 1000;
const LEVER_TIMEOUT_THRESHOLD = 2;
const disabledLeverBoards = new Map<string, number>();
const leverTimeoutCounts = new Map<string, number>();

type LeverJob = {
  id?: string;
  text?: string;
  createdAt?: number;
  hostedUrl?: string;
  descriptionPlain?: string;
  categories?: {
    location?: string;
    team?: string;
  };
};

export async function fetchLever(
  company: string,
  args: SourceFetchArgs = {}
): Promise<Job[]> {
  const slug = company.trim();
  if (!slug) return [];
  const now = Date.now();
  const disabledUntil = disabledLeverBoards.get(slug) ?? 0;
  if (disabledUntil > now) {
    console.warn(
      `[jobs:lever] board=${slug} status=disabled ms=0 raw=0 matched=0 detail="circuit open"`
    );
    return [];
  }
  if (disabledUntil > 0 && disabledUntil <= now) {
    disabledLeverBoards.delete(slug);
  }
  const startedAt = Date.now();
  let rawCount = 0;

  try {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
    const data = await fetchJson<LeverJob[]>(url, undefined, LEVER_SOURCE_TIMEOUT_MS);
    const jobs = data.map((job, index): Job => ({
      id: buildJobId("lever", slug, job.id ?? index),
      source: "lever",
      title: cleanText(job.text, "Untitled role"),
      company: humanizeSlug(slug),
      location: cleanText(job.categories?.location, "Remote"),
      posted: formatPostedLabel(job.createdAt),
      description: cleanText(job.descriptionPlain).slice(0, 240) || undefined,
      jobUrl: cleanText(job.hostedUrl) || undefined,
      searchText: cleanText(
        [job.categories?.team, job.descriptionPlain].filter(Boolean).join(" ")
      ),
    }));
    rawCount = jobs.length;
    leverTimeoutCounts.delete(slug);
    const stages = applyJobMatchStages(jobs, args);

    logSourceSuccess("lever", {
      board: slug,
      ms: Date.now() - startedAt,
      ...stages.counts,
    });

    return args.skipLocalMatch ? jobs : stages.finalJobs;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timed out/i.test(message) && rawCount === 0) {
      const nextCount = (leverTimeoutCounts.get(slug) ?? 0) + 1;
      leverTimeoutCounts.set(slug, nextCount);
      if (nextCount >= LEVER_TIMEOUT_THRESHOLD) {
        disabledLeverBoards.set(slug, Date.now() + LEVER_CIRCUIT_BREAKER_MS);
      }
    }
    logSourceFailure("lever", slug, error, {
      ms: Date.now() - startedAt,
      raw: rawCount,
      matched: 0,
    });
    return [];
  }
}
