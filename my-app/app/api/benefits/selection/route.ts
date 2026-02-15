// my-app/app/api/benefits/selection/route.ts
import { NextResponse } from "next/server";
import { getStripeClient } from "@/app/lib/stripeClient";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type Body = {
  selectedPlan: "trial" | "annual";
  benefits: string[];
  source?: string | null;
  jobId?: string | null;
};

export async function POST(req: Request) {
  try {
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard`,
      cancel_url: `${appUrl}/plans`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout url." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
