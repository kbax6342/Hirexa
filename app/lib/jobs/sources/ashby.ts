import type { Job } from "../types";
import {
  ATS_SOURCE_TIMEOUT_MS,
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

type AshbyResponse = {
  jobs?: Array<{
    id?: string;
    title?: string;
    location?: string | { name?: string | null } | null;
    applyUrl?: string;
    publishedAt?: string;
    descriptionPlain?: string;
  }>;
};

function readLocation(
  value: string | { name?: string | null } | null | undefined
) {
  if (typeof value === "string") return value;
  return value?.name ?? "";
}

export async function fetchAshby(
  company: string,
  args: SourceFetchArgs = {}
): Promise<Job[]> {
  const slug = company.trim();
  if (!slug) return [];
  const startedAt = Date.now();
  let rawCount = 0;

  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
    const data = await fetchJson<AshbyResponse>(url, undefined, ATS_SOURCE_TIMEOUT_MS);
    const jobs = (data.jobs ?? []).map((job, index): Job => ({
      id: buildJobId("ashby", slug, job.id ?? index),
      source: "ashby",
      title: cleanText(job.title, "Untitled role"),
      company: humanizeSlug(slug),
      location: cleanText(readLocation(job.location), "Remote"),
      posted: formatPostedLabel(job.publishedAt),
      description: cleanText(job.descriptionPlain).slice(0, 240) || undefined,
      jobUrl: cleanText(job.applyUrl) || undefined,
      searchText: cleanText(job.descriptionPlain),
    }));
    rawCount = jobs.length;
    const stages = applyJobMatchStages(jobs, args);

    logSourceSuccess("ashby", {
      board: slug,
      ms: Date.now() - startedAt,
      ...stages.counts,
    });

    return args.skipLocalMatch ? jobs : stages.finalJobs;
  } catch (error) {
    logSourceFailure("ashby", slug, error, {
      ms: Date.now() - startedAt,
      raw: rawCount,
      matched: 0,
    });
    return [];
  }
}
