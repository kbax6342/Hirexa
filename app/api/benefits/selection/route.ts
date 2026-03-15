// my-app/app/api/benefits/selection/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getStripeClient } from "@/app/lib/stripeClient";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { getSiteUrl } from "@/app/lib/site-url";
import { getLatestStripeCustomerIdForUser } from "@/app/lib/billing/userBilling";

export const runtime = "nodejs";

type Body = {
  selectedPlan?: string;
  selectedBenefits?: string[];
  benefits?: string[];
  source?: string | null;
  jobId?: string | null;
};

function normalizeBenefits(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((item) => String(item).trim()).filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const email = session?.user?.email ?? undefined;
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== "object") {
      if (process.env.NODE_ENV !== "production") {
        console.log("benefits/selection invalid body:", body);
      }
      return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const selectedPlan = String(body?.selectedPlan ?? "").trim();
    if (!selectedPlan) {
      return NextResponse.json({ ok: false, error: "Missing selectedPlan." }, { status: 400 });
    }

    const benefits = normalizeBenefits(body.selectedBenefits ?? body.benefits ?? []);
    if (benefits.length === 0) {
      return NextResponse.json({ ok: false, error: "Please select at least one benefit." }, { status: 400 });
    }

    const cookieStore = await cookies();
    let guestId = cookieStore.get("guest_user_id")?.value ?? null;
    const shouldSetGuestCookie = !guestId && !userId;

    if (!guestId && !userId) {
      guestId = `guest_${crypto.randomUUID()}`;
    }

    if (!userId && !guestId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId as string },
      create: userId
        ? {
            userId,
            email: email ?? null,
            subscriptionEmail: email ?? null,
          }
        : {
            guestId: guestId as string,
            email: email ?? null,
            subscriptionEmail: email ?? null,
          },
      update: {},
      select: {
        id: true,
        email: true,
        subscriptionEmail: true,
        stripeCustomerId: true,
      },
    });
    const billingStripeCustomerId = userId
      ? await getLatestStripeCustomerIdForUser(userId)
      : null;

    const existingSelection = await prisma.benefitSelection.findFirst({
      where: { userProfileId: profile.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (existingSelection?.id) {
      await prisma.benefitSelection.update({
        where: { id: existingSelection.id },
        data: {
          selectedPlan,
          benefits,
          guestId: guestId ?? undefined,
        },
      });
    } else {
      await prisma.benefitSelection.create({
        data: {
          userProfileId: profile.id,
          guestId: guestId ?? undefined,
          selectedPlan,
          benefits,
        },
      });
    }

    if (selectedPlan === "custom-benefits") {
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
          questionsCompleted: true,
        },
        select: { id: true },
      });
    }

    const baseResponse = NextResponse.json({ ok: true });
    if (shouldSetGuestCookie && guestId) {
      baseResponse.cookies.set("guest_user_id", guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    if (selectedPlan !== "trial" && selectedPlan !== "annual") {
      return baseResponse;
    }

    const priceId =
      selectedPlan === "trial"
        ? process.env.STRIPE_TRIAL_PRICE_ID
        : process.env.STRIPE_ANNUAL_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: `Missing Stripe price id for plan "${selectedPlan}".` },
        { status: 500 }
      );
    }

    const appUrl = getSiteUrl(req);

    const stripe = getStripeClient();

    const hirexaPlan = selectedPlan === "annual" ? "annual" : "trial";
    const checkoutMetadata = {
      hirexa_plan: hirexaPlan,
      hirexa_user_id: userId ?? "",
      hirexa_user_profile_id: profile.id,
      hirexa_guest_id: guestId ?? "",
    };

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(billingStripeCustomerId || profile.stripeCustomerId
        ? { customer: billingStripeCustomerId ?? profile.stripeCustomerId! }
        : {
            customer_email:
              profile.subscriptionEmail ?? profile.email ?? email ?? undefined,
          }),
      client_reference_id: profile.id,
      metadata: checkoutMetadata,
      subscription_data: {
        metadata: checkoutMetadata,
      },
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plans`,
      allow_promotion_codes: true,
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ ok: false, error: "Stripe did not return a checkout url." }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true, url: checkoutSession.url });
    if (shouldSetGuestCookie && guestId) {
      response.cookies.set("guest_user_id", guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session.";

    if (process.env.NODE_ENV !== "production") {
      console.error("benefits/selection error:", error);
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
