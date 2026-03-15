import "server-only";

import { prisma } from "@/app/lib/prisma";
import {
  BILLING_PRODUCT_KEYS,
  getUserBillingWhere,
  isActiveBillingStatus,
  upsertUserBillingRecord,
} from "@/app/lib/billing/userBilling";

export const HIREPILOT_PURCHASE_TYPES = {
  SUBSCRIPTION: "subscription",
  CREDIT: "credit",
} as const;

export const HIREPILOT_PLAN_TYPES = {
  MONTHLY: "monthly",
  CREDITS: "credits",
} as const;

export type HirePilotBillingRow = {
  id: string;
  productKey: string;
  status: string | null;
  hirePilotUnlimited: boolean;
  hirePilotCredits: number;
  currentPeriodEnd: Date | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type HirePilotBillingStatus = {
  hasHirePilotAccess: boolean;
  hirePilotUnlimited: boolean;
  hirePilotCredits: number;
  productKey: string | null;
  status: string | null;
  currentPeriodEnd: Date | null;
  monthly: {
    productKey: string;
    status: string | null;
    currentPeriodEnd: Date | null;
    stripeSubscriptionId: string | null;
    stripeCheckoutSessionId: string | null;
  } | null;
  credits: {
    productKey: string;
    status: string | null;
    hirePilotCredits: number;
    stripeCheckoutSessionId: string | null;
  } | null;
};

function getRelevantHirePilotRows(rows: HirePilotBillingRow[]) {
  return rows.filter(
    (row) =>
      row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY ||
      row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT
  );
}

export function summarizeHirePilotBillingRows(rows: HirePilotBillingRow[]) {
  const relevantRows = getRelevantHirePilotRows(rows);
  const monthlyRow =
    relevantRows.find((row) => row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY) ??
    null;
  const creditRow =
    relevantRows.find((row) => row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT) ??
    null;
  const hirePilotUnlimited = Boolean(
    monthlyRow && (monthlyRow.hirePilotUnlimited || isActiveBillingStatus(monthlyRow.status))
  );
  const hirePilotCredits = relevantRows.reduce(
    (total, row) => total + Math.max(0, row.hirePilotCredits ?? 0),
    0
  );
  const hasHirePilotAccess = hirePilotUnlimited || hirePilotCredits > 0;
  const productKey = hirePilotUnlimited
    ? BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY
    : hirePilotCredits > 0
      ? BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT
      : monthlyRow?.productKey ?? creditRow?.productKey ?? null;
  const status = hirePilotUnlimited
    ? monthlyRow?.status ?? "active"
    : hirePilotCredits > 0
      ? creditRow?.status ?? "active"
      : monthlyRow?.status ?? creditRow?.status ?? null;
  const currentPeriodEnd = monthlyRow?.currentPeriodEnd ?? null;

  return {
    hasHirePilotAccess,
    hirePilotUnlimited,
    hirePilotCredits,
    productKey,
    status,
    currentPeriodEnd,
    monthlyRow,
    creditRow,
    creditRowId:
      creditRow && creditRow.hirePilotCredits > 0 ? creditRow.id : creditRow?.id ?? null,
  };
}

export async function getHirePilotBillingStatus(
  userId: string
): Promise<HirePilotBillingStatus> {
  const rows = await prisma.userBilling.findMany({
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
      createdAt: true,
      updatedAt: true,
    },
  });

  const summary = summarizeHirePilotBillingRows(rows);

  return {
    hasHirePilotAccess: summary.hasHirePilotAccess,
    hirePilotUnlimited: summary.hirePilotUnlimited,
    hirePilotCredits: summary.hirePilotCredits,
    productKey: summary.productKey,
    status: summary.status,
    currentPeriodEnd: summary.currentPeriodEnd,
    monthly: summary.monthlyRow
      ? {
          productKey: summary.monthlyRow.productKey,
          status: summary.monthlyRow.status,
          currentPeriodEnd: summary.monthlyRow.currentPeriodEnd,
          stripeSubscriptionId: summary.monthlyRow.stripeSubscriptionId ?? null,
          stripeCheckoutSessionId: summary.monthlyRow.stripeCheckoutSessionId ?? null,
        }
      : null,
    credits: summary.creditRow
      ? {
          productKey: summary.creditRow.productKey,
          status: summary.creditRow.status,
          hirePilotCredits: summary.creditRow.hirePilotCredits ?? 0,
          stripeCheckoutSessionId: summary.creditRow.stripeCheckoutSessionId ?? null,
        }
      : null,
  };
}

