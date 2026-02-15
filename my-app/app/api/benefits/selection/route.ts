// my-app/app/api/benefits/selection/route.ts
import { NextResponse } from "next/server";
import { getStripeClient } from "@/app/lib/stripeClient";

export const runtime = "nodejs";

type Body = {
  selectedPlan: "trial" | "annual";
  benefits?: string[];
  source?: string | null;
  jobId?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body?.selectedPlan) {
      return NextResponse.json({ error: "Missing selectedPlan." }, { status: 400 });
    }

    const priceId =
      body.selectedPlan === "trial"
        ? process.env.STRIPE_TRIAL_PRICE_ID
        : process.env.STRIPE_ANNUAL_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        { error: `Missing price id env var for plan "${body.selectedPlan}".` },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plans`,
      allow_promotion_codes: true,
      metadata: {
        selectedPlan: body.selectedPlan,
        source: body.source ?? "",
        jobId: body.jobId ?? "",
      },
    });

    if (!session?.url) {
      return NextResponse.json({ error: "Stripe returned no checkout URL." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("❌ /api/benefits/selection error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error." },
      { status: 500 }
    );
  }
}
