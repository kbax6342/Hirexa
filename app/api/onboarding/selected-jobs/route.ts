import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { auth } from "../../../lib/auth";
import { cookies } from "next/headers";
import {
  getActiveOnboardingDraftForCookies,
  pickDraftGuestId,
  readDraftSection,
  readOnboardingDraftPayload,
} from "@/app/lib/onboarding/draft-session";

type SelectedJob = { uuid?: string; title?: string };
type CookieShape =
  | { selectedJobs?: SelectedJob[] }
  | { selectedJobTitles?: string[] }
  | { jobs?: SelectedJob[] }
  | unknown;

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJobsFromCookie(raw: string): string[] {
  if (!raw) return [];

  let parsed: CookieShape;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const record = readRecord(parsed);
  if (!record) return [];

  const titles = record.selectedJobTitles;
  if (Array.isArray(titles)) {
    return titles.map((s) => String(s).trim()).filter(Boolean);
  }

  const jobs = record.selectedJobs ?? record.jobs;
  if (Array.isArray(jobs)) {
    return jobs
      .map((job) => {
        const item = readRecord(job);
        return String(item?.title ?? "").trim();
      })
      .filter(Boolean);
  }

  return [];
}

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies(); // Next 15: cookies() is async
    const guestId = c.get("guest_user_id")?.value ?? null;
    const draft = !userId ? await getActiveOnboardingDraftForCookies(c) : null;
    const effectiveGuestId =
      !userId && draft
        ? guestId ?? pickDraftGuestId({ cookieStore: c, draft })
        : guestId;

    // DB-backed single target role is the source of truth for the live feed.
    if (userId || effectiveGuestId) {
      const profile = await prisma.userProfile.findUnique({
        where: userId ? { userId } : { guestId: effectiveGuestId! },
        select: { id: true },
      });

      if (profile) {
        const interests = await prisma.jobInterest.findMany({
          where: { userProfileId: profile.id },
          select: { title: true },
          orderBy: { id: "asc" },
          take: 1,
        });

        const dbJobs = interests.map((x) => x.title).filter(Boolean).slice(0, 1);
        if (dbJobs[0]) {
          return NextResponse.json(
            { jobs: dbJobs, roleFocus: dbJobs[0] },
            { status: 200 }
          );
        }
      }
    }

    if (!userId && draft) {
      const draftPayload = readOnboardingDraftPayload(draft.payload);
      const draftJobInterests = readDraftSection<{
        jobs?: Array<{ title?: string }>;
        roleFocus?: string | null;
      }>(draftPayload.jobInterests);
      const draftJobs = Array.isArray(draftJobInterests.jobs)
        ? draftJobInterests.jobs
            .map((job) => String(job?.title ?? "").trim())
            .filter(Boolean)
            .slice(0, 1)
        : [];
      const roleFocus = String(draftJobInterests.roleFocus ?? "").trim() || null;
      const jobs = draftJobs[0] ? draftJobs : roleFocus ? [roleFocus] : [];

      return NextResponse.json(
        { jobs, roleFocus: jobs[0] ?? roleFocus },
        { status: 200 }
      );
    }

    // 2) Optional fallback: cookie-based titles (only if you use these cookies)
    const raw =
      c.get("hirexa_selected_jobs")?.value ??
      c.get("hirexa_onboarding")?.value ??
      "";

    const cookieJobs = parseJobsFromCookie(raw).slice(0, 1);

    return NextResponse.json(
      { jobs: cookieJobs, roleFocus: cookieJobs[0] ?? null },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { jobs: [], roleFocus: null, error: "Failed to load selected jobs" },
      { status: 500 }
    );
  }
}
