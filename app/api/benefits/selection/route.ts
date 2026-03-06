// my-app/app/api/benefits/selection/route.ts
import { NextResponse } from "next/server";
import { getStripeClient } from "@/app/lib/stripeClient";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";

export const runtime = "nodejs";

type Body = {
  selectedPlan: "trial" | "annual";
  benefits: string[];
  source?: string | null;
  jobId?: string | null;
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    const email = session?.user?.email ?? undefined;

    const body = (await req.json()) as Body;

    const selectedPlan = body?.selectedPlan;
    if (!selectedPlan) {
      return NextResponse.json({ error: "Missing selectedPlan." }, { status: 400 });
    }

    // ✅ pick correct Stripe Price ID by plan
    const priceId =
      selectedPlan === "trial"
        ? process.env.STRIPE_TRIAL_PRICE_ID
        : process.env.STRIPE_ANNUAL_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        { error: `Missing Stripe price id for plan "${selectedPlan}".` },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_APP_URL in my-app/.env.local" },
        { status: 500 }
      );
    }

    // ✅ OPTIONAL: save selection to DB (customize to your schema)
    // If you don’t have a model for this, you can remove this block.
    await prisma.planSelection.create({
      data: {
        plan: selectedPlan,
        perks: body.benefits ?? [],
        source: body.source ?? null,
        jobId: body.jobId ?? null,
      },
    });

    // ✅ Create checkout session
    const stripe = getStripeClient();

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plans`,
      allow_promotion_codes: true,
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout url." }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
