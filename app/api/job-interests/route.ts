// // app/api/job-interests/route.ts
// import { NextResponse } from "next/server";
// import { prisma } from "@/app/lib/prisma";
// import { auth } from "@/app/lib/auth";
// import { cookies } from "next/headers";

// type IncomingJob = { uuid: string; title: string };

// export async function POST(req: Request) {
//   const session = await auth();
//   const userId = session?.user?.id ?? null;

//   const c = await cookies(); // Next 15: cookies() is async
//   const guestId = c.get("guest_user_id")?.value ?? null;

//   // ✅ allow either a logged-in user OR a guest
//   if (!userId && !guestId) {
//     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//   }

//   const body = await req.json().catch(() => null);
//   const jobs: IncomingJob[] = Array.isArray(body?.jobs) ? body.jobs : [];
//   if (jobs.length === 0) {
//     return NextResponse.json({ error: "No jobs provided" }, { status: 400 });
//   }

//   // ✅ upsert profile by userId (if logged in) else guestId
//   const profile = await prisma.userProfile.upsert({
//     where: userId ? { userId } : { guestId: guestId! },
//     update: {},
//     create: userId ? { userId } : { guestId: guestId! },
//     select: { id: true },
//   });
//   console.log(Object.keys(prisma.userProfile.fields ?? {}));


//   const userProfileId = profile.id;

//   await prisma.$transaction([
//     prisma.jobInterest.deleteMany({ where: { userProfileId } }),
//     prisma.jobInterest.createMany({
//       data: jobs.slice(0, 5).map((j) => ({
//         userProfileId,
//         uuid: String(j.uuid),
//         title: String(j.title),
//       })),
//       skipDuplicates: true,
//     }),
//   ]);

//   return NextResponse.json({ ok: true });
// }
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";

type Job = { uuid: string; title: string };

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ ok: false, error: "Missing user/guest session." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const jobs: Job[] = Array.isArray(body?.jobs) ? body.jobs : [];

    if (jobs.length === 0) {
      return NextResponse.json({ ok: false, error: "No jobs provided." }, { status: 400 });
    }
    if (jobs.length > 5) {
      return NextResponse.json({ ok: false, error: "Max 5 job titles allowed." }, { status: 400 });
    }

    // Ensure profile exists
    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId ? { userId } : { guestId: guestId! },
      update: {},
      select: { id: true },
    });

    // Keep this aligned with the current onboarding resume model.
    const latestResume = await prisma.resume.findUnique({
      where: { userProfileId: profile.id },
      select: { id: true, filename: true, createdAt: true },
    });
    const resumeSkipped = c.get("onboarding_resume_skipped")?.value === "1";
    const hasResume = Boolean(latestResume);

    // ✅ Store jobs in cookies (small data only!)
    // Keep it compact to avoid cookie size issues
    const jobIds = jobs.map((j) => j.uuid);
    const jobTitles = jobs.map((j) => j.title);

    c.set("job_interest_ids", JSON.stringify(jobIds), { httpOnly: true, sameSite: "lax", path: "/" });
    c.set("job_interest_titles", JSON.stringify(jobTitles), { httpOnly: true, sameSite: "lax", path: "/" });
    c.set("job_interest_count", String(jobs.length), { httpOnly: true, sameSite: "lax", path: "/" });

    // Also store a simple step flag
    c.set("onboarding_job_interests_saved", "1", { httpOnly: true, sameSite: "lax", path: "/" });

    // ✅ Return "printed proof" in JSON
    return NextResponse.json({
      ok: true,
      profileId: profile.id,
      guestId,
      userId,
      resume: {
        hasResume,
        dbResumeId: latestResume?.id ?? null,
        cookieResumeId: null,
        fileName: latestResume?.filename ?? null,
        skippedDuringOnboarding: resumeSkipped,
      },
      jobs: {
        count: jobs.length,
        ids: jobIds,
        titles: jobTitles,
      },
      cookiesSet: {
        job_interest_ids: true,
        job_interest_titles: true,
        job_interest_count: true,
        onboarding_job_interests_saved: true,
      },
      note: "This proves job interests were stored and shows whether resume upload was completed or skipped during onboarding.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

