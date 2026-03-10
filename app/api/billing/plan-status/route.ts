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
      trialPlanStatus: true,
      monthlyPlanStatus: true,
      yearlyPlanStatus: true,
    },
  });

  if (!profile) {
    return NextResponse.json({
      ok: true,
      active: false,
      planStatus: null,
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
    active,
    planStatus,
    planType,
  });
}
