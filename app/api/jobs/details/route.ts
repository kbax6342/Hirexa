import { NextResponse } from "next/server";
import type { Job } from "@/app/lib/jobs/types";
import { resolveJobDetail } from "@/app/lib/jobs/detailResolver";

function isJobSummary(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Job>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.company === "string" &&
    typeof candidate.location === "string" &&
    typeof candidate.posted === "string"
  );
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const detail = await resolveJobDetail({ id, origin });
    return NextResponse.json(detail);
  } catch (error) {
    console.error("[JOB_DETAILS] GET failed", {
      id,
      error: error instanceof Error ? error.message : "Failed to load job details",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load job details",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;

  try {
    const body = (await req.json()) as { job?: unknown };
    if (!isJobSummary(body.job)) {
      return NextResponse.json(
        { error: "Invalid job summary payload" },
        { status: 400 }
      );
    }

    const detail = await resolveJobDetail({
      id: body.job.id,
      origin,
      summary: body.job,
    });

    return NextResponse.json(detail);
  } catch (error) {
    console.error("[JOB_DETAILS] POST failed", {
      error: error instanceof Error ? error.message : "Failed to load job details",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load job details",
      },
      { status: 500 }
    );
  }
}
