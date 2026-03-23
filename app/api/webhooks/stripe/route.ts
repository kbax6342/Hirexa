import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/app/lib/prisma";
import { getStripeClient } from "../../../lib/stripeClient";
import {
  BILLING_PRODUCT_KEYS,
  getStripePriceDetailsFromSubscription,
  upsertUserBillingRecord,
} from "@/app/lib/billing/userBilling";
import {
  HIREPILOT_PURCHASE_TYPES,
  hasProcessedStripePayment,
  incrementHirePilotCredits,
  resolveHirePilotUserId,
  upsertHirePilotMonthlyBilling,
} from "@/app/lib/billing/hirepilotBilling";

type PlanType = "trial" | "monthly" | "yearly";

// Canonical Stripe webhook handler.
// Stripe Dashboard should point to /api/webhooks/stripe.
// Legacy compatibility aliases exist at /api/stripe/webhook and /api/webhook/stripe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "payment approved",
  "payed",
]);

function normalizeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

async function syncHirePilotBillingEntitlement(params: {
  userId: string;
  subscription: Stripe.Subscription | null;
  stripeCustomerId?: string | null;
  stripeCheckoutSessionId?: string | null;
  paidAt?: Date | null;
}) {
  const priceDetails = getStripePriceDetailsFromSubscription(params.subscription);

  await upsertHirePilotMonthlyBilling({
    userId: params.userId,
    status: params.subscription?.status ?? "active",
    stripeCustomerId: params.stripeCustomerId ?? null,
    stripeSubscriptionId: params.subscription?.id ?? null,
    stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
    stripePriceId: priceDetails.priceId,
    stripeProductId: priceDetails.productId,
    currentPeriodStart: priceDetails.currentPeriodStart,
    currentPeriodEnd: priceDetails.currentPeriodEnd,
    cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
    canceledAt: priceDetails.canceledAt,
    trialStart: priceDetails.trialStart,
    trialEnd: priceDetails.trialEnd,
    paidAt: params.paidAt ?? null,
  });
}

async function getUserProfileFromSubscription(
  stripeClient: Stripe,
  subscriptionId: string
): Promise<{ id: string; userId: string | null } | null> {
  const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);

  const profileIdFromMetadata = subscription.metadata?.hirexa_user_profile_id;
  if (profileIdFromMetadata) {
    const profile = await prisma.userProfile.findUnique({
      where: { id: profileIdFromMetadata },
      select: { id: true, userId: true },
    });

    if (profile?.id) return profile;
  }

  const userIdFromMetadata = subscription.metadata?.hirexa_user_id;
  if (!userIdFromMetadata) return null;

  const profile = await prisma.userProfile.findUnique({
    where: { userId: userIdFromMetadata },
    select: { id: true, userId: true },
  });

  return profile ?? null;
}

