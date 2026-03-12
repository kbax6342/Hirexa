import type { Job } from "./types";
import { fetchAdzuna } from "./sources/adzuna";
import { fetchAshby } from "./sources/ashby";
import {
  ASHBY_COMPANIES,
  GREENHOUSE_COMPANIES,
  LEVER_COMPANIES,
  WORKABLE_COMPANIES,
} from "./sources/boards";
import { dedupeJobs, shuffleArray, type SourceFetchArgs } from "./sources/common";
import { fetchGreenhouse } from "./sources/greenhouse";
import { fetchLever } from "./sources/lever";
import { fetchRemoteOK } from "./sources/remoteok";
import { fetchRemotive } from "./sources/remotive";
import { fetchUSAJobs } from "./sources/usajobs";
import { fetchWorkable } from "./sources/workable";

export type FetchAllJobsArgs = SourceFetchArgs;

type FetchAllJobsResult = {
  jobs: Job[];
  counts: Partial<Record<Job["source"], number>>;
};

async function flattenSettledResults(
  source: Job["source"],
  results: PromiseSettledResult<Job[]>[]
) {
  const fulfilled = results
    .filter((result): result is PromiseFulfilledResult<Job[]> => result.status === "fulfilled")
    .flatMap((result) => result.value);

  return {
    source,
    jobs: fulfilled,
    count: fulfilled.length,
  };
}

export async function fetchAllJobs(args: FetchAllJobsArgs = {}): Promise<FetchAllJobsResult> {
  const [
    greenhouseResults,
    leverResults,
    ashbyResults,
    workableResults,
    adzunaResult,
    usajobsResult,
    remotiveResult,
    remoteokResult,
  ] = await Promise.all([
    Promise.allSettled(GREENHOUSE_COMPANIES.map((company) => fetchGreenhouse(company, args))),
    Promise.allSettled(LEVER_COMPANIES.map((company) => fetchLever(company, args))),
    Promise.allSettled(ASHBY_COMPANIES.map((company) => fetchAshby(company, args))),
    Promise.allSettled(WORKABLE_COMPANIES.map((company) => fetchWorkable(company, args))),
    fetchAdzuna(args),
    fetchUSAJobs(args),
    fetchRemotive(args),
    fetchRemoteOK(args),
  ]);

  const greenhouse = await flattenSettledResults("greenhouse", greenhouseResults);
  const lever = await flattenSettledResults("lever", leverResults);
  const ashby = await flattenSettledResults("ashby", ashbyResults);
  const workable = await flattenSettledResults("workable", workableResults);

  const bySource = [
    greenhouse,
    lever,
    ashby,
    workable,
    { source: "adzuna" as const, jobs: adzunaResult, count: adzunaResult.length },
    { source: "usajobs" as const, jobs: usajobsResult, count: usajobsResult.length },
    { source: "remotive" as const, jobs: remotiveResult, count: remotiveResult.length },
    { source: "remoteok" as const, jobs: remoteokResult, count: remoteokResult.length },
  ];

  const counts = Object.fromEntries(
    bySource.map((entry) => [entry.source, entry.count])
  ) as FetchAllJobsResult["counts"];

  const mergedJobs = dedupeJobs(bySource.flatMap((entry) => entry.jobs));

  return {
    jobs: shuffleArray(mergedJobs),
    counts,
  };
}
