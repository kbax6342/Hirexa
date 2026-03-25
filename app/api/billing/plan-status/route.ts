import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import {
  getHirexaAccessForUser,
  getHirexaAccessStateLabel,
} from "@/app/lib/billing/getHirexaAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const forceSync = new URL(req.url).searchParams.get("forceSync") === "1";

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  console.info("[SUB_ACCESS] plan-status request", {
    userId,
    forceSync,
    sessionEmail: session?.user?.email ?? null,
  });

  const access = await getHirexaAccessForUser({
    userId,
    sessionEmail: session?.user?.email ?? null,
    forceSync,
  });
  const profile = access.profile;

  console.info("[SUB_ACCESS] plan-status response", {
    userId,
    forceSync,
    active: access.active,
    pending: access.pending,
    accessState: getHirexaAccessStateLabel(access),
    planType: access.planType,
    planStatus: access.planStatus,
    stripeCustomerId: profile?.stripeCustomerId ?? null,
    stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
    subscriptionEmail: profile?.subscriptionEmail ?? null,
    lastPaymentReceivedAt: profile?.lastPaymentReceivedAt?.toISOString() ?? null,
    subscriptionCheckedAt: profile?.subscriptionCheckedAt?.toISOString() ?? null,
  });

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
