import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// export async function GET(req: Request) {
//   try {
//     const url = new URL(req.url);
//     const resumeId = url.searchParams.get("resumeId");

//     if (!resumeId) {
//       return NextResponse.json({ error: "Missing resumeId" }, { status: 400 });
//     }

//     const session = await auth();
//     const userId = session?.user?.id ?? null;

//     const c = await cookies();
//     const guestId = c.get("guest_user_id")?.value ?? null;

//     if (!userId && !guestId) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const profile = await prisma.userProfile.findUnique({
//       where: userId ? { userId } : { guestId: guestId! },
//       select: { id: true },
//     });

//     if (!profile) {
//       return NextResponse.json({ error: "Profile not found" }, { status: 404 });
//     }

//     // Ensure resume belongs to this profile
//     const resume = await prisma.resume.findFirst({
//       where: {
//         id: resumeId,
//         userProfile: { id: profile.id },
//       },
//       select: { id: true },
//     });
    

//     if (!resume) {
//       return NextResponse.json({ error: "Resume not found for this user" }, { status: 404 });
//     }

//     const row = await prisma.resumeExperience.findUnique({
//       where: { resumeId: resume.id },
//       select: { experiences: true },
//     });

//     return NextResponse.json({ experiences: row?.experiences ?? [] }, { status: 200 });
//   } catch (e: any) {
//     console.error("GET /api/resume/experience error:", e);
//     return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
//   }
// }


export async function GET(req: Request) {
  const url = new URL(req.url);
  const resumeId = url.searchParams.get("resumeId");
  if (!resumeId) return NextResponse.json({ experiences: [] });

  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
    include: { experiences: true },
  });

  return NextResponse.json({ experiences: resume?.experiences ?? [] });
}

