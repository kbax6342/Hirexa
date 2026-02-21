import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";

export const runtime = "nodejs";

function isActivePlan(planStatus: string | null) {
  // Stripe subscription statuses you care about
  // You can tweak this list based on how you bill users
  return (
    planStatus === "active" ||
    planStatus === "trialing"
    // optionally treat past_due as "still allowed" if you want:
    // || planStatus === "past_due"
  );
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      planStatus: true,
      planType: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  const active = isActivePlan(profile.planStatus ?? null);

  return NextResponse.json({
    ok: true,
    active,
    planStatus: profile.planStatus,
    planType: profile.planType,
    currentPeriodEnd: profile.currentPeriodEnd,
    cancelAtPeriodEnd: profile.cancelAtPeriodEnd,
  });
}