import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/app/lib/prisma";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { getStripeClient } from "@/app/lib/stripeClient";
import { hasActivePlan } from "@/app/lib/billing/hasActivePlan";
import {
  BILLING_PRODUCT_KEYS,
  getBillingProductFromStripe,
  getStripePriceDetailsFromSubscription,
  isActiveBillingStatus,
  readUserBillingRecords,
  upsertUserBillingRecord,
} from "@/app/lib/billing/userBilling";

const BILLING_SYNC_TTL_MS = 60_000;
const BILLING_PENDING_WINDOW_MS = 15 * 60 * 1000;
const STRIPE_ACCESSIBLE_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);

const accessProfileSelect = {
  userId: true,
  email: true,
  subscriptionEmail: true,
  trialSubscriber: true,
  monthlySubscriber: true,
  yearlySubscriber: true,
  trialPlanStatus: true,
  monthlyPlanStatus: true,
  yearlyPlanStatus: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  subscriptionCheckedAt: true,
  subscriptionPurchasedAt: true,
  lastPaymentReceivedAt: true,
} as const;

export type HirexaPlanType = "trial" | "monthly" | "yearly";

type LegacyAccessProfile = Awaited<ReturnType<typeof readLegacyAccessProfile>>;
type BillingRecord = Awaited<ReturnType<typeof readUserBillingRecords>>[number] | null;

export type HirexaAccessProfile = {
  userId: string | null;
  email: string | null;
  subscriptionEmail: string | null;
  trialSubscriber: boolean;
  monthlySubscriber: boolean;
  yearlySubscriber: boolean;
  trialPlanStatus: string | null;
  monthlyPlanStatus: string | null;
  yearlyPlanStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionCheckedAt: Date | null;
  subscriptionPurchasedAt: Date | null;
  lastPaymentReceivedAt: Date | null;
};

export type HirexaAccessResult = {
  active: boolean;
  pending: boolean;
  planType: HirexaPlanType | null;
  planStatus: string | null;
  profile: HirexaAccessProfile | null;
};

type GetHirexaAccessArgs = {
  userId: string;
  sessionEmail?: string | null;
  forceSync?: boolean;
};

function logSubscriptionAccess(
  level: "info" | "warn",
  message: string,
  metadata?: Record<string, unknown>
) {
  const logger = level === "warn" ? console.warn : console.info;

  if (metadata && Object.keys(metadata).length > 0) {
    logger(`[SUB_ACCESS] ${message}`, metadata);
    return;
  }

  logger(`[SUB_ACCESS] ${message}`);
}

function normalizeText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function isRecent(date: Date | null | undefined, windowMs: number) {
  if (!date) return false;
  return Date.now() - date.getTime() <= windowMs;
}

function normalizePlanType(value: string | null | undefined): HirexaPlanType | null {
  if (value === "trial" || value === "monthly" || value === "yearly") {
    return value;
  }

  return null;
}

async function readLegacyAccessProfile(userId: string) {
  return prisma.userProfile.findUnique({
    where: { userId },
    select: accessProfileSelect,
  });
}

async function readHirexaBillingRecord(userId: string): Promise<BillingRecord> {
  const [billing] = await readUserBillingRecords(userId, [BILLING_PRODUCT_KEYS.HIREXA_CORE]);
  return billing ?? null;
}

async function upsertUserProfileBilling(userId: string, data: Record<string, unknown>) {
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  invalidateCachedProfile({ userId, guestId: null });
}

function getPlanTypeFromLegacyProfile(
  profile: LegacyAccessProfile
): HirexaPlanType | null {
  if (!profile) return null;

  if (profile.trialSubscriber || profile.trialPlanStatus) {
    return "trial";
  }

  if (profile.monthlySubscriber || profile.monthlyPlanStatus) {
    return "monthly";
  }

  if (profile.yearlySubscriber || profile.yearlyPlanStatus) {
    return "yearly";
  }

  return null;
}

function getPlanStatusFromLegacyProfile(profile: LegacyAccessProfile) {
  if (!profile) return null;

  const planType = getPlanTypeFromLegacyProfile(profile);
  if (planType === "trial") return profile.trialPlanStatus ?? null;
  if (planType === "monthly") return profile.monthlyPlanStatus ?? null;
  if (planType === "yearly") return profile.yearlyPlanStatus ?? null;

  return (
    profile.trialPlanStatus ??
    profile.monthlyPlanStatus ??
    profile.yearlyPlanStatus ??
    null
  );
}

