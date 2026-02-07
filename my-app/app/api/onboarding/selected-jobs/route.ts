import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { auth } from "../../../lib/auth";
import { cookies } from "next/headers";

type SelectedJob = { uuid?: string; title?: string };
type CookieShape =
  | { selectedJobs?: SelectedJob[] }
  | { selectedJobTitles?: string[] }
  | { jobs?: SelectedJob[] }
  | unknown;

function parseJobsFromCookie(raw: string): string[] {
  if (!raw) return [];

  let parsed: CookieShape;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const titles = (parsed as any)?.selectedJobTitles;
  if (Array.isArray(titles)) {
    return titles.map((s) => String(s).trim()).filter(Boolean);
  }

  const jobs = (parsed as any)?.selectedJobs ?? (parsed as any)?.jobs;
  if (Array.isArray(jobs)) {
    return jobs.map((j: any) => String(j?.title ?? "").trim()).filter(Boolean);
  }

  return [];
}

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies(); // Next 15: cookies() is async
    const guestId = c.get("guest_user_id")?.value ?? null;

    // 1) Try DB first (source of truth)
    if (userId || guestId) {
      const profile = await prisma.userProfile.findUnique({
        where: userId ? { userId } : { guestId: guestId! },
        select: { id: true },
      });

      if (profile) {
        const interests = await prisma.jobInterest.findMany({
          where: { userProfileId: profile.id },
          select: { title: true },
          orderBy: { id: "asc" },
          take: 5,
        });

        const dbJobs = interests.map((x) => x.title).filter(Boolean);
        if (dbJobs.length) {
          return NextResponse.json({ jobs: dbJobs }, { status: 200 });
        }
      }
    }

    // 2) Optional fallback: cookie-based titles (only if you use these cookies)
    const raw =
      c.get("hirexa_selected_jobs")?.value ??
      c.get("hirexa_onboarding")?.value ??
      "";

    const cookieJobs = parseJobsFromCookie(raw).slice(0, 5);

    return NextResponse.json({ jobs: cookieJobs }, { status: 200 });
  } catch {
    return NextResponse.json(
      { jobs: [], error: "Failed to load selected jobs" },
      { status: 500 }
    );
  }
}
