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

      await prisma.purchase.updateMany({
        where: { stripeSessionId: session.id },
        data: {
          status: "paid",
          stripePaymentId: paymentId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handling failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
