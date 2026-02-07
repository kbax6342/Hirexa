import { NextResponse } from "next/server";
import type { Job } from "../../lib/jobs/types";
import { fetchAdzunaJobs } from "../../lib/providers/adzuna";

function shuffle<T>(arr: T[]) {
  // Fisher–Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type Cursor = {
  // per-provider pagination state
  adzunaPage: number;
};

function decodeCursor(raw: string | null): Cursor {
  if (!raw) return { adzunaPage: 1 };
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return {
      adzunaPage: typeof parsed.adzunaPage === "number" ? parsed.adzunaPage : 1,
    };
  } catch {
    return { adzunaPage: 1 };
  }
}

function encodeCursor(c: Cursor) {
  const json = JSON.stringify(c);
  return Buffer.from(json, "utf8").toString("base64url");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  const q = (searchParams.get("q") ?? "software engineer").trim();

  const cursor = decodeCursor(searchParams.get("cursor"));

  // --- Start with Adzuna only ---
  const adzunaJobs = await fetchAdzunaJobs({
    query: q,
    page: cursor.adzunaPage,
    limit,
  });

  // later, you’ll also do:
  // const greenhouseJobs = await fetchGreenhouseJobs(...)
  // const leverJobs = await fetchLeverJobs(...)
  // const merged = [...adzunaJobs, ...greenhouseJobs, ...leverJobs]

  const merged: Job[] = [...adzunaJobs];

  // shuffle so sources mix visually
  shuffle(merged);

  // advance provider cursors for next call
  const nextCursor = encodeCursor({
    ...cursor,
    adzunaPage: cursor.adzunaPage + 1,
  });

  return NextResponse.json({
    items: merged,
    nextCursor,
  });
}
