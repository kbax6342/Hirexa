import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";

const PAID_PAYMENT_STATUSES = ["paid", "succeeded", "active", "trialing"];
const ACTIVE_PLAN_STATUSES = ["active", "trialing", "paid", "succeeded"];

export async function getPaidAccessForUser(userId: string): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      registrationStatus: true,
      trialSubscriber: true,
      monthlySubscriber: true,
      yearlySubscriber: true,
      trialPlanStatus: true,
      monthlyPlanStatus: true,
      yearlyPlanStatus: true,
      lastPaymentReceivedAt: true,
      stripePayments: {
        where: { status: { in: PAID_PAYMENT_STATUSES } },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!profile) return false;

  if (profile.stripePayments.length > 0) return true;

  if (profile.trialSubscriber || profile.monthlySubscriber || profile.yearlySubscriber) {
    return true;
  }

  if (
    [profile.trialPlanStatus, profile.monthlyPlanStatus, profile.yearlyPlanStatus].some(
      (status) => status && ACTIVE_PLAN_STATUSES.includes(status),
    )
  ) {
    return true;
  }

  if (profile.registrationStatus === "paid" || profile.registrationStatus === "active") {
    return true;
  }

  return Boolean(profile.lastPaymentReceivedAt);
}

export async function requirePaidAccess(returnTo: string): Promise<{ userId: string }> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const hasPaidAccess = await getPaidAccessForUser(userId);

  if (!hasPaidAccess) {
    redirect(`/job-hunter-pack?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return { userId };
}
