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

  const annualPriceId = process.env.STRIPE_ANNUAL_PRICE_ID;
  if (!annualPriceId) {
    return NextResponse.json(
      {
        error:
          "Missing STRIPE_ANNUAL_PRICE_ID. Add your yearly Price ID to /Hirexa/my-app/.env.local",
      },
      { status: 500 }
    );
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: annualPriceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",

    subscription_data: {
      metadata: {
        hirexa_plan: "annual",
        ...(userId ? { userId } : {}),
        ...(guestId ? { guestId } : {}),
      },
    },

    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/plans?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}