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

type GreenhouseResponse = {
  jobs?: Array<{
    id?: string | number;
    title?: string;
    updated_at?: string;
    absolute_url?: string;
    location?: { name?: string | null } | null;
    departments?: Array<{ name?: string | null }> | null;
  }>;
};

export async function fetchGreenhouse(
  company: string,
  args: SourceFetchArgs = {}
): Promise<Job[]> {
  const slug = company.trim();
  if (!slug) return [];
  const startedAt = Date.now();
  let rawCount = 0;

  try {
    const url = new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`);
    url.searchParams.set("content", "false");

    const data = await fetchJson<GreenhouseResponse>(
      url.toString(),
      undefined,
      ATS_SOURCE_TIMEOUT_MS
    );
    const jobs = (data.jobs ?? []).map((job, index): Job => ({
      id: buildJobId("greenhouse", slug, job.id ?? index),
      source: "greenhouse",
      title: cleanText(job.title, "Untitled role"),
      company: humanizeSlug(slug),
      location: cleanText(job.location?.name, "Remote"),
      posted: formatPostedLabel(job.updated_at),
      description:
        cleanText(job.departments?.map((department) => department.name).join(" ")) ||
        undefined,
      jobUrl: cleanText(job.absolute_url) || undefined,
      searchText: cleanText(
        job.departments?.map((department) => department.name).join(" ")
      ),
    }));
    rawCount = jobs.length;
    const stages = applyJobMatchStages(jobs, args);

    logSourceSuccess("greenhouse", {
      board: slug,
      ms: Date.now() - startedAt,
      ...stages.counts,
    });

    return args.skipLocalMatch ? jobs : stages.finalJobs;
  } catch (error) {
    logSourceFailure("greenhouse", slug, error, {
      ms: Date.now() - startedAt,
      raw: rawCount,
      matched: 0,
    });
    return [];
  }
}
