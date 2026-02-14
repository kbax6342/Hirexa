import { parseJobDescription } from "@/app/lib/jobs/parse-job";
import { NextResponse } from "next/server";
import { fetchAdzunaJobDetails } from "../../../lib/providers/adzuna";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fullId = (searchParams.get("id") ?? "").trim();

  if (!fullId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const [source] = fullId.split(":");
  if (!source) {
    return NextResponse.json(
      { error: "Invalid id format. Expected source:providerId" },
      { status: 400 }
    );
  }

  const origin = new URL(req.url).origin;

  try {
    if (source === "adzuna") {
      const job = await fetchAdzunaJobDetails(fullId, origin);

      if (!job) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const pretty = parseJobDescription(job.description ?? " ");
      return NextResponse.json({ job, pretty });
    }

    return NextResponse.json(
      {
        error: `Details are currently supported for Adzuna jobs only. Got: ${source}`,
      },
      { status: 400 }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load details" },
      { status: 500 }
    );
  }
}
