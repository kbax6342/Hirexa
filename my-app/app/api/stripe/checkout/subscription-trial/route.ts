import { NextResponse } from "next/server";
import { getStripeClient } from "../../../../lib/stripeClient";

export async function POST() {
  const stripeClient = getStripeClient();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_APP_URL in /Hirexa/my-app/.env.local" },
      { status: 500 }
    );
  }

  const trialPriceId = process.env.STRIPE_TRIAL_PRICE_ID;
  if (!trialPriceId) {
    return NextResponse.json(
      {
        error:
          "Missing STRIPE_TRIAL_PRICE_ID. Add your $1.95 Price ID to /Hirexa/my-app/.env.local",
      },
      { status: 500 }
    );
  }

  const fullPriceId = process.env.STRIPE_FULL_PRICE_ID;
  if (!fullPriceId) {
    return NextResponse.json(
      {
        error:
          "Missing STRIPE_FULL_PRICE_ID. Add your $18.95 Price ID to /Hirexa/my-app/.env.local",
      },
      { status: 500 }
    );
  }

  // ✅ Checkout shows $1.95 due today
  const session = await stripeClient.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: trialPriceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: {
      metadata: {
        hirexa_intro_price_id: trialPriceId,
        hirexa_full_price_id: fullPriceId,
        hirexa_intro_days: "14",
      },
    },
    success_url: `${appUrl}/dashboard`,
    cancel_url: `${appUrl}/plans?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
