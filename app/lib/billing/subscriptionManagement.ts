import "server-only";

import { prisma } from "@/app/lib/prisma";
import { getSiteUrl } from "@/app/lib/site-url";
import { getStripeClient } from "@/app/lib/stripeClient";
import {
  BILLING_PRODUCT_KEYS,
  getLatestStripeCustomerIdForUser,
  isActiveBillingStatus,
  readUserBillingRecords,
  stripeTimestampToDate,
} from "@/app/lib/billing/userBilling";

export type ManagedSubscriptionProductKey =
  | typeof BILLING_PRODUCT_KEYS.HIREXA_CORE
  | typeof BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY;

export type ManagedSubscriptionTarget = {
  productKey: ManagedSubscriptionProductKey;
  label: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

function normalizeText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function getBillingProductLabel(productKey: ManagedSubscriptionProductKey) {
  return productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY ? "HirePilot" : "Hirexa AI";
}

export async function getManagedSubscriptionTargets(userId: string) {
  const [billingRows, legacyProfile] = await Promise.all([
    readUserBillingRecords(userId, [
      BILLING_PRODUCT_KEYS.HIREXA_CORE,
      BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
    ]),
    prisma.userProfile.findUnique({
      where: { userId },
      select: {
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialPlanStatus: true,
        monthlyPlanStatus: true,
        yearlyPlanStatus: true,
      },
    }),
  ]);

  const targets: ManagedSubscriptionTarget[] = [];

  const monthlyHirePilot = billingRows.find(
    (row) =>
      row.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY &&
      row.stripeSubscriptionId &&
      isActiveBillingStatus(row.status)
  );

  if (monthlyHirePilot?.stripeSubscriptionId) {
    targets.push({
      productKey: BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
      label: getBillingProductLabel(BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY),
      stripeSubscriptionId: monthlyHirePilot.stripeSubscriptionId,
      stripeCustomerId: normalizeText(monthlyHirePilot.stripeCustomerId),
      currentPeriodEnd: monthlyHirePilot.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: Boolean(monthlyHirePilot.cancelAtPeriodEnd),
    });
  }

  const hirexaBilling = billingRows.find(
    (row) =>
      row.productKey === BILLING_PRODUCT_KEYS.HIREXA_CORE &&
      row.stripeSubscriptionId &&
      isActiveBillingStatus(row.status)
  );

  if (hirexaBilling?.stripeSubscriptionId) {
    targets.push({
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      label: getBillingProductLabel(BILLING_PRODUCT_KEYS.HIREXA_CORE),
      stripeSubscriptionId: hirexaBilling.stripeSubscriptionId,
      stripeCustomerId: normalizeText(hirexaBilling.stripeCustomerId),
      currentPeriodEnd: hirexaBilling.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: Boolean(hirexaBilling.cancelAtPeriodEnd),
    });
  } else if (
    legacyProfile?.stripeSubscriptionId &&
    [legacyProfile.trialPlanStatus, legacyProfile.monthlyPlanStatus, legacyProfile.yearlyPlanStatus].some(
      (status) => isActiveBillingStatus(status)
    )
  ) {
    targets.push({
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      label: getBillingProductLabel(BILLING_PRODUCT_KEYS.HIREXA_CORE),
      stripeSubscriptionId: legacyProfile.stripeSubscriptionId,
      stripeCustomerId: normalizeText(legacyProfile.stripeCustomerId),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }

  return targets;
}

export async function getStripeCustomerIdForUser(userId: string) {
  const [billingCustomerId, legacyProfile] = await Promise.all([
    getLatestStripeCustomerIdForUser(userId),
    prisma.userProfile.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    }),
  ]);

  return billingCustomerId ?? normalizeText(legacyProfile?.stripeCustomerId) ?? null;
}

export async function createBillingPortalUrl(args: {
  userId: string;
  req: Request;
  returnPath?: string;
}) {
  const stripeCustomerId = await getStripeCustomerIdForUser(args.userId);
  if (!stripeCustomerId) {
    return null;
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${getSiteUrl(args.req)}${args.returnPath ?? "/settings/subscription"}`,
  });

  return session.url;
}

export async function cancelSubscriptionAtPeriodEnd(args: {
  userId: string;
  productKey: ManagedSubscriptionProductKey;
}) {
  const target = (await getManagedSubscriptionTargets(args.userId)).find(
    (item) => item.productKey === args.productKey
  );

  if (!target) {
    return null;
  }

  const stripe = getStripeClient();
  const updated = await stripe.subscriptions.update(target.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  const currentPeriodEnd = stripeTimestampToDate(
    (updated as { current_period_end?: number | null }).current_period_end ?? null
  );
  const canceledAt = stripeTimestampToDate(updated.canceled_at ?? null);

  await prisma.userBilling.updateMany({
    where: {
      userId: args.userId,
      stripeSubscriptionId: target.stripeSubscriptionId,
    },
    data: {
      status: updated.status,
      cancelAtPeriodEnd: true,
      currentPeriodEnd,
      canceledAt,
    },
  });

  return {
    ...target,
    currentPeriodEnd,
    cancelAtPeriodEnd: true,
  } satisfies ManagedSubscriptionTarget;
}

export async function cancelAllSubscriptionsImmediately(userId: string) {
  const targets = await getManagedSubscriptionTargets(userId);
  if (targets.length === 0) {
    return [];
  }

  const stripe = getStripeClient();
  const canceledProducts: string[] = [];

  for (const target of targets) {
    const canceled = await stripe.subscriptions.cancel(target.stripeSubscriptionId);
    const canceledAt = stripeTimestampToDate(canceled.canceled_at ?? null) ?? new Date();
    const billingUpdateData =
      target.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY
        ? {
            status: canceled.status ?? "canceled",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: canceledAt,
            canceledAt,
            hirePilotUnlimited: false,
          }
        : {
            status: canceled.status ?? "canceled",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: canceledAt,
            canceledAt,
          };

    await prisma.userBilling.updateMany({
      where: {
        userId,
        stripeSubscriptionId: target.stripeSubscriptionId,
      },
      data: billingUpdateData,
    });

    if (target.productKey === BILLING_PRODUCT_KEYS.HIREXA_CORE) {
      await prisma.userProfile.updateMany({
        where: {
          userId,
          stripeSubscriptionId: target.stripeSubscriptionId,
        },
        data: {
          trialSubscriber: false,
          monthlySubscriber: false,
          yearlySubscriber: false,
          trialPlanStatus: "canceled",
          monthlyPlanStatus: "canceled",
          yearlyPlanStatus: "canceled",
          subscriptionCheckedAt: new Date(),
        },
      });
    }

    canceledProducts.push(target.label);
  }

  return canceledProducts;
}

export async function getCancelableProductKeys(userId: string) {
  const targets = await getManagedSubscriptionTargets(userId);
  return uniqueStrings(targets.map((target) => target.productKey));
}
