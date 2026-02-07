import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60 * 10;

type AdzunaJob = {
  id: string | number;
  title?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  created?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: "0" | "1";
};

type JobCard = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  description?: string;
  pill?: string;
  logoText: string;
};

type LocationSection = {
  name: string; // e.g. "California"
  href: string; // internal route
  jobs: JobCard[];
};

function money(n?: number) {
  if (typeof n !== "number") return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPosted(iso?: string) {
  if (!iso) return "Recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";
  const diffMs = Date.now() - d.getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  return `Posted ${days} days ago`;
}

function normalizeLocationFromAdzuna(job: AdzunaJob) {
  // location.display_name usually includes "City, State"
  return job.location?.display_name || "United States";
}

function salaryPill(job: AdzunaJob) {
  const min = job.salary_min;
  const max = job.salary_max;
  if (typeof min === "number" && typeof max === "number") {
    return `$${money(min)} – $${money(max)} / year`;
  }
  if (typeof min === "number") return `From $${money(min)} / year`;
  if (typeof max === "number") return `Up to $${money(max)} / year`;
  return undefined;
}

function toJobCard(job: AdzunaJob): JobCard | null {
  const title = job.title?.trim();
  const company = job.company?.display_name?.trim() || "Unknown";
  const jobUrl = job.redirect_url || "";

  if (!title || !jobUrl) return null;

  return {
    id: String(job.id),
    title,
    company,
    location: normalizeLocationFromAdzuna(job),
    posted: formatPosted(job.created),
    jobUrl,
    description: job.description?.replace(/\s+/g, " ").trim().slice(0, 180),
    pill: salaryPill(job),
    logoText: company.slice(0, 1).toUpperCase(),
  };
}

async function fetchAdzunaByState(params: {
  stateName: string;
  resultsPerSection: number;
}) {
  const { stateName, resultsPerSection } = params;

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    throw new Error("Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in env");
  }

  const url = new URL("https://api.adzuna.com/v1/api/jobs/us/search/1");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", String(resultsPerSection));
  url.searchParams.set("sort_by", "date");

  // ✅ location-based (state), NOT title-based
  // More reliable than location0 across datasets:
  url.searchParams.set("where", stateName);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new Error(`Adzuna error (${res.status}): ${raw.slice(0, 400)}`);
  }

  let data: { results?: AdzunaJob[] };
  try {
    data = JSON.parse(raw);
    //console.log(data);
  } catch {
    throw new Error(`Adzuna returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const jobs = (data.results || [])
    .map(toJobCard)
    .filter(Boolean) as JobCard[];

  return jobs.slice(0, resultsPerSection);
}


// export async function GET(request: Request) {
//   try {
//     const url = new URL(request.url);

//     // You can pass states in query, or use defaults.
//     // Example: /api/adzuna/by-location?states=California,Texas,Florida&n=3
//     const statesParam = url.searchParams.get("states")?.trim();
//     const n = Number(url.searchParams.get("n") ?? "3");
//     const resultsPerSection = Number.isFinite(n) && n > 0 && n <= 10 ? n : 3;

//     const stateNames = statesParam
//       ? statesParam
//           .split(",")
//           .map((s) => s.trim())
//           .filter(Boolean)
//       : ["California", "Texas", "Florida"];

//     const sectionJobs = await Promise.all(
//       stateNames.map(async (stateName) => {
//         const jobs = await fetchAdzunaByState({ stateName, resultsPerSection });
//         const section: LocationSection = {
//           name: stateName,
//           href: `/jobs?state=${encodeURIComponent(stateName)}`,
//           jobs,
//         };
//         return section;
//       })
//     );

//     return NextResponse.json(
//       {
//         ok: true,
//         sections: sectionJobs,
//         generatedAt: new Date().toISOString(),
//       },
//       { status: 200 }
//     );
//   } catch (err: any) {
//     return NextResponse.json(
//       { error: err?.message ?? "Unknown error" },
//       { status: 500 }
//     );
//   }
// }

export async function GET(request: Request) {
  try {
    // ✅ quick env check
    if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
      return NextResponse.json(
        {
          error: "Missing env vars",
          missing: {
            ADZUNA_APP_ID: !process.env.ADZUNA_APP_ID,
            ADZUNA_APP_KEY: !process.env.ADZUNA_APP_KEY,
          },
        },
        { status: 500 }
      );
    }

    // --- your existing logic below ---
    const url = new URL(request.url);
    const statesParam = url.searchParams.get("states") ?? "California,Texas,Florida";
    const n = Number(url.searchParams.get("n") ?? "3");
    const resultsPerSection = Number.isFinite(n) && n > 0 && n <= 10 ? n : 3;

    const stateNames = statesParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

      const sectionJobs = await Promise.all(
              stateNames.map(async (stateName) => {
                const jobs = await fetchAdzunaByState({ stateName, resultsPerSection });
                const section: LocationSection = {
                  name: stateName,
                  href: `/jobs?state=${encodeURIComponent(stateName)}`,
                  jobs,
                };
                return section;
              })
            );

    // TEMP: just return parsed params (to confirm no crash here)
    return NextResponse.json(
      {
        ok: true,
        sections: sectionJobs,
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
    
  } catch (err: any) {
    console.error("by-location route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error", stack: err?.stack ?? null },
      { status: 500 }
    );
  }
}
