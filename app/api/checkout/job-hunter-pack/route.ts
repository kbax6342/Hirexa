import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getSiteUrl } from "@/app/lib/site-url";
import { getStripeClient } from "@/app/lib/stripeClient";

export const runtime = "nodejs";

type CheckoutBody = {
  guestId?: string;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutBody;

    const guestId = String(body?.guestId ?? "").trim();
    if (!guestId) {
      return NextResponse.json({ ok: false, error: "guestId is required" }, { status: 400 });
    }

    const session = await auth();
    const userId = String((session?.user as { id?: string } | undefined)?.id ?? "").trim() || null;

    const job = body?.job;
    const jobId = String(job?.id ?? "").trim() || null;
    const jobTitle = String(job?.title ?? "").trim() || null;
    const company = String(job?.company ?? job?.companyName ?? "").trim() || null;
    const jobUrl = String(job?.url ?? job?.jobUrl ?? "").trim() || null;
    const jobDescription = String(job?.description ?? job?.descriptionText ?? "").trim() || null;

    const purchase = await prisma.purchase.create({
      data: {
        productKey: "job_hunter_pack",
        status: "pending",
        guestId,
        userId,
        amount: 2900,
        currency: "usd",
        pack: {
          create: {
            guestId,
            userId,
            status: "draft",
            jobId,
            jobTitle,
            company,
            jobUrl,
            jobDescription,
          },
        },
      },
      include: { pack: true },
    });

    const stripePrice = process.env.STRIPE_PRICE_JOB_HUNTER_PACK;
    const appUrl = getSiteUrl(req);

    if (!stripePrice) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_PRICE_JOB_HUNTER_PACK" },
        { status: 500 }
      );
    }

    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: stripePrice, quantity: 1 }],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/job-hunter-pack${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`,
      metadata: {
        productKey: "job_hunter_pack",
        guestId,
        userId: userId ?? "",
        jobId: jobId ?? "",
        purchaseId: purchase.id,
        packId: purchase.packId,
      },
    });

    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { stripeSessionId: checkoutSession.id },
    });

    return NextResponse.json({ ok: true, checkoutUrl: checkoutSession.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
