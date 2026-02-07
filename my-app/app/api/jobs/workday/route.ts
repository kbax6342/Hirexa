import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60 * 10;

type JobFull = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  logoText: string;

  // “Details you need”
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

function asText(v: unknown) {
  if (typeof v === "string") return v;
  return "";
}

function stripHtml(html: string) {
  // Minimal safe HTML->text conversion
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|br|h\d)>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitBullets(text: string) {
  // Pull bullets like:
  // • thing
  // - thing
  // * thing
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const bullets = lines
    .map(l => l.replace(/^•\s*/,"").replace(/^-+\s*/,"").replace(/^\*\s*/,"").trim())
    .filter(l => l.length >= 2);
  return bullets.length ? bullets : undefined;
}

function extractSection(fullText: string, header: RegExp, nextHeaders: RegExp[]) {
  // Finds a section starting at header and ending at next header
  const m = fullText.match(header);
  if (!m || m.index == null) return undefined;

  const start = m.index + m[0].length;
  const rest = fullText.slice(start);

  let end = rest.length;
  for (const nh of nextHeaders) {
    const nm = rest.match(nh);
    if (nm && nm.index != null) end = Math.min(end, nm.index);
  }

  const section = rest.slice(0, end).trim();
  return section || undefined;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { res, text, json };
}

/**
 * Workday CXS listing endpoint:
 *   POST {host}/wday/cxs/{tenant}/{site}/jobs
 */
async function listJobsCxs(params: {
  host: string;
  tenant: string;
  site: string;
  limit: number;
  offset: number;
  locale: string;
}) {
  const { host, tenant, site, limit, offset } = params;

  const url = `${host}/wday/cxs/${tenant}/${site}/jobs`;
  const body = JSON.stringify({
    appliedFacets: {},
    limit,
    offset,
    searchText: "",
    sortBy: "mostRecent",
  });

  const { res, json, text } = await fetchJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "x-requested-with": "XMLHttpRequest",
    },
    body,
    next: { revalidate } as any,
  });

  if (!res.ok || !json) {
    throw new Error(
      `Workday list failed (${res.status}). ` +
      `Tenant/site likely wrong. Response: ${text.slice(0, 200)}`
    );
  }

  return json;
}

/**
 * Workday CXS “job detail” is often reachable by calling the externalPath as JSON:
 *   GET {host}/wday/cxs/{tenant}/{site}{externalPath}
 * where externalPath looks like: /job/..._JRxxxx
 */
async function fetchJobDetailCxs(params: {
  host: string;
  tenant: string;
  site: string;
  externalPath?: string;
}) {
  const { host, tenant, site, externalPath } = params;
  if (!externalPath) return null;

  const path = externalPath.startsWith("/") ? externalPath : `/${externalPath}`;
  const url = `${host}/wday/cxs/${tenant}/${site}${path}`;

  const { res, json } = await fetchJson(url, {
    method: "GET",
    headers: { accept: "application/json" },
    next: { revalidate } as any,
  });

  if (!res.ok || !json) return null;
  return json;
}

export async function GET(req: Request) {
  try {
    const host = mustEnv("WORKDAY_HOST").replace(/\/+$/, "");
    const tenant = mustEnv("WORKDAY_TENANT");
    const site = mustEnv("WORKDAY_SITE");
    const locale = process.env.WORKDAY_LOCALE || "en-US";

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "10") || 10, 25);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0") || 0, 0);

    const listing = await listJobsCxs({ host, tenant, site, limit, offset, locale });

    const jobPostings: any[] = Array.isArray(listing?.jobPostings) ? listing.jobPostings : [];

    const jobs: JobFull[] = [];

    for (const p of jobPostings) {
      const title = asText(p?.title) || "Untitled role";
      const externalPath = asText(p?.externalPath);
      const locationsText = asText(p?.locationsText) || "United States";
      const postedOn = asText(p?.postedOn);

      const jobUrl = `${host}/${locale}/${site}${externalPath?.startsWith("/") ? externalPath : externalPath ? `/${externalPath}` : ""}`;

      const base: JobFull = {
        id: `${externalPath || title}-${locationsText}`.slice(0, 120),
        title,
        company: "Finish Line",
        location: locationsText,
        posted: postedOn ? new Date(postedOn).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Recently",
        jobUrl,
        logoText: "F",
      };

      // Try to get full details via CXS job detail JSON
      const detail = await fetchJobDetailCxs({ host, tenant, site, externalPath });

      // Different tenants store description under different keys.
      // Common ones include: jobPostingInfo.jobDescription, jobPostingInfo.additionalJobDescription, etc.
      const htmlDesc =
        asText(detail?.jobPostingInfo?.jobDescription) ||
        asText(detail?.jobPostingInfo?.additionalJobDescription) ||
        asText(detail?.jobPostingInfo?.jobDescriptionHtml) ||
        "";

      if (htmlDesc) {
        const fullText = stripHtml(htmlDesc);

        // Section extraction (best-effort — headers vary by company)
        const responsibilitiesText = extractSection(
          fullText,
          /(responsibilities|what you['’]ll do|impact you['’]ll make)\s*[:\n]/i,
          [
            /(requirements|what you bring|qualifications)\s*[:\n]/i,
            /(benefits|perks|what we offer)\s*[:\n]/i,
          ]
        );

        const requirementsText = extractSection(
          fullText,
          /(requirements|what you bring|qualifications)\s*[:\n]/i,
          [
            /(responsibilities|what you['’]ll do|impact you['’]ll make)\s*[:\n]/i,
            /(benefits|perks|what we offer)\s*[:\n]/i,
          ]
        );

        const benefitsText = extractSection(
          fullText,
          /(benefits|perks|what we offer)\s*[:\n]/i,
          [
            /(requirements|what you bring|qualifications)\s*[:\n]/i,
            /(responsibilities|what you['’]ll do|impact you['’]ll make)\s*[:\n]/i,
          ]
        );

        jobs.push({
          ...base,
          description: fullText,
          responsibilities: responsibilitiesText ? splitBullets(responsibilitiesText) : undefined,
          requirements: requirementsText ? splitBullets(requirementsText) : undefined,
          benefits: benefitsText ? splitBullets(benefitsText) : undefined,
        });
      } else {
        // If no detail payload returned, at least return the basic fields
        jobs.push(base);
      }
    }

    return NextResponse.json(
      {
        source: "workday",
        board: `${host}/${site}`,
        count: jobs.length,
        jobs,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
