import "server-only";

import { prisma } from "@/app/lib/prisma";
import {
  BILLING_PRODUCT_KEYS,
  isActiveBillingStatus,
  readUserBillingRecords,
} from "@/app/lib/billing/userBilling";

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
}>;

function summarizeHirePilotRows(rows: BillingRows) {
  const relevantRows = rows.filter(
    (row) =>
      row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY ||
      row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT
  );

  const unlimited = relevantRows.some(
    (row) =>
      row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY &&
      (row.hirePilotUnlimited || isActiveBillingStatus(row.status))
  );
  const credits = relevantRows.reduce(
    (total, row) => total + Math.max(0, row.hirePilotCredits ?? 0),
    0
  );
  const creditRow =
    relevantRows.find(
      (row) =>
        row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT &&
        row.hirePilotCredits > 0
    ) ??
    relevantRows.find((row) => row.hirePilotCredits > 0) ??
    null;

  return {
    unlimited,
    credits,
    creditRowId: creditRow?.id ?? null,
  };
}

export async function getHirePilotBillingStatus(
  userId: string
): Promise<{ hirePilotUnlimited: boolean; hirePilotCredits: number }> {
  const rows = await readUserBillingRecords(userId, [
    BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
    BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT,
  ]);
  const summary = summarizeHirePilotRows(rows);

  return {
    hirePilotUnlimited: summary.unlimited,
    hirePilotCredits: summary.credits,
  };
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
      },
    });

    const summary = summarizeHirePilotRows(rows);

    if (summary.unlimited) {
      return {
        allowed: true,
        unlimited: true,
        credits: summary.credits,
      };
    }

    if (summary.credits <= 0 || !summary.creditRowId) {
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
        credits: summary.credits,
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
      },
    });
    const refreshedSummary = summarizeHirePilotRows(refreshedRows);

    return {
      allowed: true,
      unlimited: refreshedSummary.unlimited,
      credits: refreshedSummary.credits,
    };
  });
}
