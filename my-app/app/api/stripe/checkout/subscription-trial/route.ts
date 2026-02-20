import { NextResponse } from "next/server";
import { getStripeClient } from "../../../../lib/stripeClient";

export async function POST(req: Request) {
  const stripeClient = getStripeClient();

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? "").trim();
  const guestId = String(body.guestId ?? "").trim();

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
          "Missing STRIPE_FULL_PRICE_ID. Add your $18.95 recurring Price ID to /Hirexa/my-app/.env.local",
      },
      { status: 500 }
    );
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      { price: trialPriceId, quantity: 1 }, // $1.95 today
      { price: fullPriceId, quantity: 1 },  // recurring
    ],
    allow_promotion_codes: true,
    billing_address_collection: "auto",

    subscription_data: {
      trial_period_days: 14,
      metadata: {
        hirexa_plan: "trial_to_monthly",
        ...(userId ? { userId } : {}),
        ...(guestId ? { guestId } : {}),
      },
    },

    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/plans?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}