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

type RemoteOkJob = {
  id?: string | number;
  position?: string;
  company?: string;
  date?: string;
  description?: string;
  url?: string;
  location?: string;
};

export async function fetchRemoteOK(args: SourceFetchArgs = {}): Promise<Job[]> {
  const startedAt = Date.now();
  let rawCount = 0;
  try {
    const data = await fetchJson<Array<RemoteOkJob | Record<string, unknown>>>(
      "https://remoteok.com/api"
    );

    const rows = Array.isArray(data) ? data.slice(1) : [];
    const jobs = rows.map((job, index): Job => ({
      id: buildJobId("remoteok", (job as RemoteOkJob).id ?? index),
      source: "remoteok",
      title: cleanText((job as RemoteOkJob).position, "Untitled role"),
      company: cleanText((job as RemoteOkJob).company, "RemoteOK Company"),
      location: cleanText((job as RemoteOkJob).location, "Remote"),
      posted: formatPostedLabel((job as RemoteOkJob).date),
      description:
        cleanText((job as RemoteOkJob).description).slice(0, 240) || undefined,
      jobUrl: cleanText((job as RemoteOkJob).url) || undefined,
      searchText: cleanText((job as RemoteOkJob).description),
    }));
    rawCount = jobs.length;
    const stages = applyJobMatchStages(jobs, args);

    logSourceSuccess("remoteok", {
      ms: Date.now() - startedAt,
      ...stages.counts,
    });

    return args.skipLocalMatch ? jobs : stages.finalJobs;
  } catch (error) {
    logSourceFailure("remoteok", undefined, error, {
      ms: Date.now() - startedAt,
      raw: rawCount,
      matched: 0,
    });
    return [];
  }
}