export async function resolveHirePilotUserId(params: {
  userIdFromMetadata?: string | null;
  clientReferenceId?: string | null;
  customerEmail?: string | null;
}) {
  if (params.userIdFromMetadata) {
    return params.userIdFromMetadata;
  }

  if (params.clientReferenceId) {
    return params.clientReferenceId;
  }

  if (!params.customerEmail) {
    return null;
  }

  const normalizedEmail = params.customerEmail.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function upsertHirePilotMonthlyBilling(params: {
  userId: string;
  status: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  paidAt?: Date | null;
}) {
  const hasAccess = isActiveBillingStatus(params.status);

  await upsertUserBillingRecord({
    userId: params.userId,
    productKey: BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
    planType: HIREPILOT_PLAN_TYPES.MONTHLY,
    status: params.status,
    stripeCustomerId: params.stripeCustomerId ?? null,
    stripeSubscriptionId: params.stripeSubscriptionId ?? null,
    stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
    stripePriceId: params.stripePriceId ?? null,
    stripeProductId: params.stripeProductId ?? null,
    currentPeriodStart: params.currentPeriodStart ?? null,
    currentPeriodEnd: params.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? false,
    canceledAt: params.canceledAt ?? null,
    trialStart: params.trialStart ?? null,
    trialEnd: params.trialEnd ?? null,
    hirePilotUnlimited: hasAccess,
    subscriptionPurchasedAt: params.paidAt ?? undefined,
    ...(hasAccess ? { lastPaymentReceivedAt: params.paidAt ?? new Date() } : {}),
  });
}

export async function incrementHirePilotCredits(params: {
  userId: string;
  credits: number;
  stripeCustomerId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  paidAt?: Date | null;
}) {
  const paidAt = params.paidAt ?? new Date();

  await prisma.userBilling.upsert({
    where: getUserBillingWhere(params.userId, BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT),
    create: {
      userId: params.userId,
      productKey: BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT,
      planType: HIREPILOT_PLAN_TYPES.CREDITS,
      status: "active",
      stripeCustomerId: params.stripeCustomerId ?? null,
      stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
      stripePriceId: params.stripePriceId ?? null,
      stripeProductId: params.stripeProductId ?? null,
      hirePilotCredits: params.credits,
      lastPaymentReceivedAt: paidAt,
      subscriptionPurchasedAt: paidAt,
    },
    update: {
      status: "active",
      stripeCustomerId: params.stripeCustomerId ?? null,
      stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
      stripePriceId: params.stripePriceId ?? null,
      stripeProductId: params.stripeProductId ?? null,
      hirePilotCredits: {
        increment: params.credits,
      },
      lastPaymentReceivedAt: paidAt,
    },
  });
}

export async function hasProcessedStripePayment(params: {
  stripeEventId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
}) {
  const conditions: Array<{
    stripeEventId?: string;
    stripeCheckoutSessionId?: string;
    stripePaymentIntentId?: string;
  }> = [
    params.stripeEventId ? { stripeEventId: params.stripeEventId } : null,
    params.stripeCheckoutSessionId
      ? { stripeCheckoutSessionId: params.stripeCheckoutSessionId }
      : null,
    params.stripePaymentIntentId
      ? { stripePaymentIntentId: params.stripePaymentIntentId }
      : null,
  ].filter(Boolean) as Array<{
    stripeEventId?: string;
    stripeCheckoutSessionId?: string;
    stripePaymentIntentId?: string;
  }>;

  if (conditions.length === 0) {
    return false;
  }

  const existing = await prisma.stripePayment.findFirst({
    where: {
      OR: conditions,
    },
    select: { id: true },
  });

  return Boolean(existing);
}
