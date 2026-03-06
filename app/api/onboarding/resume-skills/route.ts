// src/app/api/onboarding/resume-skills/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { auth } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  // Not logged in (or session not available yet) -> return empty safely
  if (!userId) {
    return NextResponse.json({ skills: [] }, { status: 200 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { resumeSkills: true, skills: true },
  });

  return NextResponse.json({
    skills: profile?.resumeSkills?.length
      ? profile.resumeSkills
      : profile?.skills ?? [],
  });
}
