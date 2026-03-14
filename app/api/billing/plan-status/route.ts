import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import {
  getHirexaAccessForUser,
  getHirexaAccessStateLabel,
} from "@/app/lib/billing/getHirexaAccess";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const access = await getHirexaAccessForUser({
    userId,
    sessionEmail: session?.user?.email ?? null,
  });
  const profile = access.profile;

  return NextResponse.json({
    ok: true,
    userId,
    active: access.active,
    pending: access.pending,
    accessState: getHirexaAccessStateLabel(access),
    trialSubscriber: profile?.trialSubscriber ?? false,
    monthlySubscriber: profile?.monthlySubscriber ?? false,
    yearlySubscriber: profile?.yearlySubscriber ?? false,
    planStatus: access.planStatus,
    trialPlanStatus: profile?.trialPlanStatus ?? null,
    monthlyPlanStatus: profile?.monthlyPlanStatus ?? null,
    yearlyPlanStatus: profile?.yearlyPlanStatus ?? null,
    planType: access.planType,
  });
}