async function applyPaymentStatus(params: {
  userProfileId: string;
  userId?: string | null;
  planType: PlanType;
  status:
    | "payment approved"
    | "payed"
    | "active"
    | "trialing"
    | "past_due"
    | "unpaid"
    | "canceled"
    | "incomplete";
  paidAt?: Date;
  subscriptionId?: string | null;
  customerId?: string | null;
  stripeCheckoutSessionId?: string | null;
  priceId?: string | null;
  productId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
}) {
  const paidAt = params.paidAt ?? new Date();
  const current = await prisma.userProfile.findUnique({
    where: { id: params.userProfileId },
    select: { lastPaymentReceivedAt: true },
  });

  const within30Days =
    !!current?.lastPaymentReceivedAt &&
    paidAt.getTime() - current.lastPaymentReceivedAt.getTime() <= THIRTY_DAYS_MS;

  const resolvedStatus =
    params.status === "payed" && within30Days ? "payed" : params.status;
  const hasAccess = ACTIVE_SUBSCRIPTION_STATUSES.has(resolvedStatus);

  if (params.userId) {
    await upsertUserBillingRecord({
      userId: params.userId,
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: params.planType,
      status: resolvedStatus,
      stripeCustomerId: params.customerId ?? null,
      stripeSubscriptionId: params.subscriptionId ?? null,
      stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
      stripePriceId: params.priceId ?? null,
      stripeProductId: params.productId ?? null,
      currentPeriodStart: params.currentPeriodStart ?? null,
      currentPeriodEnd: params.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? false,
      canceledAt: params.canceledAt ?? null,
      trialStart: params.trialStart ?? null,
      trialEnd: params.trialEnd ?? null,
      lastPaymentReceivedAt: hasAccess ? paidAt : undefined,
      subscriptionPurchasedAt: paidAt,
    });
  }

  const data =
    params.planType === "trial"
      ? {
          trialSubscriber: hasAccess,
          trialPlanStatus: resolvedStatus,
          monthlySubscriber: false,
          monthlyPlanStatus: null,
          yearlySubscriber: false,
          yearlyPlanStatus: null,
          lastPaymentReceivedAt: paidAt,
          subscriptionPurchasedAt: paidAt,
          subscriptionCheckedAt: new Date(),
          stripeSubscriptionId: params.subscriptionId ?? undefined,
          stripeCustomerId: params.customerId ?? undefined,
        }
      : params.planType === "monthly"
        ? {
            trialSubscriber: false,
            trialPlanStatus: null,
            monthlySubscriber: hasAccess,
            monthlyPlanStatus: resolvedStatus,
            yearlySubscriber: false,
            yearlyPlanStatus: null,
            lastPaymentReceivedAt: paidAt,
            subscriptionPurchasedAt: paidAt,
            subscriptionCheckedAt: new Date(),
            stripeSubscriptionId: params.subscriptionId ?? undefined,
            stripeCustomerId: params.customerId ?? undefined,
          }
        : {
            trialSubscriber: false,
            trialPlanStatus: null,
            monthlySubscriber: false,
            monthlyPlanStatus: null,
            yearlySubscriber: hasAccess,
            yearlyPlanStatus: resolvedStatus,
            lastPaymentReceivedAt: paidAt,
            subscriptionPurchasedAt: paidAt,
            subscriptionCheckedAt: new Date(),
            stripeSubscriptionId: params.subscriptionId ?? undefined,
            stripeCustomerId: params.customerId ?? undefined,
          };

  await prisma.userProfile.update({
    where: { id: params.userProfileId },
    data,
  });
}

