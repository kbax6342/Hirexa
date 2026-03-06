import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";

export const runtime = "nodejs";

function isActivePlanStatus(planStatus: string | null | undefined) {
  return planStatus === "active" || planStatus === "trialing";
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      trialSubscriber: true,
      monthlySubscriber: true,
      yearlySubscriber: true,
      trialPlanStatus: true,
      monthlyPlanStatus: true,
      yearlyPlanStatus: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  const active =
    profile.trialSubscriber ||
    profile.monthlySubscriber ||
    profile.yearlySubscriber ||
    isActivePlanStatus(profile.trialPlanStatus) ||
    isActivePlanStatus(profile.monthlyPlanStatus) ||
    isActivePlanStatus(profile.yearlyPlanStatus);

  const planStatus =
    profile.trialPlanStatus ?? profile.monthlyPlanStatus ?? profile.yearlyPlanStatus ?? null;

  const planType = profile.trialSubscriber
    ? "trial"
    : profile.monthlySubscriber
      ? "monthly"
      : profile.yearlySubscriber
        ? "yearly"
        : null;

  return NextResponse.json({
    ok: true,
    active,
    planStatus,
    planType,
  });
}
