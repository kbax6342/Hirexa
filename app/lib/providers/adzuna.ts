import type { Job } from "../jobs/types";

type AdzunaSearchResponse = {
  results: Array<{
    id: string | number;
    title: string;
    created: string; // ISO date
    redirect_url?: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
    salary_min?: number;
    salary_max?: number;
    description?: string;
  }>;
};

function moneyRange(min?: number, max?: number) {
  if (!min && !max) return undefined;
  if (min && max) return `$${Math.round(min).toLocaleString()} - $${Math.round(max).toLocaleString()} / year`;
  if (min) return `From $${Math.round(min).toLocaleString()} / year`;
  return `Up to $${Math.round(max!).toLocaleString()} / year`;
}

function formatPosted(iso?: string) {
  if (!iso) return "Recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";
  // simple friendly label
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  if (days < 30) return `Posted ${days} days ago`;
  return "Posted 30+ days ago";
}

// export async function fetchAdzunaJobs(args: {
//   query: string;
//   page: number;   // 1-based
//   limit: number;  // per page
// }): Promise<Job[]> {
//   const { query, page, limit } = args;

//   const appId = process.env.ADZUNA_APP_ID;
//   const appKey = process.env.ADZUNA_APP_KEY;
//   if (!appId || !appKey) throw new Error("Missing ADZUNA_APP_ID / ADZUNA_APP_KEY");

//   const params = new URLSearchParams({
//     app_id: appId,
//     app_key: appKey,
//     results_per_page: String(limit),
//     what: query,
//     content_type: "application/json",
//   });

//   // US endpoint (adjust country if needed)
//   const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;

//   const res = await fetch(url, { cache: "no-store" });
//   if (!res.ok) throw new Error(`Adzuna error: ${res.status}`);

//   const data = (await res.json()) as AdzunaSearchResponse;

//   return (data.results ?? []).map((r) => ({
//     id: `adzuna:${r.id}`,
//     source: "adzuna",
//     title: r.title ?? "Untitled role",
//     company: r.company?.display_name ?? "Unknown",
//     location: r.location?.display_name ?? "Unknown",
//     posted: formatPosted(r.created),
//     salary: moneyRange(r.salary_min, r.salary_max),
//     // keep list description short-ish
//     description: r.description ? r.description.slice(0, 240) + (r.description.length > 240 ? "…" : "") : "",
//     jobUrl: r.redirect_url,
//   }));
// }
export async function fetchAdzunaJobs(args: {
  query: string;
  page: number;   // 1-based
  limit: number;  // per page
}) {
  const { query, page, limit } = args;

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) throw new Error("Missing ADZUNA_APP_ID / ADZUNA_APP_KEY");

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(limit),
    what: query,

    // ✅ IMPORTANT: Adzuna expects "content-type" (dash), not "content_type"
    "content-type": "application/json",
  });

  const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  // ✅ Make the error useful (Adzuna returns JSON error details)
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Adzuna error: ${res.status} ${res.statusText} :: ${body}`);
  }

  const data = (await res.json()) as any;

  return (data.results ?? []).map((r: any) => ({
    id: `adzuna:${r.id}`,
    source: "adzuna",
    title: r.title ?? "Untitled role",
    company: r.company?.display_name ?? "Unknown",
    location: r.location?.display_name ?? "Unknown",
    posted: r.created ?? "Recently",
    salary:
      r.salary_min && r.salary_max
        ? `$${Math.round(r.salary_min).toLocaleString()} - $${Math.round(r.salary_max).toLocaleString()} / year`
        : undefined,
    description: (r.description ?? "").slice(0, 240),
    jobUrl: r.redirect_url,
  }));
}

// export async function fetchAdzunaJobDetails(fullId: string): Promise<Job | null> {
//   // fullId looks like "adzuna:12345"
//   const providerId = fullId.split(":")[1];
//   if (!providerId) return null;

//   // Option A (simple): fetch a page and find it (works if you already have it in list)
//   // Better later: store jobs in DB and just read by id.
//   const page1 = await fetchAdzunaJobs({ query: "software engineer", page: 1, limit: 50 });
//   const match = page1.find((j) => j.id === fullId);

//   if (!match) return null;

//   // Ensure this field contains HTML if you have it.
//   // If you don't, you can still display as plain text.
//   return {
//     ...match,
//     description: match.description ?? "",
//     // Add fullDescriptionHtml if you have it later
//     // fullDescriptionHtml: "<p>...</p>"
//   };
// }


export async function fetchAdzunaJobDetails(
  fullId: string,
  origin: string
): Promise<Job | null> {
  // fullId = "adzuna:5610241599"
  const [, providerId] = fullId.split(":");
  if (!providerId) return null;

  const res = await fetch(
    `${origin}/api/adzuna/details?id=${encodeURIComponent(providerId)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Adzuna details failed: ${res.status} :: ${body}`);
  }

  const data = await res.json();

  return {
    id: `adzuna:${providerId}`,
    source: "adzuna",
    title: data.title ?? "Untitled role",
    company: data.company ?? "Unknown company",
    location: data.location ?? "Unknown location",
    posted: data.posted ?? "Recently",
    salary: data.salary,
    jobUrl: data.jobUrl,
    description: data.description ?? "",
    // fullDescriptionHtml: data.fullDescriptionHtml,
  };
}
