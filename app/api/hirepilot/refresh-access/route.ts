import { NextResponse } from "next/server";
import Stripe from "stripe";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  getHirePilotBillingStatus,
  HIREPILOT_PURCHASE_TYPES,
  hasProcessedStripePayment,
  incrementHirePilotCredits,
  resolveHirePilotUserId,
  upsertHirePilotMonthlyBilling,
} from "@/app/lib/billing/hirepilotBilling";
import { getStripePriceDetailsFromSubscription } from "@/app/lib/billing/userBilling";
import { getStripeClient } from "@/app/lib/stripeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RefreshAccessBody = {
  sessionId?: string | null;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function getCustomerEmail(session: Stripe.Checkout.Session) {
  return (
    session.customer_details?.email ??
    session.customer_email ??
    (typeof session.customer === "object" && session.customer && "email" in session.customer
      ? session.customer.email
      : null)
  );
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RefreshAccessBody | null;
  const sessionId = normalizeText(body?.sessionId);

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const stripe = getStripeClient();
  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["customer", "subscription"],
  });

  const resolvedUserId = await resolveHirePilotUserId({
    userIdFromMetadata: checkoutSession.metadata?.hirepilot_user_id ?? null,
    clientReferenceId: checkoutSession.client_reference_id ?? null,
    customerEmail: getCustomerEmail(checkoutSession),
  });

  if (!resolvedUserId || resolvedUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const purchaseType =
    checkoutSession.metadata?.hirepilot_purchase_type ??
    checkoutSession.metadata?.purchaseType ??
    null;
  const customerId =
    typeof checkoutSession.customer === "string"
      ? checkoutSession.customer
      : checkoutSession.customer?.id ?? null;
  const paymentIntentId =
    typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent?.id ?? null;

  if (purchaseType === HIREPILOT_PURCHASE_TYPES.SUBSCRIPTION) {
    const subscriptionId =
      typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : checkoutSession.subscription?.id ?? null;
    const subscription = subscriptionId
      ? await stripe.subscriptions.retrieve(subscriptionId)
      : null;
    const priceDetails = getStripePriceDetailsFromSubscription(subscription);

    await upsertHirePilotMonthlyBilling({
      userId,
      status: subscription?.status ?? "active",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripeCheckoutSessionId: checkoutSession.id,
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

  if (purchaseType === HIREPILOT_PURCHASE_TYPES.CREDIT) {
    const alreadyProcessed = await hasProcessedStripePayment({
      stripeCheckoutSessionId: checkoutSession.id,
      stripePaymentIntentId: paymentIntentId,
    });

    if (!alreadyProcessed) {
      const credits = Math.max(
        1,
        Number(checkoutSession.metadata?.hirepilot_credits ?? "1") || 1
      );

      await incrementHirePilotCredits({
        userId,
        credits,
        stripeCustomerId: customerId,
        stripeCheckoutSessionId: checkoutSession.id,
        stripePriceId:
          normalizeText(process.env.STRIPE_HIREPILOT_CREDIT_PRICE_ID) ?? null,
        paidAt: new Date(),
      });

      await prisma.stripePayment.upsert({
        where: { stripeEventId: `checkout_session:${checkoutSession.id}` },
        create: {
          stripeEventId: `checkout_session:${checkoutSession.id}`,
          stripeCheckoutSessionId: checkoutSession.id,
          stripePaymentIntentId: paymentIntentId,
          stripeCustomerId: customerId,
          status: checkoutSession.payment_status,
          amount: checkoutSession.amount_total ?? null,
          currency: checkoutSession.currency ?? null,
          paidAt: new Date(),
          metadata: {
            source: "hirepilot_refresh_access",
            purchaseType,
          },
        },
        update: {
          stripeCheckoutSessionId: checkoutSession.id,
          stripePaymentIntentId: paymentIntentId,
          stripeCustomerId: customerId,
          status: checkoutSession.payment_status,
          amount: checkoutSession.amount_total ?? null,
          currency: checkoutSession.currency ?? null,
          paidAt: new Date(),
          metadata: {
            source: "hirepilot_refresh_access",
            purchaseType,
          },
        },
      });
    }
  }

  const status = await getHirePilotBillingStatus(userId);
  return NextResponse.json(status);
}
