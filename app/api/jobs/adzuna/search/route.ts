import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AdzunaJobResult = {
  source: "adzuna";
  sourceJobId: string;
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  descriptionSnippet: string;
};

export async function GET(req: Request) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return NextResponse.json(
      { ok: false, error: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") ?? "software engineer").trim();
  const location = String(searchParams.get("location") ?? "").trim();
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const adzunaUrl = new URL(`https://api.adzuna.com/v1/api/jobs/us/search/${page}`);
  adzunaUrl.searchParams.set("app_id", appId);
  adzunaUrl.searchParams.set("app_key", appKey);
  adzunaUrl.searchParams.set("what", q);
  adzunaUrl.searchParams.set("results_per_page", "20");
  if (location) adzunaUrl.searchParams.set("where", location);

  const res = await fetch(adzunaUrl.toString(), { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `Adzuna request failed: ${res.status}` },
      { status: 502 },
    );
  }

  const data = await res.json();

  const jobs: AdzunaJobResult[] = Array.isArray(data?.results)
    ? data.results.map((item: any) => ({
        source: "adzuna",
        sourceJobId: String(item.id ?? ""),
        title: String(item.title ?? "Untitled role"),
        company: String(item.company?.display_name ?? "Unknown company"),
        location: String(item.location?.display_name ?? "Unknown location"),
        jobUrl: String(item.redirect_url ?? item.adref ?? ""),
        descriptionSnippet: String(item.description ?? "").slice(0, 200),
      }))
    : [];

  return NextResponse.json({ ok: true, jobs });
}
