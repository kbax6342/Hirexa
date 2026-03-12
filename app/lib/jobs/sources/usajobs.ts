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

type USAJobsResponse = {
  SearchResult?: {
    SearchResultItems?: Array<{
      MatchedObjectId?: string;
      MatchedObjectDescriptor?: {
        PositionTitle?: string;
        PositionLocationDisplay?: string;
        PositionURI?: string;
        OrganizationName?: string;
        PublicationStartDate?: string;
        UserArea?: {
          Details?: {
            JobSummary?: string;
          };
        };
      };
    }>;
  };
};

let hasLoggedUsaJobsMissingConfig = false;

export async function fetchUSAJobs(args: SourceFetchArgs = {}): Promise<Job[]> {
  const key = process.env.USAJOBS_KEY;
  const email = process.env.USAJOBS_EMAIL;
  if (!key || !email) {
    if (!hasLoggedUsaJobsMissingConfig) {
      console.warn("[jobs:usajobs] status=skipped detail=\"missing credentials\"");
      hasLoggedUsaJobsMissingConfig = true;
    }
    return [];
  }
  const startedAt = Date.now();
  let rawCount = 0;

  try {
    const page = Math.max(1, args.page ?? 1);
    const limit = Math.max(1, args.limit ?? 20);
    const url = new URL("https://data.usajobs.gov/api/search");
    url.searchParams.set("ResultsPerPage", String(limit));
    url.searchParams.set("Page", String(page));
    if (args.query?.trim()) {
      url.searchParams.set("Keyword", args.query.trim());
    }
    if (args.location?.trim()) {
      url.searchParams.set("LocationName", args.location.trim());
    }

    const data = await fetchJson<USAJobsResponse>(url.toString(), {
      headers: {
        "Authorization-Key": key,
        "User-Agent": email,
        Host: "data.usajobs.gov",
      },
    });

    const jobs =
      data.SearchResult?.SearchResultItems?.map((item, index): Job => ({
        id: buildJobId("usajobs", item.MatchedObjectId ?? index),
        source: "usajobs",
        title: cleanText(
          item.MatchedObjectDescriptor?.PositionTitle,
          "Untitled role"
        ),
        company: cleanText(
          item.MatchedObjectDescriptor?.OrganizationName,
          "USAJobs"
        ),
        location: cleanText(
          item.MatchedObjectDescriptor?.PositionLocationDisplay,
          "United States"
        ),
        posted: formatPostedLabel(
          item.MatchedObjectDescriptor?.PublicationStartDate
        ),
        description:
          cleanText(
            item.MatchedObjectDescriptor?.UserArea?.Details?.JobSummary
          ).slice(0, 240) || undefined,
        jobUrl: cleanText(item.MatchedObjectDescriptor?.PositionURI) || undefined,
        searchText: cleanText(
          item.MatchedObjectDescriptor?.UserArea?.Details?.JobSummary
        ),
      })) ?? [];
    rawCount = jobs.length;
    const stages = applyJobMatchStages(jobs, {
      ...args,
      page: 1,
      limit: jobs.length || limit,
    });

    logSourceSuccess("usajobs", {
      ms: Date.now() - startedAt,
      ...stages.counts,
    });

    return args.skipLocalMatch ? jobs : stages.finalJobs;
  } catch (error) {
    logSourceFailure("usajobs", undefined, error, {
      ms: Date.now() - startedAt,
      raw: rawCount,
      matched: 0,
    });
    return [];
  }
}
