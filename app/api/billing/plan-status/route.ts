import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { hasActivePlan } from "@/app/lib/billing/hasActivePlan";

export const runtime = "nodejs";

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
    return NextResponse.json({
      ok: true,
      userId,
      active: false,
      trialSubscriber: false,
      monthlySubscriber: false,
      yearlySubscriber: false,
      planStatus: null,
      trialPlanStatus: null,
      monthlyPlanStatus: null,
      yearlyPlanStatus: null,
      planType: null,
    });
  }

  const active = hasActivePlan(profile);

  const planStatus =
    profile.trialPlanStatus ??
    profile.monthlyPlanStatus ??
    profile.yearlyPlanStatus ??
    null;

  const planType = profile.trialPlanStatus === "active"
    ? "trial"
    : profile.monthlyPlanStatus === "active"
      ? "monthly"
      : profile.yearlyPlanStatus === "active"
        ? "yearly"
        : null;

  return NextResponse.json({
    ok: true,
    userId,
    active,
    trialSubscriber: profile.trialSubscriber ?? false,
    monthlySubscriber: profile.monthlySubscriber ?? false,
    yearlySubscriber: profile.yearlySubscriber ?? false,
    planStatus,
    trialPlanStatus: profile.trialPlanStatus,
    monthlyPlanStatus: profile.monthlyPlanStatus,
    yearlyPlanStatus: profile.yearlyPlanStatus,
    planType,
  });
}
