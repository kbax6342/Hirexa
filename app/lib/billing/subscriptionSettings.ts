import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/app/lib/prisma";
import { getStripeClient } from "@/app/lib/stripeClient";
import {
  BILLING_PRODUCT_KEYS,
  isActiveBillingStatus,
  readUserBillingRecords,
  stripeTimestampToDate,
} from "@/app/lib/billing/userBilling";
import { getHirePilotBillingStatus } from "@/app/lib/hirepilot/checkHirePilotAccess";

type BillingRecord = Awaited<ReturnType<typeof readUserBillingRecords>>[number];
type LegacyProfile = Awaited<ReturnType<typeof readLegacyProfile>>;

type BillingSource = {
  productKey: string;
  planType: string | null;
  status: string | null;
  hirePilotCredits: number;
  hirePilotUnlimited: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeProductId: string | null;
  stripeCheckoutSessionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  lastPaymentReceivedAt: Date | null;
  subscriptionPurchasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StripePaymentSnapshot = {
  amount: number | null;
  currency: string | null;
  paidAt: Date | null;
  status: string | null;
  stripeInvoiceId: string | null;
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type ResolvedCard = {
  label: string;
  type: string | null;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

type ResolvedStripeDetails = {
  productName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  billingInterval: Stripe.Price.Recurring.Interval | null;
  billingIntervalCount: number | null;
  status: string | null;
  startedOn: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastChargeAmount: number | null;
  lastChargeCurrency: string | null;
  lastChargeAt: Date | null;
  latestInvoiceStatus: string | null;
  receiptUrl: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  stripeInvoiceId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  billingEmail: string | null;
  paymentMethod: ResolvedCard;
  isSubscription: boolean;
};

export type SubscriptionSettingsProductView = {
  productKey: string;
  productLabel: string;
  planLabel: string;
  status: string;
  accessLabel: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  billingInterval: Stripe.Price.Recurring.Interval | null;
  billingIntervalCount: number | null;
  startedOn: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastChargeAmount: number | null;
  lastChargeCurrency: string | null;
  lastChargeAt: Date | null;
  latestInvoiceStatus: string | null;
  receiptUrl: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  stripeInvoiceId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  billingEmail: string | null;
  paymentMethod: ResolvedCard;
  isSubscription: boolean;
  lastActivity: Date | null;
  isPrimary: boolean;
};

export type SubscriptionSettingsViewModel = {
  accountId: string;
  email: string | null;
  supportEmail: string | null;
  products: SubscriptionSettingsProductView[];
  access: {
    hirexa: string;
    hirepilot: string;
    hirepilotCredits: number;
  };
};

const EMPTY_HIREPILOT_BILLING_STATUS = {
  hasHirePilotAccess: false,
  hirePilotUnlimited: false,
  hirePilotCredits: 0,
  monthlyCredits: 0,
  rolloverCredits: 0,
  purchasedCredits: 0,
  productKey: null,
  status: null,
  currentPeriodEnd: null,
  nextMonthlyResetAt: null,
  earliestPurchasedExpiryAt: null,
  lowBalance: false,
  hasExpiringCredits: false,
  recentUsage: [],
  monthly: null,
  credits: null,
} as const;

function normalizeText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function humanizeStatus(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return "Not available";
  return normalized.replace(/_/g, " ");
}

function productLabelForKey(productKey: string | null | undefined) {
  switch (productKey) {
    case BILLING_PRODUCT_KEYS.HIREXA_CORE:
      return "Hirexa AI";
    case BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY:
      return "HirePilot";
    case BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT:
      return "HirePilot Credits";
    default:
      return "Billing product";
  }
}

function defaultPlanLabel(source: BillingSource) {
  if (source.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT) {
    return "Interview credit";
  }

  if (source.planType === "trial") return "Trial";
  if (source.planType === "monthly") return "Monthly subscription";
  if (source.planType === "yearly") return "Annual subscription";
  if (source.planType === "credits") return "Interview credit";

  return source.stripeSubscriptionId ? "Subscription" : "Purchase";
}

function inferLegacyPlanType(profile: LegacyProfile) {
  if (!profile) return null;
  if (profile.trialSubscriber || profile.trialPlanStatus) return "trial";
  if (profile.monthlySubscriber || profile.monthlyPlanStatus) return "monthly";
  if (profile.yearlySubscriber || profile.yearlyPlanStatus) return "yearly";
  return null;
}

function inferLegacyStatus(profile: LegacyProfile) {
  if (!profile) return null;

  return (
    normalizeText(profile.trialPlanStatus) ??
    normalizeText(profile.monthlyPlanStatus) ??
    normalizeText(profile.yearlyPlanStatus) ??
    null
  );
}

function getLastActivity(source: BillingSource) {
  return (
    source.lastPaymentReceivedAt ??
    source.subscriptionPurchasedAt ??
    source.currentPeriodEnd ??
    source.updatedAt ??
    source.createdAt
  );
}

function getExpandedCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!customer || typeof customer === "string") return null;
  if ("deleted" in customer && customer.deleted) return null;
  return customer;
}

function getExpandedInvoice(invoice: string | Stripe.Invoice | null | undefined) {
  if (!invoice || typeof invoice === "string") return null;
  return invoice;
}

function getExpandedPaymentIntent(
  paymentIntent: string | Stripe.PaymentIntent | null | undefined
) {
  if (!paymentIntent || typeof paymentIntent === "string") return null;
  return paymentIntent;
}

function getExpandedPaymentMethod(
  paymentMethod: string | Stripe.PaymentMethod | null | undefined
) {
  if (!paymentMethod || typeof paymentMethod === "string") return null;
  return paymentMethod;
}

function getExpandedCharge(charge: string | Stripe.Charge | null | undefined) {
  if (!charge || typeof charge === "string") return null;
  return charge;
}

function getExpandedProduct(
  product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined
) {
  if (!product || typeof product === "string") return null;
  if ("deleted" in product && product.deleted) return null;
  return product;
}

function summarizePaymentMethod(paymentMethod: Stripe.PaymentMethod | null): ResolvedCard {
  if (!paymentMethod) {
    return {
      label: "No payment method on file",
      type: null,
      brand: null,
      last4: null,
      expMonth: null,
      expYear: null,
    };
  }

  if (paymentMethod.type === "card" && paymentMethod.card) {
    const brand =
      paymentMethod.card.brand.charAt(0).toUpperCase() +
      paymentMethod.card.brand.slice(1);

    return {
      label: `${brand} ending in ${paymentMethod.card.last4}`,
      type: paymentMethod.type,
      brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
    };
  }

  return {
    label: `Payment method on file (${paymentMethod.type})`,
    type: paymentMethod.type,
    brand: null,
    last4: null,
    expMonth: null,
    expYear: null,
  };
}

async function readLegacyProfile(userId: string) {
  return prisma.userProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      email: true,
      trialSubscriber: true,
      monthlySubscriber: true,
      yearlySubscriber: true,
      trialPlanStatus: true,
      monthlyPlanStatus: true,
      yearlyPlanStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionPurchasedAt: true,
      lastPaymentReceivedAt: true,
    },
  });
}

