import "server-only";

import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";

export const BILLING_PRODUCT_KEYS = {
  HIREXA_CORE: "hirexa_core",
  HIREPILOT_MONTHLY: "hirepilot_monthly",
  HIREPILOT_CREDIT: "hirepilot_credit",
} as const;

export type BillingProductKey =
  (typeof BILLING_PRODUCT_KEYS)[keyof typeof BILLING_PRODUCT_KEYS];

export type BillingPlanType =
  | "trial"
  | "monthly"
  | "yearly"
  | "credits"
  | "one_time";

const ACTIVE_BILLING_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "payment approved",
  "payed",
]);

type StripeMetadata = Record<string, string | null | undefined>;

type UpsertUserBillingRecordArgs = {
  userId: string;
  productKey: BillingProductKey;
  planType?: string | null;
  status?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  stripeCheckoutSessionId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  lastPaymentReceivedAt?: Date | null;
  subscriptionPurchasedAt?: Date | null;
  hirePilotCredits?: number;
  hirePilotUnlimited?: boolean;
};

type StripePriceDetails = {
  priceId: string | null;
  productId: string | null;
  recurringInterval: Stripe.Price.Recurring.Interval | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
};

function normalizeText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

export function isActiveBillingStatus(value: string | null | undefined) {
  if (!value) return false;
  return ACTIVE_BILLING_STATUSES.has(value.trim().toLowerCase());
}

export function getUserBillingWhere(
  userId: string,
  productKey: BillingProductKey
): Prisma.UserBillingWhereUniqueInput {
  return {
    userId_productKey: {
      userId,
      productKey,
    },
  };
}

export function getBillingProductFromPriceId(priceId: string | null | undefined) {
  const normalizedPriceId = normalizeText(priceId);
  if (!normalizedPriceId) return null;

  if (normalizedPriceId === process.env.STRIPE_TRIAL_PRICE_ID?.trim()) {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: "trial" as const,
    };
  }

  if (normalizedPriceId === process.env.STRIPE_FULL_PRICE_ID?.trim()) {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: "monthly" as const,
    };
  }

  if (normalizedPriceId === process.env.STRIPE_ANNUAL_PRICE_ID?.trim()) {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: "yearly" as const,
    };
  }

  if (normalizedPriceId === process.env.STRIPE_HIREPILOT_MONTHLY_PRICE_ID?.trim()) {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
      planType: "monthly" as const,
    };
  }

  if (normalizedPriceId === process.env.STRIPE_HIREPILOT_CREDIT_PRICE_ID?.trim()) {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT,
      planType: "credits" as const,
    };
  }

  return null;
}

export function getBillingProductFromStripe(params: {
  metadata?: StripeMetadata | null;
  priceId?: string | null;
  recurringInterval?: Stripe.Price.Recurring.Interval | null;
}) {
  const fromPrice = getBillingProductFromPriceId(params.priceId);
  if (fromPrice) return fromPrice;

  const metadata = params.metadata ?? {};
  const hirePilotPurchaseType = normalizeText(metadata.hirepilot_purchase_type)?.toLowerCase();
  if (hirePilotPurchaseType === "subscription") {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
      planType: "monthly" as const,
    };
  }

  if (hirePilotPurchaseType === "credit") {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT,
      planType: "credits" as const,
    };
  }

  const hirexaPlan = normalizeText(metadata.hirexa_plan)?.toLowerCase();
  if (hirexaPlan === "trial") {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: "trial" as const,
    };
  }

  if (hirexaPlan === "annual" || hirexaPlan === "yearly") {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: "yearly" as const,
    };
  }

  if (params.recurringInterval === "year") {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: "yearly" as const,
    };
  }

  if (params.recurringInterval === "month") {
    return {
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: "monthly" as const,
    };
  }

  return null;
}

export function stripeTimestampToDate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(value * 1000);
}

export async function upsertUserBillingRecord(args: UpsertUserBillingRecordArgs) {
  const { userId, productKey, ...data } = args;

  return prisma.userBilling.upsert({
    where: getUserBillingWhere(userId, productKey),
    create: {
      userId,
      productKey,
      cancelAtPeriodEnd: false,
      hirePilotCredits: 0,
      hirePilotUnlimited: false,
      ...data,
    },
    update: data,
  });
}

export async function readUserBillingRecords(
  userId: string,
  productKeys?: BillingProductKey[]
) {
  return prisma.userBilling.findMany({
    where: {
      userId,
      ...(productKeys?.length
        ? {
            productKey: {
              in: productKeys,
            },
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

export function getStripePriceDetailsFromSubscription(
  subscription: Stripe.Subscription | null | undefined
): StripePriceDetails {
  const subscriptionWithPeriods = subscription as
    | (Stripe.Subscription & {
        current_period_start?: number | null;
        current_period_end?: number | null;
        cancel_at_period_end?: boolean;
        canceled_at?: number | null;
        trial_start?: number | null;
        trial_end?: number | null;
      })
    | null
    | undefined;
  const item = subscription?.items.data[0];
  const price = item?.price;

  return {
    priceId: normalizeText(price?.id) ?? null,
    productId:
      typeof price?.product === "string"
        ? price.product
        : normalizeText(price?.product?.id) ?? null,
    recurringInterval: price?.recurring?.interval ?? null,
    currentPeriodStart: stripeTimestampToDate(
      subscriptionWithPeriods?.current_period_start ?? null
    ),
    currentPeriodEnd: stripeTimestampToDate(
      subscriptionWithPeriods?.current_period_end ?? null
    ),
    cancelAtPeriodEnd: subscriptionWithPeriods?.cancel_at_period_end ?? false,
    canceledAt: stripeTimestampToDate(subscriptionWithPeriods?.canceled_at ?? null),
    trialStart: stripeTimestampToDate(subscriptionWithPeriods?.trial_start ?? null),
    trialEnd: stripeTimestampToDate(subscriptionWithPeriods?.trial_end ?? null),
  };
}

export async function getLatestStripeCustomerIdForUser(userId: string) {
  const billing = await prisma.userBilling.findFirst({
    where: {
      userId,
      stripeCustomerId: {
        not: null,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      stripeCustomerId: true,
    },
  });

  return billing?.stripeCustomerId ?? null;
}
