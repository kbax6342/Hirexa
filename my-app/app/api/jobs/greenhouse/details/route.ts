import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;

type GreenhouseJobDetails = {
  id: number | string;
  title?: string;
  absolute_url?: string;
  updated_at?: string;

  location?: { name?: string } | null;
  departments?: Array<{ name?: string }> | null;

  // Greenhouse usually provides these (varies by board)
  content?: string | null; // HTML string
  requisition_id?: string | null;
};

function getParam(url: URL, key: string) {
  const v = url.searchParams.get(key);
  return v ? String(v).trim() : "";
}

/**
 * GET /api/jobs/greenhouse/details?id=board:jobId
 * Example:
 *   /api/jobs/greenhouse/details?id=stripe:123456
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawId = getParam(url, "id");

    if (!rawId || !rawId.includes(":")) {
      return NextResponse.json(
        { error: 'Missing or invalid "id". Expected "board:jobId".' },
        { status: 400 }
      );
    }

    const [board, jobId] = rawId.split(":");
    if (!board || !jobId) {
      return NextResponse.json(
        { error: 'Invalid "id". Expected "board:jobId".' },
        { status: 400 }
      );
    }

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
      board
    )}/jobs/${encodeURIComponent(jobId)}`;

    const r = await fetch(apiUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: `Greenhouse details fetch failed (${r.status})` },
        { status: 502 }
      );
    }

    const data = (await r.json()) as GreenhouseJobDetails;

    // Return a normalized payload your UI can consume directly
    return NextResponse.json({
      job: {
        id: `${board}:${String(data.id ?? jobId)}`,
        source: "greenhouse" as const,
        title: data.title ?? "Untitled role",
        company: board, // UI already displays companyLabel in list; you can override later if you want
        location: data.location?.name ?? "Unknown location",
        posted: data.updated_at ?? "",
        description: data.content ?? "", // HTML string usually
        fullDescriptionHtml: data.content ?? "", // keep name consistent with your existing UI pattern
        jobUrl: data.absolute_url ?? "",
        department: data.departments?.[0]?.name ?? null,
        updatedAt: data.updated_at ?? null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}