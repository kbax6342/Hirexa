import "server-only";

import {
  getHirePilotBillingStatus as getCanonicalHirePilotBillingStatus,
} from "@/app/lib/billing/hirepilotBilling";
import { consumeHirePilotCredits } from "@/app/lib/hirepilot/credits";

export const HIREPILOT_SESSION_COOKIE = "hirepilot_session_id";

export type HirePilotAccessResult = {
  allowed: boolean;
  unlimited: boolean;
  credits: number;
  monthlyCredits?: number;
  purchasedCredits?: number;
};

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
  const status = await getCanonicalHirePilotBillingStatus(userId);

  if (status.hirePilotUnlimited) {
    return {
      allowed: true,
      unlimited: true,
      credits: status.hirePilotCredits,
      monthlyCredits: status.monthlyCredits + status.rolloverCredits,
      purchasedCredits: status.purchasedCredits,
    };
  }

  if (status.hirePilotCredits > 0) {
    if (!consumeCredit) {
      return {
        allowed: true,
        unlimited: status.hirePilotUnlimited,
        credits: status.hirePilotCredits,
        monthlyCredits: status.monthlyCredits + status.rolloverCredits,
        purchasedCredits: status.purchasedCredits,
      };
    }

    const consumption = await consumeHirePilotCredits({
      userId,
      amount: 1,
      sourceType: "interview_session",
    });

    return {
      allowed: consumption.ok,
      unlimited: status.hirePilotUnlimited,
      credits: consumption.summary.totalAvailable,
      monthlyCredits:
        consumption.summary.monthlyCredits + consumption.summary.rolloverCredits,
      purchasedCredits: consumption.summary.purchasedCredits,
    };
  }

  return {
    allowed: false,
    unlimited: false,
    credits: 0,
    monthlyCredits: 0,
    purchasedCredits: 0,
  };
}
