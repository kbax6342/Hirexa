import { NextResponse } from "next/server";
import { humanizeSlug } from "@/app/lib/jobs/sources/common";

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

const postedDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatPostedDate(iso: string | null | undefined) {
  if (!iso) return "";

  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";

  return postedDateFormatter.format(new Date(parsed));
}

function getParam(url: URL, key: string) {
  const v = url.searchParams.get(key);
  return v ? String(v).trim() : "";
}

function decodeGreenhouseJobId(rawId: string) {
  if (!rawId) {
    return { error: 'Missing or invalid "id".' } as const;
  }

  if (rawId.startsWith("greenhouse:")) {
    const encoded = rawId.slice("greenhouse:".length);

    try {
      const decoded = Buffer.from(encoded, "base64url").toString("utf8");
      const [board, jobId] = decoded.split("::");

      if (!board || !jobId) {
        return {
          error:
            'Invalid "id". Expected encoded payload "greenhouse:<base64(board::jobId)>".',
        } as const;
      }

      return {
        board,
        jobId,
        normalizedId: rawId,
      } as const;
    } catch {
      return {
        error:
          'Invalid "id". Expected encoded payload "greenhouse:<base64(board::jobId)>".',
      } as const;
    }
  }

  if (rawId.includes(":")) {
    const [board, jobId] = rawId.split(":");
    if (!board || !jobId) {
      return { error: 'Invalid "id". Expected "board:jobId".' } as const;
    }

    const normalizedId = `greenhouse:${Buffer.from(
      `${board}::${jobId}`,
      "utf8"
    ).toString("base64url")}`;

    return {
      board,
      jobId,
      normalizedId,
    } as const;
  }

  return { error: 'Invalid "id". Expected a Greenhouse job id.' } as const;
}

/**
 * GET /api/jobs/greenhouse/details?id=board:jobId
 * Example:
 *   /api/jobs/greenhouse/details?id=stripe:123456
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawId = getParam(url, "id");
  const decoded = decodeGreenhouseJobId(rawId);

  if ("error" in decoded) {
    return NextResponse.json({ error: decoded.error }, { status: 400 });
  }

  try {
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
      decoded.board
    )}/jobs/${encodeURIComponent(decoded.jobId)}?content=true`;

    const r = await fetch(apiUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (r.status === 404) {
      console.warn(
        `[jobs:greenhouse:details] board=${decoded.board} jobId=${decoded.jobId} status=404`
      );
      return NextResponse.json(
        { error: "Greenhouse job not found." },
        { status: 404 }
      );
    }

    if (!r.ok) {
      console.warn(
        `[jobs:greenhouse:details] board=${decoded.board} jobId=${decoded.jobId} status=${r.status}`
      );
      return NextResponse.json(
        { error: `Greenhouse details fetch failed (${r.status})` },
        { status: 502 }
      );
    }

    const data = (await r.json()) as GreenhouseJobDetails;

    // Return a normalized payload your UI can consume directly
    return NextResponse.json({
      job: {
        id: decoded.normalizedId,
        source: "greenhouse" as const,
        title: data.title ?? "Untitled role",
        company: humanizeSlug(decoded.board),
        location: data.location?.name ?? "Unknown location",
        posted: formatPostedDate(data.updated_at),
        description: data.content ?? "", // HTML string usually
        fullDescriptionHtml: data.content ?? "", // keep name consistent with your existing UI pattern
        jobUrl: data.absolute_url ?? "",
        department:
          data.departments?.map((department) => department.name).filter(Boolean).join(", ") ??
          null,
        updatedAt: data.updated_at ?? null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.warn(
      `[jobs:greenhouse:details] id=${rawId || "unknown"} status=error detail="${msg}"`
    );
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