async function saveStripePayment(data: {
  stripeEventId: string;
  userProfileId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  planType?: PlanType | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  paidAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.stripePayment.upsert({
    where: { stripeEventId: data.stripeEventId },
    create: {
      stripeEventId: data.stripeEventId,
      userProfileId: data.userProfileId ?? null,
      stripeCustomerId: data.stripeCustomerId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      stripeCheckoutSessionId: data.stripeCheckoutSessionId ?? null,
      stripeInvoiceId: data.stripeInvoiceId ?? null,
      stripePaymentIntentId: data.stripePaymentIntentId ?? null,
      planType: data.planType ?? null,
      status: data.status ?? null,
      amount: data.amount ?? null,
      currency: data.currency ?? null,
      paidAt: data.paidAt ?? null,
      metadata: (data.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
    },
    update: {
      userProfileId: data.userProfileId ?? null,
      stripeCustomerId: data.stripeCustomerId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      stripeCheckoutSessionId: data.stripeCheckoutSessionId ?? null,
      stripeInvoiceId: data.stripeInvoiceId ?? null,
      stripePaymentIntentId: data.stripePaymentIntentId ?? null,
      planType: data.planType ?? null,
      status: data.status ?? null,
      amount: data.amount ?? null,
      currency: data.currency ?? null,
      paidAt: data.paidAt ?? null,
      metadata: (data.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}

async function getUserProfileIdByUserId(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  return profile?.id ?? null;
}

function getStripeWebhookSecret() {
  return (
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    process.env.STRIPE_V1_WEBHOOK_SECRET?.trim() ||
    null
  );
}

function logStripeWebhook(
  level: "info" | "warn" | "error",
  message: string,
  metadata?: Record<string, unknown>
) {
  const logger =
    level === "error" ? console.error : level === "warn" ? console.warn : console.info;

  if (metadata && Object.keys(metadata).length > 0) {
    logger(`[stripe webhook] ${message}`, metadata);
    return;
  }

  logger(`[stripe webhook] ${message}`);
}

export async function POST(req: Request) {
  const stripeClient = getStripeClient();
  const secret = getStripeWebhookSecret();

  if (!secret) {
    logStripeWebhook("error", "missing webhook secret");
    return NextResponse.json({ error: "Webhook configuration is missing." }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    logStripeWebhook("warn", "missing stripe-signature header");
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }

  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(payload, sig, secret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logStripeWebhook("warn", "signature verification failed", { message });
    return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
  }

  try {
    let handledEvent = false;

    if (event.type === "checkout.session.completed") {
      handledEvent = true;
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = normalizeCustomerId(
        session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null
      );
      const hirePilotPurchaseType = session.metadata?.hirepilot_purchase_type ?? null;
      const hirePilotUserId = await resolveHirePilotUserId({
        userIdFromMetadata: session.metadata?.hirepilot_user_id ?? null,
        clientReferenceId: session.client_reference_id ?? null,
        customerEmail:
          session.customer_details?.email ??
          session.customer_email ??
          ((session.customer as Stripe.Customer | null | undefined)?.email ?? null),
      });

      if (hirePilotPurchaseType === HIREPILOT_PURCHASE_TYPES.CREDIT) {
        const creditAlreadyProcessed = await hasProcessedStripePayment({
          stripeEventId: event.id,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
        });

        if (hirePilotUserId && !creditAlreadyProcessed) {
          const creditCount = Math.max(
            1,
            Number(session.metadata?.hirepilot_credits ?? "1") || 1
          );
          await incrementHirePilotCredits({
            userId: hirePilotUserId,
            credits: creditCount,
            stripeCustomerId: customerId,
            stripeCheckoutSessionId: session.id,
            stripePriceId: process.env.STRIPE_HIREPILOT_CREDIT_PRICE_ID?.trim() ?? null,
          });
        }

        await saveStripePayment({
          stripeEventId: event.id,
          userProfileId: hirePilotUserId ? await getUserProfileIdByUserId(hirePilotUserId) : null,
          stripeCustomerId: customerId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
          status: session.payment_status,
          amount: session.amount_total ?? null,
          currency: session.currency ?? null,
          paidAt: new Date(),
          metadata: {
            sessionMetadata: session.metadata,
            purchaseType: hirePilotPurchaseType,
          },
        });
      }

      if (
        hirePilotPurchaseType === HIREPILOT_PURCHASE_TYPES.SUBSCRIPTION &&
        hirePilotUserId
      ) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        const subscription = subscriptionId
          ? await stripeClient.subscriptions.retrieve(subscriptionId)
          : null;

        await syncHirePilotBillingEntitlement({
          userId: hirePilotUserId,
          subscription,
          stripeCustomerId: customerId,
          stripeCheckoutSessionId: session.id,
          paidAt: new Date(),
        });
      }

      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
        const priceDetails = getStripePriceDetailsFromSubscription(subscription);

        const introPriceId =
          session.metadata?.hirexa_intro_price_id ??
          subscription.metadata?.hirexa_intro_price_id ??
          process.env.STRIPE_TRIAL_PRICE_ID;

        const fullPriceId =
          session.metadata?.hirexa_full_price_id ??
          subscription.metadata?.hirexa_full_price_id ??
          process.env.STRIPE_FULL_PRICE_ID;

        const introDaysRaw =
          session.metadata?.hirexa_intro_days ??
          subscription.metadata?.hirexa_intro_days ??
          "14";

        const introDays = Math.max(1, Math.min(30, Number(introDaysRaw || 14)));

        const planFromMetadata =
          session.metadata?.hirexa_plan ?? subscription.metadata?.hirexa_plan;

        const userProfile =
          (session.client_reference_id
            ? await prisma.userProfile.findUnique({
                where: { id: session.client_reference_id },
                select: { id: true, userId: true },
              })
            : null) ??
          (session.metadata?.hirexa_user_profile_id
            ? await prisma.userProfile.findUnique({
                where: { id: session.metadata.hirexa_user_profile_id },
                select: { id: true, userId: true },
              })
            : null) ??
          (subscription.metadata?.hirexa_user_profile_id
            ? await prisma.userProfile.findUnique({
                where: { id: subscription.metadata.hirexa_user_profile_id },
                select: { id: true, userId: true },
              })
            : null);

        const planType: PlanType =
          planFromMetadata === "annual"
            ? "yearly"
            : planFromMetadata === "trial"
              ? "trial"
              : "monthly";

        if (userProfile?.id) {
          await applyPaymentStatus({
            userProfileId: userProfile.id,
            userId: userProfile.userId ?? null,
            planType,
            status: "payment approved",
            paidAt: new Date(),
            subscriptionId,
            customerId,
            stripeCheckoutSessionId: session.id,
            priceId: priceDetails.priceId,
            productId: priceDetails.productId,
            currentPeriodStart: priceDetails.currentPeriodStart,
            currentPeriodEnd: priceDetails.currentPeriodEnd,
            cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
            canceledAt: priceDetails.canceledAt,
            trialStart: priceDetails.trialStart,
            trialEnd: priceDetails.trialEnd,
          });
        }

        await saveStripePayment({
          stripeEventId: event.id,
          userProfileId: userProfile?.id ?? null,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
          planType,
          status: session.payment_status,
          amount: session.amount_total ?? null,
          currency: session.currency ?? null,
          paidAt: new Date(),
          metadata: {
            sessionMetadata: session.metadata,
            subscriptionMetadata: subscription.metadata,
          },
        });

        if (introPriceId && fullPriceId) {
          await stripeClient.subscriptionSchedules.create({
            from_subscription: subscriptionId,
            phases: [
              {
                items: [{ price: introPriceId, quantity: 1 }],
                iterations: 1,
                start_date: Math.floor(Date.now() / 1000),
                end_date: Math.floor(Date.now() / 1000) + introDays * 24 * 60 * 60,
              },
              {
                items: [{ price: fullPriceId, quantity: 1 }],
              },
            ],
            end_behavior: "release",
          } as any);
        }
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      handledEvent = true;
      const invoice = event.data.object as Stripe.Invoice;
      const rawSubscription = (
        invoice as { subscription?: string | Stripe.Subscription | null }
      ).subscription;
      const subscriptionId =
        typeof rawSubscription === "string" ? rawSubscription : rawSubscription?.id ?? null;

      if (subscriptionId) {
        const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
        const priceDetails = getStripePriceDetailsFromSubscription(subscription);

        if (
          subscription.metadata?.hirepilot_purchase_type ===
          HIREPILOT_PURCHASE_TYPES.SUBSCRIPTION
        ) {
          const hirePilotUserId = await resolveHirePilotUserId({
            userIdFromMetadata: subscription.metadata?.hirepilot_user_id ?? null,
            customerEmail:
              typeof invoice.customer_email === "string" ? invoice.customer_email : null,
          });

          if (hirePilotUserId) {
            await syncHirePilotBillingEntitlement({
              userId: hirePilotUserId,
              subscription,
              stripeCustomerId: normalizeCustomerId(invoice.customer),
              paidAt: new Date(
                (invoice.status_transitions.paid_at ?? Math.floor(Date.now() / 1000)) * 1000
              ),
            });
          }
        }

        const userProfile = await getUserProfileFromSubscription(stripeClient, subscriptionId);
        const line = invoice.lines.data[0];
        const linePrice = (line as any)?.price;
        const interval = linePrice?.recurring?.interval;
        const paidAt = new Date(
          (invoice.status_transitions.paid_at ?? Math.floor(Date.now() / 1000)) * 1000
        );
        const planType: PlanType = interval === "year" ? "yearly" : "monthly";

        if (userProfile?.id) {
          await applyPaymentStatus({
            userProfileId: userProfile.id,
            userId: userProfile.userId ?? null,
            planType,
            status: "payed",
            paidAt,
            subscriptionId,
            customerId: normalizeCustomerId(invoice.customer),
            priceId: priceDetails.priceId,
            productId: priceDetails.productId,
            currentPeriodStart: priceDetails.currentPeriodStart,
            currentPeriodEnd: priceDetails.currentPeriodEnd,
            cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
            canceledAt: priceDetails.canceledAt,
            trialStart: priceDetails.trialStart,
            trialEnd: priceDetails.trialEnd,
          });
        }

        await saveStripePayment({
          stripeEventId: event.id,
          userProfileId: userProfile?.id ?? null,
          stripeCustomerId: normalizeCustomerId(invoice.customer),
          stripeSubscriptionId: subscriptionId,
          stripeInvoiceId: invoice.id,
          stripePaymentIntentId: (() => {
            const paymentIntent = (invoice as any).payment_intent;
            return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
          })(),
          planType,
          status: invoice.status,
          amount: invoice.amount_paid ?? null,
          currency: invoice.currency ?? null,
          paidAt,
          metadata: {
            invoiceNumber: invoice.number,
            billingReason: invoice.billing_reason,
          },
        });
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      handledEvent = true;
      const subscription = event.data.object as Stripe.Subscription;
      const priceDetails = getStripePriceDetailsFromSubscription(subscription);

      if (
        subscription.metadata?.hirepilot_purchase_type ===
        HIREPILOT_PURCHASE_TYPES.SUBSCRIPTION
      ) {
        const hirePilotUserId = await resolveHirePilotUserId({
          userIdFromMetadata: subscription.metadata?.hirepilot_user_id ?? null,
        });

        if (hirePilotUserId) {
          await syncHirePilotBillingEntitlement({
            userId: hirePilotUserId,
            subscription,
            stripeCustomerId: normalizeCustomerId(subscription.customer),
          });
        }
      }

      const userProfile = subscription.id
        ? await getUserProfileFromSubscription(stripeClient, subscription.id)
        : null;

      if (userProfile?.id && subscription.metadata?.hirexa_plan) {
        const planType: PlanType =
          subscription.metadata.hirexa_plan === "annual"
            ? "yearly"
            : subscription.metadata.hirexa_plan === "trial"
              ? "trial"
              : "monthly";

        await applyPaymentStatus({
          userProfileId: userProfile.id,
          userId: userProfile.userId ?? null,
          planType,
          status: (subscription.status ?? "canceled") as
            | "payment approved"
            | "payed"
            | "active"
            | "trialing"
            | "past_due"
            | "unpaid"
            | "canceled"
            | "incomplete",
          paidAt: new Date(),
          subscriptionId: subscription.id,
          customerId: normalizeCustomerId(subscription.customer),
          priceId: priceDetails.priceId,
          productId: priceDetails.productId,
          currentPeriodStart: priceDetails.currentPeriodStart,
          currentPeriodEnd: priceDetails.currentPeriodEnd,
          cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
          canceledAt: priceDetails.canceledAt,
          trialStart: priceDetails.trialStart,
          trialEnd: priceDetails.trialEnd,
        });
      }
    }

    if (handledEvent) {
      logStripeWebhook("info", "processed event", {
        eventId: event.id,
        eventType: event.type,
      });
    } else {
      logStripeWebhook("info", "unhandled event type", {
        eventId: event.id,
        eventType: event.type,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handling failed";
    logStripeWebhook("error", "webhook handling failed", {
      eventId: event.id,
      eventType: event.type,
      message,
    });
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
