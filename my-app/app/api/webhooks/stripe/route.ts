import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripeClient } from "../../../lib/stripeClient";

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

  let event: any;
  try {
    event = stripeClient.webhooks.constructEvent(payload, sig, secret);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err?.message ?? err}` },
      { status: 400 }
    );
  }

  // This fires when Checkout completes successfully
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Only proceed if this was a subscription checkout
    if (session.mode === "subscription" && session.subscription) {
      const subscriptionId = session.subscription as string;

      // Retrieve subscription so we can reference items cleanly
      const sub = await stripeClient.subscriptions.retrieve(subscriptionId);

      const introPriceId = session?.subscription_data?.metadata?.hirexa_intro_price_id
        ?? sub.metadata?.hirexa_intro_price_id
        ?? process.env.STRIPE_TRIAL_PRICE_ID;

      const fullPriceId = session?.subscription_data?.metadata?.hirexa_full_price_id
        ?? sub.metadata?.hirexa_full_price_id
        ?? process.env.STRIPE_FULL_PRICE_ID;

      const introDaysRaw =
        session?.subscription_data?.metadata?.hirexa_intro_days ??
        sub.metadata?.hirexa_intro_days ??
        "14";

      const introDays = Math.max(1, Math.min(30, Number(introDaysRaw || 14)));

      if (!introPriceId || !fullPriceId) {
        console.error("Missing intro/full price ids for schedule creation");
        return NextResponse.json({ received: true });
      }

      /**
       * Create a schedule from the existing subscription and set phases:
       * - Phase 1: intro price for 14 days
       * - Phase 2: full price ongoing
       */
      await stripeClient.subscriptionSchedules.create({
        from_subscription: subscriptionId,
        phases: [
          {
            items: [{ price: introPriceId, quantity: 1 }],
            iterations: 1, // one billing cycle at intro price
            // To make it exactly 14 days instead of a billing cycle, we use end_date.
            // We'll set start_date to now and end_date to now + 14 days.
            // Stripe accepts timestamps.
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

  return NextResponse.json({ received: true });
}
