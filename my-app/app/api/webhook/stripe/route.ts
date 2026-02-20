import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
});

function toDateFromUnix(seconds?: number | null) {
  return seconds ? new Date(seconds * 1000) : null;
}

async function updateProfileByMetadata(params: {
  userId?: string | null;
  guestId?: string | null;
  data: any;
}) {
  const { userId, guestId, data } = params;

  if (userId) {
    return prisma.userProfile.update({
      where: { userId },
      data,
    });
  }

  if (guestId) {
    return prisma.userProfile.update({
      where: { guestId },
      data,
    });
  }

  // nothing to attach to
  return null;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json(
      { error: "Missing stripe signature or webhook secret" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // When checkout succeeds (best moment to store customer + sub)
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;

        if (!subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        const userId = (sub.metadata?.userId ?? "") || null;
        const guestId = (sub.metadata?.guestId ?? "") || null;
        const planType = (sub.metadata?.hirexa_plan ?? "") || null;

        const currentPriceId =
          typeof sub.items?.data?.[0]?.price?.id === "string"
            ? sub.items.data[0].price.id
            : null;

        await updateProfileByMetadata({
          userId,
          guestId,
          data: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            stripePriceId: currentPriceId,
            planType,
            planStatus: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            currentPeriodEnd: toDateFromUnix(sub.current_period_end),
            stripeCheckoutSessionId: session.id,
          },
        });

        break;
      }

      // Covers: trial -> active, renewal state changes, cancel_at_period_end changes
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        const userId = (sub.metadata?.userId ?? "") || null;
        const guestId = (sub.metadata?.guestId ?? "") || null;
        const planType = (sub.metadata?.hirexa_plan ?? "") || null;

        const currentPriceId =
          typeof sub.items?.data?.[0]?.price?.id === "string"
            ? sub.items.data[0].price.id
            : null;

        await updateProfileByMetadata({
          userId,
          guestId,
          data: {
            stripeSubscriptionId: sub.id,
            stripePriceId: currentPriceId,
            planType,
            planStatus: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            currentPeriodEnd: toDateFromUnix(sub.current_period_end),
          },
        });

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const userId = (sub.metadata?.userId ?? "") || null;
        const guestId = (sub.metadata?.guestId ?? "") || null;

        await updateProfileByMetadata({
          userId,
          guestId,
          data: {
            planStatus: "canceled",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: null,
          },
        });

        break;
      }

      // Optional but useful:
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof invoice.subscription === "string" ? invoice.subscription : null;

        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);

        const userId = (sub.metadata?.userId ?? "") || null;
        const guestId = (sub.metadata?.guestId ?? "") || null;

        await updateProfileByMetadata({
          userId,
          guestId,
          data: {
            planStatus: sub.status, // often "past_due"
          },
        });

        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}