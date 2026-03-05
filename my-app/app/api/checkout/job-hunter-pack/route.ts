import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getStripeClient } from "@/app/lib/stripeClient";

export const runtime = "nodejs";

type CheckoutBody = {
  guestId: string;
  job?: {
    id?: string;
    title?: string;
    company?: string;
    companyName?: string;
    url?: string;
    jobUrl?: string;
    description?: string;
    descriptionText?: string;
  };
};

const text = (value: unknown) => String(value ?? "").trim();

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutBody;
    const guestId = text(body.guestId);
    if (!guestId) {
      return NextResponse.json({ ok: false, error: "guestId is required" }, { status: 400 });
    }

    const session = await auth();
    const userId = text(session?.user?.id);

    const jobId = text(body.job?.id);
    const jobTitle = text(body.job?.title);
    const company = text(body.job?.company || body.job?.companyName);
    const jobUrl = text(body.job?.jobUrl || body.job?.url);
    const jobDescription = text(body.job?.description || body.job?.descriptionText);

    const pack = await prisma.jobHunterPack.create({
      data: {
        guestId,
        userId: userId || null,
        jobId: jobId || null,
        jobTitle: jobTitle || null,
        company: company || null,
        jobUrl: jobUrl || null,
        jobDescription: jobDescription || null,
        status: "draft",
      },
    });

    const stripe = getStripeClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const stripePrice = process.env.STRIPE_PRICE_JOB_HUNTER_PACK;

    if (!appUrl || !stripePrice) {
      return NextResponse.json({ ok: false, error: "Missing required env vars" }, { status: 500 });
    }

    const cancelUrl = `${appUrl}/job-hunter-pack${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: stripePrice, quantity: 1 }],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        productKey: "job_hunter_pack",
        guestId,
        userId: userId || "",
        jobId: jobId || "",
        packId: pack.id,
      },
    });

    await prisma.purchase.create({
      data: {
        guestId,
        userId: userId || null,
        status: "pending",
        productKey: "job_hunter_pack",
        stripeSessionId: checkoutSession.id,
        jobHunterPackId: pack.id,
      },
    });

    return NextResponse.json({ ok: true, checkoutUrl: checkoutSession.url });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Checkout failed" }, { status: 500 });
  }
}
