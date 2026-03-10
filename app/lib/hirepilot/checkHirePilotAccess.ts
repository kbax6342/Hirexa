import "server-only";

import { prisma } from "@/app/lib/prisma";

export const HIREPILOT_SESSION_COOKIE = "hirepilot_session_id";

export type HirePilotAccessResult = {
  allowed: boolean;
  unlimited: boolean;
  credits: number;
};

export async function getHirePilotBillingStatus(
  userId: string
): Promise<{ hirePilotUnlimited: boolean; hirePilotCredits: number }> {
  const billing = await prisma.userBilling.findUnique({
    where: { userId },
    select: {
      hirePilotUnlimited: true,
      hirePilotCredits: true,
    },
  });

  return {
    hirePilotUnlimited: billing?.hirePilotUnlimited ?? false,
    hirePilotCredits: billing?.hirePilotCredits ?? 0,
  };
}

export async function checkHirePilotAccess(
  userId: string,
  options?: { consumeCredit?: boolean }
): Promise<HirePilotAccessResult> {
  const consumeCredit = Boolean(options?.consumeCredit);

  return prisma.$transaction(async (tx) => {
    const billing = await tx.userBilling.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: {
        hirePilotUnlimited: true,
        hirePilotCredits: true,
      },
    });

    if (billing.hirePilotUnlimited) {
      return {
        allowed: true,
        unlimited: true,
        credits: billing.hirePilotCredits,
      };
    }

    if (billing.hirePilotCredits <= 0) {
      return {
        allowed: false,
        unlimited: false,
        credits: 0,
      };
    }

    if (!consumeCredit) {
      return {
        allowed: true,
        unlimited: false,
        credits: billing.hirePilotCredits,
      };
    }

    const updated = await tx.userBilling.updateMany({
      where: {
        userId,
        hirePilotUnlimited: false,
        hirePilotCredits: { gt: 0 },
      },
      data: {
        hirePilotCredits: { decrement: 1 },
      },
    });

    const refreshed = await tx.userBilling.findUnique({
      where: { userId },
      select: {
        hirePilotUnlimited: true,
        hirePilotCredits: true,
      },
    });

    if (!updated.count || !refreshed) {
      return {
        allowed: false,
        unlimited: false,
        credits: 0,
      };
    }

    return {
      allowed: true,
      unlimited: refreshed.hirePilotUnlimited,
      credits: refreshed.hirePilotCredits,
    };
  });
}
