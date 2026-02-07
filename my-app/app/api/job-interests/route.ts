// app/api/job-interests/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";

type IncomingJob = { uuid: string; title: string };

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const c = await cookies(); // Next 15: cookies() is async
  const guestId = c.get("guest_user_id")?.value ?? null;

  // ✅ allow either a logged-in user OR a guest
  if (!userId && !guestId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const jobs: IncomingJob[] = Array.isArray(body?.jobs) ? body.jobs : [];
  if (jobs.length === 0) {
    return NextResponse.json({ error: "No jobs provided" }, { status: 400 });
  }

  // ✅ upsert profile by userId (if logged in) else guestId
  const profile = await prisma.userProfile.upsert({
    where: userId ? { userId } : { guestId: guestId! },
    update: {},
    create: userId ? { userId } : { guestId: guestId! },
    select: { id: true },
  });
  console.log(Object.keys(prisma.userProfile.fields ?? {}));


  const userProfileId = profile.id;

  await prisma.$transaction([
    prisma.jobInterest.deleteMany({ where: { userProfileId } }),
    prisma.jobInterest.createMany({
      data: jobs.slice(0, 5).map((j) => ({
        userProfileId,
        uuid: String(j.uuid),
        title: String(j.title),
      })),
      skipDuplicates: true,
    }),
  ]);

  return NextResponse.json({ ok: true });
}
