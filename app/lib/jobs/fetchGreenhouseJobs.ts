export type JobCategory = "tech" | "healthcare" | "finance" | "trades";

export type Job = {
  source: "greenhouse";
  sourceId: string;
  board: string;
  companyLabel: string;
  title: string;
  location: string | null;
  department: string | null;
  absoluteUrl: string;
  updatedAt: string | null;
  category: JobCategory;
};

export type FetchGreenhouseJobsParams = {
  q?: string;
  category?: JobCategory;
  limit?: number;
  offset?: number;
};

export type FetchGreenhouseJobsResponse = {
  jobs: Job[];
  meta: {
    total: number;
    offset: number;
    limit: number;
    fetchedAt: string;
    warnings?: Array<{ board: string; error: string }>;
  };
};

// Client helper for calling the Greenhouse aggregate route.
export async function fetchGreenhouseJobs(
  params: FetchGreenhouseJobsParams = {},
): Promise<FetchGreenhouseJobsResponse> {
  const search = new URLSearchParams();

  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (typeof params.limit === "number") search.set("limit", String(params.limit));
  if (typeof params.offset === "number") search.set("offset", String(params.offset));

  const query = search.toString();
  const endpoint = `/api/jobs/greenhouse${query ? `?${query}` : ""}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Greenhouse jobs (${response.status})`);
  }

  return (await response.json()) as FetchGreenhouseJobsResponse;
}
