import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/app/lib/prisma";
import { getStripeClient } from "@/app/lib/stripeClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json({ ok: false, error: "Missing webhook signature or secret" }, { status: 400 });
  }

  try {
    const stripe = getStripeClient();
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, sig, secret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
      const hirePilotPurchaseType = session.metadata?.hirepilot_purchase_type ?? null;
      const hirePilotUserId = session.metadata?.hirepilot_user_id ?? null;

      await prisma.purchase.updateMany({
        where: { stripeSessionId: session.id },
        data: {
          status: "paid",
          stripePaymentId: paymentId,
        },
      });

      if (hirePilotPurchaseType === "subscription" && hirePilotUserId) {
        await prisma.userBilling.upsert({
          where: { userId: hirePilotUserId },
          create: { userId: hirePilotUserId, hirePilotUnlimited: true },
          update: { hirePilotUnlimited: true },
        });
      }

      if (hirePilotPurchaseType === "credit" && hirePilotUserId) {
        const existing = await prisma.stripePayment.findUnique({
          where: { stripeEventId: event.id },
          select: { id: true },
        });

        if (!existing) {
          const credits = Math.max(1, Number(session.metadata?.hirepilot_credits ?? "1") || 1);
          await prisma.userBilling.upsert({
            where: { userId: hirePilotUserId },
            create: { userId: hirePilotUserId, hirePilotCredits: credits },
            update: {
              hirePilotCredits: {
                increment: credits,
              },
            },
          });
        }
      }

      await prisma.stripePayment.upsert({
        where: { stripeEventId: event.id },
        create: {
          stripeEventId: event.id,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentId,
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
          status: session.payment_status,
          amount: session.amount_total ?? null,
          currency: session.currency ?? null,
          paidAt: new Date(),
        },
        update: {
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentId,
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
          status: session.payment_status,
          amount: session.amount_total ?? null,
          currency: session.currency ?? null,
          paidAt: new Date(),
        },
      });
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const hirePilotUserId = subscription.metadata?.hirepilot_user_id ?? null;

      if (
        subscription.metadata?.hirepilot_purchase_type === "subscription" &&
        hirePilotUserId
      ) {
        await prisma.userBilling.upsert({
          where: { userId: hirePilotUserId },
          create: {
            userId: hirePilotUserId,
            hirePilotUnlimited: ["active", "trialing", "past_due", "unpaid"].includes(
              subscription.status ?? ""
            ),
          },
          update: {
            hirePilotUnlimited: ["active", "trialing", "past_due", "unpaid"].includes(
              subscription.status ?? ""
            ),
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handling failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