function buildAccessSnapshot(
  profile: LegacyAccessProfile,
  billing: BillingRecord
): HirexaAccessProfile | null {
  if (!profile && !billing) {
    return null;
  }

  const planType = normalizePlanType(billing?.planType) ?? getPlanTypeFromLegacyProfile(profile);
  const planStatus = normalizeText(billing?.status) ?? getPlanStatusFromLegacyProfile(profile);
  const active = billing
    ? isActiveBillingStatus(planStatus)
    : hasActivePlan(profile);

  return {
    userId: profile?.userId ?? null,
    email: normalizeText(profile?.email) ?? null,
    subscriptionEmail:
      normalizeText(profile?.subscriptionEmail) ??
      normalizeText(profile?.email) ??
      null,
    trialSubscriber: planType === "trial" ? active : Boolean(profile?.trialSubscriber && !billing),
    monthlySubscriber:
      planType === "monthly" ? active : Boolean(profile?.monthlySubscriber && !billing),
    yearlySubscriber: planType === "yearly" ? active : Boolean(profile?.yearlySubscriber && !billing),
    trialPlanStatus: planType === "trial" ? planStatus : billing ? null : profile?.trialPlanStatus ?? null,
    monthlyPlanStatus:
      planType === "monthly" ? planStatus : billing ? null : profile?.monthlyPlanStatus ?? null,
    yearlyPlanStatus:
      planType === "yearly" ? planStatus : billing ? null : profile?.yearlyPlanStatus ?? null,
    stripeCustomerId:
      normalizeText(billing?.stripeCustomerId) ??
      normalizeText(profile?.stripeCustomerId) ??
      null,
    stripeSubscriptionId:
      normalizeText(billing?.stripeSubscriptionId) ??
      normalizeText(profile?.stripeSubscriptionId) ??
      null,
    subscriptionCheckedAt: profile?.subscriptionCheckedAt ?? billing?.updatedAt ?? null,
    subscriptionPurchasedAt:
      billing?.subscriptionPurchasedAt ??
      profile?.subscriptionPurchasedAt ??
      null,
    lastPaymentReceivedAt:
      billing?.lastPaymentReceivedAt ??
      profile?.lastPaymentReceivedAt ??
      null,
  };
}

function isPendingAccess(snapshot: HirexaAccessProfile | null, active: boolean) {
  if (!snapshot || active) return false;

  const statuses = [
    snapshot.trialPlanStatus,
    snapshot.monthlyPlanStatus,
    snapshot.yearlyPlanStatus,
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean);

  const hasTransitionalStatus = statuses.some((status) =>
    ["payment approved", "processing", "incomplete"].includes(status!)
  );
  const hasKnownInactiveStatus = statuses.some((status) =>
    ["canceled", "cancelled", "incomplete_expired", "expired", "paused"].includes(
      status!
    )
  );

  return (
    hasTransitionalStatus ||
    (!hasKnownInactiveStatus &&
      (isRecent(snapshot.subscriptionPurchasedAt, BILLING_PENDING_WINDOW_MS) ||
        isRecent(snapshot.lastPaymentReceivedAt, BILLING_PENDING_WINDOW_MS)))
  );
}

function shouldSyncProfile(
  snapshot: HirexaAccessProfile | null,
  forceSync: boolean | undefined,
  billing: BillingRecord
) {
  if (forceSync) return true;
  if (billing && isActiveBillingStatus(billing.status)) return false;
  if (!snapshot) return true;
  if (!snapshot.subscriptionCheckedAt) return true;

  return Date.now() - snapshot.subscriptionCheckedAt.getTime() > BILLING_SYNC_TTL_MS;
}

function getPlanTypeFromSubscription(
  subscription: Stripe.Subscription
): HirexaPlanType {
  const priceDetails = getStripePriceDetailsFromSubscription(subscription);
  const product = getBillingProductFromStripe({
    metadata: subscription.metadata,
    priceId: priceDetails.priceId,
    recurringInterval: priceDetails.recurringInterval,
  });

  return normalizePlanType(product?.planType) ?? "monthly";
}

function selectBestSubscription(subscriptions: Stripe.Subscription[]) {
  const ranked = [...subscriptions].sort((left, right) => right.created - left.created);

  return (
    ranked.find((subscription) =>
      STRIPE_ACCESSIBLE_STATUSES.has(subscription.status ?? "")
    ) ?? ranked[0] ?? null
  );
}

