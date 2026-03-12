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

type AdzunaResponse = {
  results?: Array<{
    id?: string | number;
    title?: string;
    created?: string;
    redirect_url?: string;
    description?: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
    salary_min?: number;
    salary_max?: number;
  }>;
};

function formatSalary(min?: number, max?: number) {
  if (!min && !max) return undefined;
  if (min && max) return `$${Math.round(min).toLocaleString()} - $${Math.round(max).toLocaleString()} / year`;
  if (min) return `From $${Math.round(min).toLocaleString()} / year`;
  return `Up to $${Math.round(max!).toLocaleString()} / year`;
}

export async function fetchAdzuna(args: SourceFetchArgs = {}): Promise<Job[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) return [];
  const startedAt = Date.now();
  let rawCount = 0;

  try {
    const page = Math.max(1, args.page ?? 1);
    const limit = Math.max(1, args.limit ?? 20);
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/us/search/${page}`);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("results_per_page", String(limit));
    url.searchParams.set("what", args.query?.trim() || "jobs");
    if (args.location?.trim()) {
      url.searchParams.set("where", args.location.trim());
    }

    const data = await fetchJson<AdzunaResponse>(url.toString());
    const jobs = (data.results ?? []).map((job, index): Job => ({
      id: buildJobId("adzuna", job.id ?? index),
      source: "adzuna",
      title: cleanText(job.title, "Untitled role"),
      company: cleanText(job.company?.display_name, "Unknown company"),
      location: cleanText(job.location?.display_name, "Unknown location"),
      posted: formatPostedLabel(job.created),
      salary: formatSalary(job.salary_min, job.salary_max),
      description: cleanText(job.description).slice(0, 240) || undefined,
      jobUrl: cleanText(job.redirect_url) || undefined,
      searchText: cleanText(job.description),
    }));
    rawCount = jobs.length;
    const stages = applyJobMatchStages(jobs, {
      ...args,
      page: 1,
      limit: jobs.length || limit,
    });

    logSourceSuccess("adzuna", {
      ms: Date.now() - startedAt,
      ...stages.counts,
    });

    return args.skipLocalMatch ? jobs : stages.finalJobs;
  } catch (error) {
    logSourceFailure("adzuna", undefined, error, {
      ms: Date.now() - startedAt,
      raw: rawCount,
      matched: 0,
    });
    return [];
  }
}
