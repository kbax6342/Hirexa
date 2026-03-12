import type { Job } from "../types";
import {
  applyJobMatchStages,
  buildJobId,
  cleanText,
  fetchJson,
  formatPostedLabel,
  logSourceFailure,
  logSourceSuccess,
  type SourceFetchArgs,
} from "./common";

type RemotiveResponse = {
  jobs?: Array<{
    id?: string | number;
    title?: string;
    company_name?: string;
    candidate_required_location?: string;
    url?: string;
    publication_date?: string;
    description?: string;
  }>;
};

export async function fetchRemotive(args: SourceFetchArgs = {}): Promise<Job[]> {
  const startedAt = Date.now();
  let rawCount = 0;
  try {
    const url = new URL("https://remotive.com/api/remote-jobs");
    if (args.query?.trim() && !args.skipLocalMatch) {
      url.searchParams.set("search", args.query.trim());
    }

    const data = await fetchJson<RemotiveResponse>(url.toString());
    const jobs = (data.jobs ?? []).map((job, index): Job => ({
      id: buildJobId("remotive", job.id ?? index),
      source: "remotive",
      title: cleanText(job.title, "Untitled role"),
      company: cleanText(job.company_name, "Remotive Company"),
      location: cleanText(job.candidate_required_location, "Remote"),
      posted: formatPostedLabel(job.publication_date),
      description: cleanText(job.description).slice(0, 240) || undefined,
      jobUrl: cleanText(job.url) || undefined,
      searchText: cleanText(job.description),
    }));
    rawCount = jobs.length;
    const stages = applyJobMatchStages(jobs, args);

    logSourceSuccess("remotive", {
      ms: Date.now() - startedAt,
      ...stages.counts,
    });

    return args.skipLocalMatch ? jobs : stages.finalJobs;
  } catch (error) {
    logSourceFailure("remotive", undefined, error, {
      ms: Date.now() - startedAt,
      raw: rawCount,
      matched: 0,
    });
    return [];
  }
}
