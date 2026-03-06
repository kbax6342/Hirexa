import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma";
import { auth } from "../../../lib/auth";

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ ok: false, error: "No session (user or guest)" }, { status: 401 });
    }

    const cookieSnapshot = {
      guest_user_id: guestId,

      resume_id: c.get("resume_id")?.value ?? null,
      resume_uploaded: c.get("resume_uploaded")?.value ?? null,

      job_interest_ids: c.get("job_interest_ids")?.value ?? null,
      job_interest_titles: c.get("job_interest_titles")?.value ?? null,

      min_comp_type: c.get("min_comp_type")?.value ?? null,
      min_comp_value: c.get("min_comp_value")?.value ?? null,
      onboarding_min_salary_saved: c.get("onboarding_min_salary_saved")?.value ?? null,
    };

    const profile = await prisma.userProfile.findUnique({
      where: userId ? { userId } : { guestId: guestId! },
      select: {
        id: true,
        userId: true,
        guestId: true,

        minCompensation: true,
        compensationType: true,

        resume: { select: { id: true } },

        resumeFiles: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },

        jobInterests: {
            orderBy: { id: "desc" },
            take: 10,
            select: {
              id: true,
              uuid: true,
              title: true,
            },
          },
      },
    });

    const hasResume =
      !!profile?.resume ||
      (profile?.resumeFiles?.length ?? 0) > 0 ||
      !!cookieSnapshot.resume_uploaded ||
      !!cookieSnapshot.resume_id;

    return NextResponse.json({
      ok: true,
      session: { userId, guestId },
      cookies: cookieSnapshot,
      hasProfile: !!profile,
      profile,
      hasResume,
      jobInterestCount: profile?.jobInterests?.length ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
