import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripeClient } from "../../../lib/stripeClient";
import { prisma } from "@/app/lib/prisma";
import type Stripe from "stripe";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function resolvePlanName(subscription: Stripe.Subscription) {
  const metadataPlan = subscription.metadata?.hirexa_plan;
  if (metadataPlan) return metadataPlan;

  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  if (interval === "year") return "annual";
  if (interval === "month") return "monthly";

  return "trial";
}

async function syncStripeSubscriptionSnapshot(
  userProfileId: string,
  subscription: Stripe.Subscription
) {
  const firstPrice = subscription.items.data[0]?.price;

  await prisma.userProfile.update({
    where: { id: userProfileId },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePlanName: resolvePlanName(subscription),
      stripePriceCents: firstPrice?.unit_amount ?? null,
      stripePriceInterval: firstPrice?.recurring?.interval ?? null,
      stripeStatus: subscription.status,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}

async function getUserProfileIdFromSubscription(
  stripeClient: Stripe,
  subscriptionId: string
): Promise<string | null> {
  const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);

  const profileIdFromMetadata = subscription.metadata?.hirexa_user_profile_id;
  if (profileIdFromMetadata) return profileIdFromMetadata;

  const userIdFromMetadata = subscription.metadata?.hirexa_user_id;
  if (!userIdFromMetadata) return null;

  const profile = await prisma.userProfile.findUnique({
    where: { userId: userIdFromMetadata },
    select: { id: true },
  });

  return profile?.id ?? null;
}

async function applyPaymentStatus(
  userProfileId: string,
  planType: "trial" | "monthly" | "yearly",
  status: "payment approved" | "payed",
  paidAt = new Date()
) {
  const current = await prisma.userProfile.findUnique({
    where: { id: userProfileId },
    select: { lastPaymentReceivedAt: true },
  });

  const within30Days =
    !!current?.lastPaymentReceivedAt &&
    paidAt.getTime() - current.lastPaymentReceivedAt.getTime() <= THIRTY_DAYS_MS;

  const resolvedStatus = status === "payed" && within30Days ? "payed" : status;

  const data =
    planType === "trial"
      ? {
          trialSubscriber: true,
          trialPlanStatus: resolvedStatus,
          lastPaymentReceivedAt: paidAt,
        }
      : planType === "monthly"
        ? {
            monthlySubscriber: true,
            monthlyPlanStatus: resolvedStatus,
            lastPaymentReceivedAt: paidAt,
          }
        : {
            yearlySubscriber: true,
            yearlyPlanStatus: resolvedStatus,
            lastPaymentReceivedAt: paidAt,
          };

  await prisma.userProfile.update({
    where: { id: userProfileId },
    data,
  });
}

export async function POST(req: Request) {
  const stripeClient = getStripeClient();

  const secret = process.env.STRIPE_V1_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Missing STRIPE_V1_WEBHOOK_SECRET in /Hirexa/my-app/.env.local" },
      { status: 500 }
    );
  }

  const sig = headers().get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(payload, sig, secret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode === "subscription" && session.subscription) {
      const subscriptionId = session.subscription as string;
      const sub = await stripeClient.subscriptions.retrieve(subscriptionId);

      const introPriceId =
        session?.subscription_data?.metadata?.hirexa_intro_price_id ??
        sub.metadata?.hirexa_intro_price_id ??
        process.env.STRIPE_TRIAL_PRICE_ID;

      const fullPriceId =
        session?.subscription_data?.metadata?.hirexa_full_price_id ??
        sub.metadata?.hirexa_full_price_id ??
        process.env.STRIPE_FULL_PRICE_ID;

      const introDaysRaw =
        session?.subscription_data?.metadata?.hirexa_intro_days ??
        sub.metadata?.hirexa_intro_days ??
        "14";

      const introDays = Math.max(1, Math.min(30, Number(introDaysRaw || 14)));

      const planFromMetadata =
        session?.subscription_data?.metadata?.hirexa_plan ?? sub.metadata?.hirexa_plan;

      const userProfileId =
        session.client_reference_id ??
        session?.subscription_data?.metadata?.hirexa_user_profile_id ??
        sub.metadata?.hirexa_user_profile_id ??
        null;

      if (userProfileId) {
        const planType =
          planFromMetadata === "annual"
            ? "yearly"
            : planFromMetadata === "trial"
              ? "trial"
              : "monthly";

        await applyPaymentStatus(userProfileId, planType, "payment approved", new Date());
        await syncStripeSubscriptionSnapshot(userProfileId, sub);
      }

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
        });
      }
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;

    if (subscriptionId) {
      const userProfileId = await getUserProfileIdFromSubscription(stripeClient, subscriptionId);

      if (userProfileId) {
        const sub = await stripeClient.subscriptions.retrieve(subscriptionId);
        const line = invoice.lines.data[0];
        const interval = line?.price?.recurring?.interval;
        const paidAt = new Date((invoice.status_transitions.paid_at ?? Math.floor(Date.now() / 1000)) * 1000);

        const planType = interval === "year" ? "yearly" : "monthly";
        await applyPaymentStatus(userProfileId, planType, "payed", paidAt);
        await syncStripeSubscriptionSnapshot(userProfileId, sub);
      }
    }
  }

  return NextResponse.json({ received: true });
}
