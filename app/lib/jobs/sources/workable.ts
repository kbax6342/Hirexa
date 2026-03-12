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

type WorkableResponse = {
  results?: Array<{
    id?: string;
    title?: string;
    shortcode?: string;
    shortlink?: string;
    description?: string;
    created_at?: string;
    location?: {
      city?: string;
      region?: string;
      country?: string;
    } | null;
  }>;
};

type WorkableLocation = {
  city?: string;
  region?: string;
  country?: string;
} | null | undefined;

function readLocation(value: WorkableLocation) {
  if (!value || typeof value !== "object") return "";

  const parts = [value.city, value.region, value.country]
    .map((part) => cleanText(part))
    .filter(Boolean);

  return parts.join(", ");
}

export async function fetchWorkable(
  company: string,
  args: SourceFetchArgs = {}
): Promise<Job[]> {
  const slug = company.trim();
  if (!slug) return [];
  const startedAt = Date.now();
  let rawCount = 0;

  try {
    const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs`;
    const data = await fetchJson<WorkableResponse>(
      url,
      undefined,
      ATS_SOURCE_TIMEOUT_MS
    );
    const jobs = (data.results ?? []).map((job, index): Job => ({
      id: buildJobId("workable", slug, job.id ?? job.shortcode ?? index),
      source: "workable",
      title: cleanText(job.title, "Untitled role"),
      company: humanizeSlug(slug),
      location: cleanText(readLocation(job.location), "Remote"),
      posted: formatPostedLabel(job.created_at),
      description: cleanText(job.description).slice(0, 240) || undefined,
      jobUrl: cleanText(job.shortlink) || undefined,
      searchText: cleanText(job.description),
    }));
    rawCount = jobs.length;
    const stages = applyJobMatchStages(jobs, args);

    logSourceSuccess("workable", {
      board: slug,
      ms: Date.now() - startedAt,
      ...stages.counts,
    });

    return args.skipLocalMatch ? jobs : stages.finalJobs;
  } catch (error) {
    logSourceFailure("workable", slug, error, {
      ms: Date.now() - startedAt,
      raw: rawCount,
      matched: 0,
    });
    return [];
  }
}
