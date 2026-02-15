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

  const annualPriceId = process.env.STRIPE_ANNUAL_PRICE_ID;
  if (!annualPriceId) {
    return NextResponse.json(
      {
        error:
          "Missing STRIPE_ANNUAL_PRICE_ID. Add your $59.40/year Price ID to /Hirexa/my-app/.env.local",
      },
      { status: 500 }
    );
  }

  // ✅ Annual checkout: shows $59.40 due today (yearly recurring)
  const session = await stripeClient.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: annualPriceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",

    // Optional metadata for your DB/webhook logic
    subscription_data: {
      metadata: {
        hirexa_plan: "annual",
      },
    },

    success_url: `${appUrl}/dashboard`,
    cancel_url: `${appUrl}/plans?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
