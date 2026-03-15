import "server-only";

import { prisma } from "@/app/lib/prisma";
import {
  BILLING_PRODUCT_KEYS,
} from "@/app/lib/billing/userBilling";
import {
  getHirePilotBillingStatus as getCanonicalHirePilotBillingStatus,
  summarizeHirePilotBillingRows,
} from "@/app/lib/billing/hirepilotBilling";

export const HIREPILOT_SESSION_COOKIE = "hirepilot_session_id";

export type HirePilotAccessResult = {
  allowed: boolean;
  unlimited: boolean;
  credits: number;
};

type BillingRows = Array<{
  id: string;
  productKey: string;
  status: string | null;
  hirePilotUnlimited: boolean;
  hirePilotCredits: number;
  currentPeriodEnd: Date | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
}>;

export async function getHirePilotBillingStatus(
  userId: string
){
  return getCanonicalHirePilotBillingStatus(userId);
}

export async function checkHirePilotAccess(
  userId: string,
  options?: { consumeCredit?: boolean }
): Promise<HirePilotAccessResult> {
  const consumeCredit = Boolean(options?.consumeCredit);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.userBilling.findMany({
      where: {
        userId,
        productKey: {
          in: [
            BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
            BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT,
          ],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        productKey: true,
        status: true,
        hirePilotUnlimited: true,
        hirePilotCredits: true,
        currentPeriodEnd: true,
        stripeSubscriptionId: true,
        stripeCheckoutSessionId: true,
      },
    });

    const summary = summarizeHirePilotBillingRows(rows);

    if (summary.hirePilotUnlimited) {
      return {
        allowed: true,
        unlimited: true,
        credits: summary.hirePilotCredits,
      };
    }

    if (summary.hirePilotCredits <= 0 || !summary.creditRowId) {
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
        credits: summary.hirePilotCredits,
      };
    }

    const updated = await tx.userBilling.updateMany({
      where: {
        id: summary.creditRowId,
        hirePilotCredits: { gt: 0 },
      },
      data: {
        hirePilotCredits: { decrement: 1 },
      },
    });

    if (!updated.count) {
      return {
        allowed: false,
        unlimited: false,
        credits: 0,
      };
    }

    const refreshedRows = await tx.userBilling.findMany({
      where: {
        userId,
        productKey: {
          in: [
            BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
            BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT,
          ],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        productKey: true,
        status: true,
        hirePilotUnlimited: true,
        hirePilotCredits: true,
        currentPeriodEnd: true,
        stripeSubscriptionId: true,
        stripeCheckoutSessionId: true,
      },
    });
    const refreshedSummary = summarizeHirePilotBillingRows(refreshedRows);

    return {
      allowed: true,
      unlimited: refreshedSummary.hirePilotUnlimited,
      credits: refreshedSummary.hirePilotCredits,
    };
  });
}
