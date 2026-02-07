import { parseJobDescription } from "@/app/lib/jobs/parse-job";
import { NextResponse } from "next/server";
import { fetchAdzunaJobDetails } from "../../../lib/providers/adzuna"; // <-- update path to your file


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
  }``

  // ✅ REQUIRED for server-side fetch
  const origin = new URL(req.url).origin;

  try {
    if (source === "adzuna") {
      // 👇 PASS BOTH ARGUMENTS
      const job = await fetchAdzunaJobDetails(fullId, origin);
      const pretty = parseJobDescription(job?.description?? " ");

      if (!job) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({ job, pretty });
    }

    return NextResponse.json(
      { error: `Unsupported source: ${source}` },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load details" },
      { status: 500 }
    );
  }
}

