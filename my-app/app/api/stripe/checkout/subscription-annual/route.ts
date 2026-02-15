import { NextResponse } from "next/server";
import { getStripeClient } from "../../../../lib/stripeClient";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

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

  // ✅ Annual checkout: shows $59.40 due today (yearly recurring)
  const checkoutSession = await stripeClient.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: annualPriceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    client_reference_id: userProfileId,
    subscription_data: {
      metadata: {
        hirexa_plan: "annual",
        hirexa_user_id: userId ?? "",
        hirexa_user_profile_id: userProfileId ?? "",
      },
    },
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/plans?canceled=1`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
