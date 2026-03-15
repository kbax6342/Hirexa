import { NextResponse } from "next/server";
import Stripe from "stripe";

import { prisma } from "@/app/lib/prisma";
import { getStripeClient } from "@/app/lib/stripeClient";
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

export const runtime = "nodejs";

type HirexaPlanType = "trial" | "monthly" | "yearly";

const HIREXA_ACTIVE_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "payment approved",
  "payed",
]);

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

function getHirexaPlanType(params: {
  metadataPlan?: string | null;
  subscription?: Stripe.Subscription | null;
}) {
  const metadataPlan = params.metadataPlan?.trim().toLowerCase();

  if (metadataPlan === "trial") return "trial";
  if (metadataPlan === "annual" || metadataPlan === "yearly") return "yearly";

  return params.subscription?.items.data[0]?.price?.recurring?.interval === "year"
    ? "yearly"
    : "monthly";
}

async function resolveHirexaProfile(params: {
  userProfileId?: string | null;
  userId?: string | null;
  email?: string | null;
}) {
  if (params.userProfileId) {
    const profile = await prisma.userProfile.findUnique({
      where: { id: params.userProfileId },
      select: { id: true, userId: true },
    });

    if (profile?.id) return profile;
  }

  if (params.userId) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: params.userId },
      select: { id: true, userId: true },
    });

    if (profile?.id) return profile;
  }

  const email = normalizeEmail(params.email);
  if (!email) return null;

  const profile = await prisma.userProfile.findFirst({
    where: {
      OR: [{ email }, { subscriptionEmail: email }],
    },
    select: { id: true, userId: true },
  });

  return profile ?? null;
}