async function findStripeCustomer(params: {
  stripeCustomerId?: string | null;
  email?: string | null;
}) {
  const stripe = getStripeClient();

  if (params.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(params.stripeCustomerId);
      if (!("deleted" in customer) || !customer.deleted) {
        return customer;
      }
    } catch (error) {
      logSubscriptionAccess("warn", "customer lookup by id failed", {
        stripeCustomerId: params.stripeCustomerId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!params.email) {
    return null;
  }

  const customers = await stripe.customers.list({
    email: params.email,
    limit: 10,
  });

  return (
    customers.data.find((customer) => normalizeText(customer.email) === params.email) ??
    customers.data[0] ??
    null
  );
}

async function backfillHirexaBillingFromLegacyProfile(
  userId: string,
  profile: LegacyAccessProfile
) {
  if (!profile) return null;

  const planType = getPlanTypeFromLegacyProfile(profile);
  const planStatus = getPlanStatusFromLegacyProfile(profile);
  const hasAnyLegacyBillingData =
    Boolean(planType) ||
    Boolean(planStatus) ||
    Boolean(profile.stripeCustomerId) ||
    Boolean(profile.stripeSubscriptionId) ||
    Boolean(profile.subscriptionPurchasedAt) ||
    Boolean(profile.lastPaymentReceivedAt);

  if (!hasAnyLegacyBillingData) {
    return null;
  }

  return upsertUserBillingRecord({
    userId,
    productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
    planType,
    status: planStatus,
    stripeCustomerId: profile.stripeCustomerId ?? null,
    stripeSubscriptionId: profile.stripeSubscriptionId ?? null,
    lastPaymentReceivedAt: profile.lastPaymentReceivedAt ?? null,
    subscriptionPurchasedAt: profile.subscriptionPurchasedAt ?? null,
  });
}

async function readHirexaAccessState(userId: string) {
  const [profile, billing] = await Promise.all([
    readLegacyAccessProfile(userId),
    readHirexaBillingRecord(userId),
  ]);

  if (billing) {
    return {
      profile,
      billing,
      snapshot: buildAccessSnapshot(profile, billing),
    };
  }

  const backfilled = await backfillHirexaBillingFromLegacyProfile(userId, profile);

  return {
    profile,
    billing: backfilled,
    snapshot: buildAccessSnapshot(profile, backfilled),
  };
}

async function syncHirexaBillingFromStripe(args: GetHirexaAccessArgs) {
  const existing = await readHirexaAccessState(args.userId);
  const checkedAt = new Date();
  const emailToLookup =
    normalizeText(existing.snapshot?.subscriptionEmail) ??
    normalizeText(args.sessionEmail);

  logSubscriptionAccess("info", "starting Stripe access sync", {
    userId: args.userId,
    forceSync: Boolean(args.forceSync),
    sessionEmail: normalizeText(args.sessionEmail),
    emailToLookup,
    stripeCustomerId: existing.snapshot?.stripeCustomerId ?? null,
    stripeSubscriptionId: existing.snapshot?.stripeSubscriptionId ?? null,
    currentPlanStatus:
      normalizeText(existing.billing?.status) ??
      existing.snapshot?.trialPlanStatus ??
      existing.snapshot?.monthlyPlanStatus ??
      existing.snapshot?.yearlyPlanStatus ??
      null,
  });

  if (!emailToLookup && !existing.snapshot?.stripeCustomerId) {
    await upsertUserProfileBilling(args.userId, { subscriptionCheckedAt: checkedAt });
    logSubscriptionAccess("info", "skipped Stripe sync because no lookup key was available", {
      userId: args.userId,
    });
    return readHirexaAccessState(args.userId);
  }

  const customer = await findStripeCustomer({
    stripeCustomerId: existing.snapshot?.stripeCustomerId ?? null,
    email: emailToLookup,
  });

  if (!customer) {
    await upsertUserProfileBilling(args.userId, {
      subscriptionCheckedAt: checkedAt,
      ...(emailToLookup ? { subscriptionEmail: emailToLookup } : {}),
    });
    logSubscriptionAccess("info", "no Stripe customer found for access sync", {
      userId: args.userId,
      emailToLookup,
    });
    return readHirexaAccessState(args.userId);
  }

  const stripe = getStripeClient();
  const subscriptions = await stripe.subscriptions.list({
    customer: customer.id,
    status: "all",
    limit: 10,
  });

  const subscription = selectBestSubscription(subscriptions.data);

  if (!subscription) {
    const nextPlanType =
      normalizePlanType(existing.billing?.planType) ??
      getPlanTypeFromLegacyProfile(existing.profile);

    if (existing.billing || existing.snapshot?.stripeCustomerId || existing.snapshot?.stripeSubscriptionId) {
      await upsertUserBillingRecord({
        userId: args.userId,
        productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
        planType: nextPlanType,
        status: null,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: null,
        stripePriceId: null,
        stripeProductId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        trialStart: null,
        trialEnd: null,
      });
    }

    await upsertUserProfileBilling(args.userId, {
      trialSubscriber: false,
      monthlySubscriber: false,
      yearlySubscriber: false,
      trialPlanStatus: null,
      monthlyPlanStatus: null,
      yearlyPlanStatus: null,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: null,
      subscriptionCheckedAt: checkedAt,
      subscriptionEmail:
        emailToLookup ?? normalizeText(customer.email) ?? existing.profile?.subscriptionEmail,
    });

    logSubscriptionAccess("info", "no Stripe subscription found for customer", {
      userId: args.userId,
      stripeCustomerId: customer.id,
      emailToLookup,
    });

    return readHirexaAccessState(args.userId);
  }

  const priceDetails = getStripePriceDetailsFromSubscription(subscription);
  const planType = getPlanTypeFromSubscription(subscription);
  const status = subscription.status ?? null;
  const hasAccess = STRIPE_ACCESSIBLE_STATUSES.has(status ?? "");
  const purchasedAt = new Date(subscription.created * 1000);

  await upsertUserBillingRecord({
    userId: args.userId,
    productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
    planType,
    status,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceDetails.priceId,
    stripeProductId: priceDetails.productId,
    currentPeriodStart: priceDetails.currentPeriodStart,
    currentPeriodEnd: priceDetails.currentPeriodEnd,
    cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
    canceledAt: priceDetails.canceledAt,
    trialStart: priceDetails.trialStart,
    trialEnd: priceDetails.trialEnd,
    subscriptionPurchasedAt: purchasedAt,
    ...(hasAccess ? { lastPaymentReceivedAt: checkedAt } : {}),
  });

  await upsertUserProfileBilling(args.userId, {
    trialSubscriber: planType === "trial" ? hasAccess : false,
    monthlySubscriber: planType === "monthly" ? hasAccess : false,
    yearlySubscriber: planType === "yearly" ? hasAccess : false,
    trialPlanStatus: planType === "trial" ? status : null,
    monthlyPlanStatus: planType === "monthly" ? status : null,
    yearlyPlanStatus: planType === "yearly" ? status : null,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    subscriptionCheckedAt: checkedAt,
    subscriptionPurchasedAt: purchasedAt,
    subscriptionEmail:
      emailToLookup ?? normalizeText(customer.email) ?? existing.profile?.subscriptionEmail,
    ...(hasAccess ? { lastPaymentReceivedAt: checkedAt } : {}),
  });

  logSubscriptionAccess("info", "synced Stripe subscription into billing state", {
    userId: args.userId,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    planType,
    status,
    hasAccess,
  });

  return readHirexaAccessState(args.userId);
}

export async function getHirexaAccessForUser(
  args: GetHirexaAccessArgs
): Promise<HirexaAccessResult> {
  logSubscriptionAccess("info", "loading access state", {
    userId: args.userId,
    sessionEmail: normalizeText(args.sessionEmail),
    forceSync: Boolean(args.forceSync),
  });

  let state = await readHirexaAccessState(args.userId);

  if (shouldSyncProfile(state.snapshot, args.forceSync, state.billing)) {
    try {
      state = await syncHirexaBillingFromStripe(args);
    } catch (error) {
      logSubscriptionAccess("warn", "access sync failed", {
        userId: args.userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      state = await readHirexaAccessState(args.userId);
    }
  }

  const planType =
    normalizePlanType(state.billing?.planType) ??
    getPlanTypeFromLegacyProfile(state.profile);
  const planStatus =
    normalizeText(state.billing?.status) ??
    getPlanStatusFromLegacyProfile(state.profile);
  const active = state.billing
    ? isActiveBillingStatus(state.billing.status)
    : hasActivePlan(state.profile);
  const pending = isPendingAccess(state.snapshot, active);

  logSubscriptionAccess("info", "resolved access state", {
    userId: args.userId,
    active,
    pending,
    planType,
    planStatus,
    stripeCustomerId: state.snapshot?.stripeCustomerId ?? null,
    stripeSubscriptionId: state.snapshot?.stripeSubscriptionId ?? null,
    subscriptionEmail: state.snapshot?.subscriptionEmail ?? null,
    lastPaymentReceivedAt: state.snapshot?.lastPaymentReceivedAt?.toISOString() ?? null,
    subscriptionCheckedAt: state.snapshot?.subscriptionCheckedAt?.toISOString() ?? null,
  });

  return {
    active,
    pending,
    planType,
    planStatus,
    profile: state.snapshot,
  };
}

export function getHirexaAccessStateLabel(access: HirexaAccessResult) {
  if (access.active) return "active";
  if (access.pending) return "pending";
  return "inactive";
}
