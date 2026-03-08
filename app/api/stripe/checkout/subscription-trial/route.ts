import { NextResponse } from "next/server";
import { getStripeClient } from "../../../../lib/stripeClient";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getSiteUrl } from "@/app/lib/site-url";

export async function POST() {
  const stripeClient = getStripeClient();
  const appUrl = getSiteUrl();

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

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let userProfileId: string | undefined;
  if (userId) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    userProfileId = profile?.id;
  }

  // ✅ Checkout shows $1.95 due today
  const checkoutSession = await stripeClient.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: trialPriceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    client_reference_id: userProfileId,
    subscription_data: {
      metadata: {
        hirexa_intro_price_id: trialPriceId,
        hirexa_full_price_id: fullPriceId,
        hirexa_intro_days: "14",
        hirexa_plan: "trial",
        hirexa_user_id: userId ?? "",
        hirexa_user_profile_id: userProfileId ?? "",
      },
    },
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/plans?canceled=1`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