async function persistHirexaSubscriptionAccess(params: {
  userId?: string | null;
  userProfileId: string;
  planType: HirexaPlanType;
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
  paidAt?: Date;
}) {
  const hasAccess = HIREXA_ACTIVE_STATUSES.has((params.status ?? "").toLowerCase());

  if (params.userId) {
    await upsertUserBillingRecord({
      userId: params.userId,
      productKey: BILLING_PRODUCT_KEYS.HIREXA_CORE,
      planType: params.planType,
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
      subscriptionPurchasedAt: params.paidAt ?? undefined,
      ...(hasAccess ? { lastPaymentReceivedAt: params.paidAt ?? new Date() } : {}),
    });
  }

  await prisma.userProfile.update({
    where: { id: params.userProfileId },
    data: {
      trialSubscriber: params.planType === "trial" ? hasAccess : false,
      monthlySubscriber: params.planType === "monthly" ? hasAccess : false,
      yearlySubscriber: params.planType === "yearly" ? hasAccess : false,
      trialPlanStatus: params.planType === "trial" ? params.status : null,
      monthlyPlanStatus: params.planType === "monthly" ? params.status : null,
      yearlyPlanStatus: params.planType === "yearly" ? params.status : null,
      stripeCustomerId: params.stripeCustomerId ?? null,
      stripeSubscriptionId: params.stripeSubscriptionId ?? null,
      subscriptionCheckedAt: new Date(),
      ...(params.paidAt ? { subscriptionPurchasedAt: params.paidAt } : {}),
      ...(hasAccess ? { lastPaymentReceivedAt: params.paidAt ?? new Date() } : {}),
    },
  });
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json(
      { ok: false, error: "Missing webhook signature or secret" },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripeClient();
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, sig, secret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId =
        typeof session.payment_intent === "string" ? session.payment_intent : null;
      const hirePilotPurchaseType = session.metadata?.hirepilot_purchase_type ?? null;
      const hirePilotUserId = await resolveHirePilotUserId({
        userIdFromMetadata: session.metadata?.hirepilot_user_id ?? null,
        clientReferenceId: session.client_reference_id ?? null,
        customerEmail:
          session.customer_details?.email ??
          session.customer_email ??
          (typeof session.customer === "object" && session.customer && "email" in session.customer
            ? session.customer.email
            : null),
      });
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;

      await prisma.purchase.updateMany({
        where: { stripeSessionId: session.id },
        data: {
          status: "paid",
          stripePaymentId: paymentId,
        },
      });

      if (
        hirePilotPurchaseType === HIREPILOT_PURCHASE_TYPES.SUBSCRIPTION &&
        hirePilotUserId
      ) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        const subscription = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId)
          : null;
        const priceDetails = getStripePriceDetailsFromSubscription(subscription);

        await upsertHirePilotMonthlyBilling({
          userId: hirePilotUserId,
          status: subscription?.status ?? "active",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripeCheckoutSessionId: session.id,
          stripePriceId: priceDetails.priceId,
          stripeProductId: priceDetails.productId,
          currentPeriodStart: priceDetails.currentPeriodStart,
          currentPeriodEnd: priceDetails.currentPeriodEnd,
          cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
          canceledAt: priceDetails.canceledAt,
          trialStart: priceDetails.trialStart,
          trialEnd: priceDetails.trialEnd,
          paidAt: new Date(),
        });
      }

      if (hirePilotPurchaseType === HIREPILOT_PURCHASE_TYPES.CREDIT && hirePilotUserId) {
        const existing = await hasProcessedStripePayment({
          stripeEventId: event.id,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentId,
        });

        if (!existing) {
          const credits = Math.max(
            1,
            Number(session.metadata?.hirepilot_credits ?? "1") || 1
          );
          await incrementHirePilotCredits({
            userId: hirePilotUserId,
            credits,
            stripeCustomerId: customerId,
            stripeCheckoutSessionId: session.id,
            stripePriceId:
              process.env.STRIPE_HIREPILOT_CREDIT_PRICE_ID?.trim() ?? null,
          });
        }
      }

      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceDetails = getStripePriceDetailsFromSubscription(subscription);
        const hirexaProfile = await resolveHirexaProfile({
          userProfileId:
            session.client_reference_id ??
            session.metadata?.hirexa_user_profile_id ??
            subscription.metadata?.hirexa_user_profile_id ??
            null,
          userId:
            session.metadata?.hirexa_user_id ??
            subscription.metadata?.hirexa_user_id ??
            null,
          email:
            session.customer_details?.email ??
            session.customer_email ??
            null,
        });

        if (hirexaProfile?.id) {
          await persistHirexaSubscriptionAccess({
            userId: hirexaProfile.userId ?? null,
            userProfileId: hirexaProfile.id,
            planType: getHirexaPlanType({
              metadataPlan:
                session.metadata?.hirexa_plan ??
                subscription.metadata?.hirexa_plan ??
                null,
              subscription,
            }),
            status: subscription.status ?? session.payment_status ?? "payment approved",
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            stripeCheckoutSessionId: session.id,
            stripePriceId: priceDetails.priceId,
            stripeProductId: priceDetails.productId,
            currentPeriodStart: priceDetails.currentPeriodStart,
            currentPeriodEnd: priceDetails.currentPeriodEnd,
            cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
            canceledAt: priceDetails.canceledAt,
            trialStart: priceDetails.trialStart,
            trialEnd: priceDetails.trialEnd,
            paidAt: new Date(),
          });
        }
      }

      await prisma.stripePayment.upsert({
        where: { stripeEventId: event.id },
        create: {
          stripeEventId: event.id,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentId,
          stripeCustomerId: customerId,
          status: session.payment_status,
          amount: session.amount_total ?? null,
          currency: session.currency ?? null,
          paidAt: new Date(),
        },
        update: {
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentId,
          stripeCustomerId: customerId,
          status: session.payment_status,
          amount: session.amount_total ?? null,
          currency: session.currency ?? null,
          paidAt: new Date(),
        },
      });
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const rawSubscription = (invoice as { subscription?: string | Stripe.Subscription | null })
        .subscription;
      const subscriptionId = typeof rawSubscription === "string" ? rawSubscription : null;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
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
            await upsertHirePilotMonthlyBilling({
              userId: hirePilotUserId,
              status: subscription.status ?? "active",
              stripeCustomerId:
                typeof invoice.customer === "string"
                  ? invoice.customer
                  : invoice.customer?.id ?? null,
              stripeSubscriptionId: subscriptionId,
              stripePriceId: priceDetails.priceId,
              stripeProductId: priceDetails.productId,
              currentPeriodStart: priceDetails.currentPeriodStart,
              currentPeriodEnd: priceDetails.currentPeriodEnd,
              cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
              canceledAt: priceDetails.canceledAt,
              trialStart: priceDetails.trialStart,
              trialEnd: priceDetails.trialEnd,
              paidAt: new Date(
                (invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) * 1000
              ),
            });
          }
        }
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null;
      const priceDetails = getStripePriceDetailsFromSubscription(subscription);
      const hirePilotUserId = subscription.metadata?.hirepilot_user_id ?? null;

      if (
        subscription.metadata?.hirepilot_purchase_type === "subscription" &&
        hirePilotUserId
      ) {
        await upsertHirePilotMonthlyBilling({
          userId: hirePilotUserId,
          status: subscription.status ?? null,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceDetails.priceId,
          stripeProductId: priceDetails.productId,
          currentPeriodStart: priceDetails.currentPeriodStart,
          currentPeriodEnd: priceDetails.currentPeriodEnd,
          cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
          canceledAt: priceDetails.canceledAt,
          trialStart: priceDetails.trialStart,
          trialEnd: priceDetails.trialEnd,
        });
      }

      const hirexaProfile = await resolveHirexaProfile({
        userProfileId: subscription.metadata?.hirexa_user_profile_id ?? null,
        userId: subscription.metadata?.hirexa_user_id ?? null,
      });

      if (hirexaProfile?.id) {
        await persistHirexaSubscriptionAccess({
          userId: hirexaProfile.userId ?? null,
          userProfileId: hirexaProfile.id,
          planType: getHirexaPlanType({
            metadataPlan: subscription.metadata?.hirexa_plan ?? null,
            subscription,
          }),
          status: subscription.status ?? null,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceDetails.priceId,
          stripeProductId: priceDetails.productId,
          currentPeriodStart: priceDetails.currentPeriodStart,
          currentPeriodEnd: priceDetails.currentPeriodEnd,
          cancelAtPeriodEnd: priceDetails.cancelAtPeriodEnd,
          canceledAt: priceDetails.canceledAt,
          trialStart: priceDetails.trialStart,
          trialEnd: priceDetails.trialEnd,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handling failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
