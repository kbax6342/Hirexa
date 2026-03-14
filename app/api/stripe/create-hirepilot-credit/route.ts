import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getSiteUrl } from "@/app/lib/site-url";
import { getStripeClient } from "@/app/lib/stripeClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const email = session?.user?.email ?? undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const priceId = process.env.STRIPE_HIREPILOT_CREDIT_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: "Missing STRIPE_HIREPILOT_CREDIT_PRICE_ID." },
      { status: 500 }
    );
  }

  const stripe = getStripeClient();
  const appUrl = getSiteUrl(req);

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    allow_promotion_codes: true,
    client_reference_id: userId,
    metadata: {
      hirepilot_purchase_type: "credit",
      hirepilot_user_id: userId,
      hirepilot_credits: "1",
    },
    success_url: `${appUrl}/hirepilot?checkout=success`,
    cancel_url: `${appUrl}/hirepilot?checkout=canceled`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