function buildBillingSources(
  rows: BillingRecord[],
  profile: LegacyProfile
): BillingSource[] {
  const sources = rows.map((row) => ({
    productKey: row.productKey,
    planType: normalizeText(row.planType),
    status: normalizeText(row.status),
    hirePilotCredits: row.hirePilotCredits ?? 0,
    hirePilotUnlimited: Boolean(row.hirePilotUnlimited),
    stripeCustomerId: normalizeText(row.stripeCustomerId),
    stripeSubscriptionId: normalizeText(row.stripeSubscriptionId),
    stripePriceId: normalizeText(row.stripePriceId),
    stripeProductId: normalizeText(row.stripeProductId),
    stripeCheckoutSessionId: normalizeText(row.stripeCheckoutSessionId),
    currentPeriodStart: row.currentPeriodStart ?? null,
    currentPeriodEnd: row.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
    canceledAt: row.canceledAt ?? null,
    trialStart: row.trialStart ?? null,
    trialEnd: row.trialEnd ?? null,
    lastPaymentReceivedAt: row.lastPaymentReceivedAt ?? null,
    subscriptionPurchasedAt: row.subscriptionPurchasedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  if (sources.length > 0 || !profile) {
    return sources;
  }

  const legacyPlanType = inferLegacyPlanType(profile);
  const legacyStatus = inferLegacyStatus(profile);
  const hasLegacyBilling =
    Boolean(legacyPlanType) ||
    Boolean(legacyStatus) ||
    Boolean(profile.stripeCustomerId) ||
    Boolean(profile.stripeSubscriptionId) ||
    Boolean(profile.subscriptionPurchasedAt) ||
    Boolean(profile.lastPaymentReceivedAt);

  if (!hasLegacyBilling) {
    return sources;
  }

  return [
    {
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: legacyPlanType,
      status: legacyStatus,
      hirePilotCredits: 0,
      hirePilotUnlimited: false,
      stripeCustomerId: normalizeText(profile.stripeCustomerId),
      stripeSubscriptionId: normalizeText(profile.stripeSubscriptionId),
      stripePriceId: null,
      stripeProductId: null,
      stripeCheckoutSessionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialStart: null,
      trialEnd: null,
      lastPaymentReceivedAt: profile.lastPaymentReceivedAt ?? null,
      subscriptionPurchasedAt: profile.subscriptionPurchasedAt ?? null,
      createdAt: profile.subscriptionPurchasedAt ?? new Date(0),
      updatedAt:
        profile.lastPaymentReceivedAt ??
        profile.subscriptionPurchasedAt ??
        new Date(0),
    },
  ];
}

function sortBillingSources(sources: BillingSource[]) {
  return [...sources].sort((left, right) => {
    const rightActivity = getLastActivity(right)?.getTime() ?? 0;
    const leftActivity = getLastActivity(left)?.getTime() ?? 0;
    if (rightActivity !== leftActivity) {
      return rightActivity - leftActivity;
    }

    const rightActive = isActiveBillingStatus(right.status) ? 1 : 0;
    const leftActive = isActiveBillingStatus(left.status) ? 1 : 0;
    if (rightActive !== leftActive) {
      return rightActive - leftActive;
    }

    const rightSubscription = right.stripeSubscriptionId ? 1 : 0;
    const leftSubscription = left.stripeSubscriptionId ? 1 : 0;
    return rightSubscription - leftSubscription;
  });
}

async function findLatestStripePayment(
  profileId: string | null,
  source: BillingSource
): Promise<StripePaymentSnapshot | null> {
  if (source.stripeCheckoutSessionId) {
    return prisma.stripePayment.findFirst({
      where: { stripeCheckoutSessionId: source.stripeCheckoutSessionId },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        currency: true,
        paidAt: true,
        status: true,
        stripeInvoiceId: true,
        stripePaymentIntentId: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });
  }

  if (source.stripeSubscriptionId) {
    return prisma.stripePayment.findFirst({
      where: { stripeSubscriptionId: source.stripeSubscriptionId },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        currency: true,
        paidAt: true,
        status: true,
        stripeInvoiceId: true,
        stripePaymentIntentId: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });
  }

  if (source.stripeCustomerId) {
    return prisma.stripePayment.findFirst({
      where: { stripeCustomerId: source.stripeCustomerId },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        currency: true,
        paidAt: true,
        status: true,
        stripeInvoiceId: true,
        stripePaymentIntentId: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });
  }

  if (!profileId) {
    return null;
  }

  return prisma.stripePayment.findFirst({
    where: { userProfileId: profileId },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: {
      amount: true,
      currency: true,
      paidAt: true,
      status: true,
      stripeInvoiceId: true,
      stripePaymentIntentId: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
}

async function readCustomerCard(
  stripe: Stripe,
  customerId: string | null | undefined
) {
  if (!customerId) return null;

  try {
    const methods = await stripe.customers.listPaymentMethods(customerId, {
      type: "card",
      limit: 1,
    });
    return methods.data[0] ?? null;
  } catch (error) {
    console.warn("[SUBSCRIPTION_SETTINGS] customer payment method lookup failed", {
      stripeCustomerId: customerId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function loadStripePriceDetails(
  stripe: Stripe,
  source: BillingSource
): Promise<{ productName: string | null; priceAmount: number | null; priceCurrency: string | null }> {
  if (!source.stripePriceId) {
    return {
      productName: null,
      priceAmount: null,
      priceCurrency: null,
    };
  }

  try {
    const price = await stripe.prices.retrieve(source.stripePriceId, {
      expand: ["product"],
    });
    const product = getExpandedProduct(price.product);

    return {
      productName: product?.name ?? null,
      priceAmount: price.unit_amount ?? null,
      priceCurrency: price.currency ?? null,
    };
  } catch (error) {
    console.warn("[SUBSCRIPTION_SETTINGS] price lookup failed", {
      stripePriceId: source.stripePriceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      productName: null,
      priceAmount: null,
      priceCurrency: null,
    };
  }
}

async function loadStripeSubscriptionDetails(
  stripe: Stripe,
  source: BillingSource
): Promise<ResolvedStripeDetails | null> {
  if (!source.stripeSubscriptionId) {
    return null;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(source.stripeSubscriptionId, {
      expand: [
        "customer",
        "default_payment_method",
        "latest_invoice.payment_intent.payment_method",
        "latest_invoice.payment_intent.latest_charge",
        "items.data.price.product",
      ],
    });

    const price = subscription.items.data[0]?.price ?? null;
    const product = getExpandedProduct(price?.product);
    const invoice = getExpandedInvoice(subscription.latest_invoice);
    const invoiceWithPaymentIntent = invoice as
      | (Stripe.Invoice & {
          payment_intent?: string | Stripe.PaymentIntent | null;
        })
      | null;
    const paymentIntent = getExpandedPaymentIntent(
      invoiceWithPaymentIntent?.payment_intent
    );
    const charge = getExpandedCharge(paymentIntent?.latest_charge);
    const customer = getExpandedCustomer(subscription.customer);
    let paymentMethod =
      getExpandedPaymentMethod(subscription.default_payment_method) ??
      getExpandedPaymentMethod(paymentIntent?.payment_method);

    if (!paymentMethod) {
      paymentMethod = await readCustomerCard(
        stripe,
        customer?.id ?? source.stripeCustomerId ?? null
      );
    }

    return {
      productName: product?.name ?? null,
      priceAmount: price?.unit_amount ?? null,
      priceCurrency: price?.currency ?? null,
      billingInterval: price?.recurring?.interval ?? null,
      billingIntervalCount: price?.recurring?.interval_count ?? null,
      status: normalizeText(subscription.status) ?? source.status,
      startedOn: source.subscriptionPurchasedAt ?? new Date(subscription.created * 1000),
      currentPeriodStart:
        source.currentPeriodStart ??
        stripeTimestampToDate(
          (subscription as Stripe.Subscription & {
            current_period_start?: number | null;
          }).current_period_start ?? null
        ),
      currentPeriodEnd:
        source.currentPeriodEnd ??
        stripeTimestampToDate(
          (subscription as Stripe.Subscription & {
            current_period_end?: number | null;
          }).current_period_end ?? null
        ),
      cancelAtPeriodEnd: source.cancelAtPeriodEnd || Boolean(subscription.cancel_at_period_end),
      lastChargeAmount: invoice?.amount_paid ?? null,
      lastChargeCurrency: invoice?.currency ?? price?.currency ?? null,
      lastChargeAt: stripeTimestampToDate(
        invoice?.status_transitions?.paid_at ?? invoice?.created ?? null
      ),
      latestInvoiceStatus: normalizeText(invoice?.status) ?? null,
      receiptUrl: charge?.receipt_url ?? null,
      hostedInvoiceUrl: invoice?.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice?.invoice_pdf ?? null,
      stripeInvoiceId: invoice?.id ?? null,
      stripeCustomerId: customer?.id ?? source.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripeCheckoutSessionId: source.stripeCheckoutSessionId,
      billingEmail: normalizeText(customer?.email) ?? null,
      paymentMethod: summarizePaymentMethod(paymentMethod ?? null),
      isSubscription: true,
    };
  } catch (error) {
    console.warn("[SUBSCRIPTION_SETTINGS] subscription lookup failed", {
      stripeSubscriptionId: source.stripeSubscriptionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function loadStripeOneTimeDetails(
  stripe: Stripe,
  profileId: string | null,
  source: BillingSource
): Promise<ResolvedStripeDetails> {
  const [priceDetails, latestPayment] = await Promise.all([
    loadStripePriceDetails(stripe, source),
    findLatestStripePayment(profileId, source),
  ]);

  let customer: Stripe.Customer | null = null;
  let paymentMethod: Stripe.PaymentMethod | null = null;
  let receiptUrl: string | null = null;

  if (latestPayment?.stripePaymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        latestPayment.stripePaymentIntentId,
        {
          expand: ["customer", "payment_method", "latest_charge"],
        }
      );
      customer = getExpandedCustomer(paymentIntent.customer);
      paymentMethod = getExpandedPaymentMethod(paymentIntent.payment_method);
      const charge = getExpandedCharge(paymentIntent.latest_charge);
      receiptUrl = charge?.receipt_url ?? null;
    } catch (error) {
      console.warn("[SUBSCRIPTION_SETTINGS] payment intent lookup failed", {
        stripePaymentIntentId: latestPayment.stripePaymentIntentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!customer && source.stripeCustomerId) {
    try {
      const result = await stripe.customers.retrieve(source.stripeCustomerId);
      customer = getExpandedCustomer(result);
    } catch (error) {
      console.warn("[SUBSCRIPTION_SETTINGS] customer lookup failed", {
        stripeCustomerId: source.stripeCustomerId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!paymentMethod) {
    paymentMethod = await readCustomerCard(
      stripe,
      source.stripeCustomerId ?? latestPayment?.stripeCustomerId ?? customer?.id ?? null
    );
  }

  return {
    productName: priceDetails.productName,
    priceAmount: priceDetails.priceAmount ?? latestPayment?.amount ?? null,
    priceCurrency: priceDetails.priceCurrency ?? latestPayment?.currency ?? null,
    billingInterval: null,
    billingIntervalCount: null,
    status:
      source.status ??
      normalizeText(latestPayment?.status) ??
      (source.planType === "credits" ? "paid" : null),
    startedOn:
      source.subscriptionPurchasedAt ??
      source.lastPaymentReceivedAt ??
      latestPayment?.paidAt ??
      source.updatedAt,
    currentPeriodStart: source.currentPeriodStart,
    currentPeriodEnd: source.currentPeriodEnd,
    cancelAtPeriodEnd: source.cancelAtPeriodEnd,
    lastChargeAmount: latestPayment?.amount ?? null,
    lastChargeCurrency: latestPayment?.currency ?? null,
    lastChargeAt: latestPayment?.paidAt ?? source.lastPaymentReceivedAt,
    latestInvoiceStatus: normalizeText(latestPayment?.status) ?? null,
    receiptUrl,
    hostedInvoiceUrl: null,
    invoicePdfUrl: null,
    stripeInvoiceId: latestPayment?.stripeInvoiceId ?? null,
    stripeCustomerId:
      customer?.id ??
      source.stripeCustomerId ??
      latestPayment?.stripeCustomerId ??
      null,
    stripeSubscriptionId:
      source.stripeSubscriptionId ?? latestPayment?.stripeSubscriptionId ?? null,
    stripeCheckoutSessionId: source.stripeCheckoutSessionId,
    billingEmail: normalizeText(customer?.email) ?? null,
    paymentMethod: summarizePaymentMethod(paymentMethod),
    isSubscription: false,
  };
}

function buildHirexaAccessLabel(sources: BillingSource[], profile: LegacyProfile) {
  const hirexaSource = sources.find(
    (source) => source.productKey === BILLING_PRODUCT_KEYS.HIREXA_CORE
  );

  if (hirexaSource && isActiveBillingStatus(hirexaSource.status)) {
    return `Active (${humanizeStatus(hirexaSource.status)})`;
  }

  if (profile?.trialSubscriber || profile?.monthlySubscriber || profile?.yearlySubscriber) {
    return "Active";
  }

  const pendingStatus = hirexaSource?.status ?? inferLegacyStatus(profile);
  if (pendingStatus) {
    return humanizeStatus(pendingStatus);
  }

  return "Inactive";
}

function buildHirePilotAccessLabel(
  sources: BillingSource[],
  status: { hirePilotUnlimited: boolean; hirePilotCredits: number }
) {
  if (status.hirePilotUnlimited) {
    return "Unlimited access active";
  }

  if (status.hirePilotCredits > 0) {
    return `${status.hirePilotCredits} credits available`;
  }

  const monthlySource = sources.find(
    (source) => source.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY
  );
  if (monthlySource?.status) {
    return humanizeStatus(monthlySource.status);
  }

  return "Inactive";
}

function buildProductAccessLabel(
  source: BillingSource,
  args: {
    hirexaLabel: string;
    hirepilotLabel: string;
    hirepilotCredits: number;
  }
) {
  if (source.productKey === BILLING_PRODUCT_KEYS.HIREXA_CORE) {
    return args.hirexaLabel;
  }

  if (source.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY) {
    return args.hirepilotLabel;
  }

  if (source.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT) {
    return args.hirepilotCredits > 0
      ? `${args.hirepilotCredits} credits remaining`
      : "No credits remaining";
  }

  return humanizeStatus(source.status);
}

async function buildProductView(args: {
  stripe: Stripe;
  source: BillingSource;
  profileId: string | null;
  defaultEmail: string | null;
  accessLabel: string;
  isPrimary: boolean;
}) {
  const stripeDetails =
    (await loadStripeSubscriptionDetails(args.stripe, args.source)) ??
    (await loadStripeOneTimeDetails(args.stripe, args.profileId, args.source));

  const fallbackProductLabel = productLabelForKey(args.source.productKey);
  const stripeProductName = normalizeText(stripeDetails.productName);
  const productLabel = fallbackProductLabel;
  const planLabel =
    stripeProductName && stripeProductName !== fallbackProductLabel
      ? stripeProductName
      : defaultPlanLabel(args.source);

  return {
    productKey: args.source.productKey,
    productLabel,
    planLabel,
    status: humanizeStatus(stripeDetails.status ?? args.source.status),
    accessLabel: args.accessLabel,
    priceAmount: stripeDetails.priceAmount,
    priceCurrency: stripeDetails.priceCurrency,
    billingInterval: stripeDetails.billingInterval,
    billingIntervalCount: stripeDetails.billingIntervalCount,
    startedOn: stripeDetails.startedOn,
    currentPeriodStart: stripeDetails.currentPeriodStart,
    currentPeriodEnd: stripeDetails.currentPeriodEnd,
    cancelAtPeriodEnd: stripeDetails.cancelAtPeriodEnd,
    lastChargeAmount: stripeDetails.lastChargeAmount,
    lastChargeCurrency: stripeDetails.lastChargeCurrency,
    lastChargeAt: stripeDetails.lastChargeAt,
    latestInvoiceStatus: stripeDetails.latestInvoiceStatus,
    receiptUrl: stripeDetails.receiptUrl,
    hostedInvoiceUrl: stripeDetails.hostedInvoiceUrl,
    invoicePdfUrl: stripeDetails.invoicePdfUrl,
    stripeInvoiceId: stripeDetails.stripeInvoiceId,
    stripeCustomerId: stripeDetails.stripeCustomerId ?? args.source.stripeCustomerId,
    stripeSubscriptionId:
      stripeDetails.stripeSubscriptionId ?? args.source.stripeSubscriptionId,
    stripeCheckoutSessionId:
      stripeDetails.stripeCheckoutSessionId ?? args.source.stripeCheckoutSessionId,
    billingEmail: stripeDetails.billingEmail ?? args.defaultEmail,
    paymentMethod: stripeDetails.paymentMethod,
    isSubscription: stripeDetails.isSubscription,
    lastActivity: getLastActivity(args.source),
    isPrimary: args.isPrimary,
  } satisfies SubscriptionSettingsProductView;
}

export async function getSubscriptionSettingsViewModel(args: {
  userId: string;
  sessionEmail?: string | null;
}) {
  const [user, profile, billingRows, hirePilotStatus] = await Promise.all([
    prisma.user.findUnique({
      where: { id: args.userId },
      select: {
        id: true,
        email: true,
      },
    }),
    readLegacyProfile(args.userId),
    readUserBillingRecords(args.userId),
    getHirePilotBillingStatus(args.userId).catch((error) => {
      console.error("[subscription settings] failed to read HirePilot billing status", {
        userId: args.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return EMPTY_HIREPILOT_BILLING_STATUS;
    }),
  ]);

  if (!user) {
    return null;
  }

  const sources = sortBillingSources(buildBillingSources(billingRows, profile));
  const hirexaLabel = buildHirexaAccessLabel(sources, profile);
  const hirepilotLabel = buildHirePilotAccessLabel(sources, hirePilotStatus);
  const stripe = sources.length > 0 ? getStripeClient() : null;

  const products = stripe
    ? await Promise.all(
        sources.map((source, index) =>
          buildProductView({
            stripe,
            source,
            profileId: profile?.id ?? null,
            defaultEmail:
              normalizeText(user.email) ??
              normalizeText(profile?.email) ??
              normalizeText(args.sessionEmail),
            accessLabel: buildProductAccessLabel(source, {
              hirexaLabel,
              hirepilotLabel,
              hirepilotCredits: hirePilotStatus.hirePilotCredits,
            }),
            isPrimary: index === 0,
          })
        )
      )
    : [];

  return {
    accountId: user.id,
    email: normalizeText(user.email) ?? normalizeText(profile?.email),
    supportEmail: process.env.EMAIL_SUPPORT ?? null,
    products,
    access: {
      hirexa: hirexaLabel,
      hirepilot: hirepilotLabel,
      hirepilotCredits: hirePilotStatus.hirePilotCredits,
    },
  } satisfies SubscriptionSettingsViewModel;
}
