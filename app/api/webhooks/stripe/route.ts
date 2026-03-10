import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripeClient } from "../../../lib/stripeClient";
import { prisma } from "@/app/lib/prisma";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type PlanType = "trial" | "monthly" | "yearly";

async function getUserProfileIdFromSubscription(
  stripeClient: Stripe,
  subscriptionId: string
): Promise<string | null> {
  const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);

  const profileIdFromMetadata = subscription.metadata?.hirexa_user_profile_id;
  if (profileIdFromMetadata) return profileIdFromMetadata;

  const userIdFromMetadata = subscription.metadata?.hirexa_user_id;
  if (!userIdFromMetadata) return null;

  const profile = await prisma.userProfile.findUnique({
    where: { userId: userIdFromMetadata },
    select: { id: true },
  });

  return profile?.id ?? null;
}

async function applyPaymentStatus(
  userProfileId: string,
  planType: PlanType,
  status: "payment approved" | "payed",
  paidAt = new Date(),
  subscriptionId?: string | null,
  customerId?: string | null
) {
  const current = await prisma.userProfile.findUnique({
    where: { id: userProfileId },
    select: { lastPaymentReceivedAt: true },
  });

  const within30Days =
    !!current?.lastPaymentReceivedAt &&
    paidAt.getTime() - current.lastPaymentReceivedAt.getTime() <= THIRTY_DAYS_MS;

  const resolvedStatus = status === "payed" && within30Days ? "payed" : status;

  const data =
    planType === "trial"
      ? {
          trialSubscriber: true,
          trialPlanStatus: resolvedStatus,
          lastPaymentReceivedAt: paidAt,
          subscriptionPurchasedAt: paidAt,
          subscriptionCheckedAt: new Date(),
          stripeSubscriptionId: subscriptionId ?? undefined,
          stripeCustomerId: customerId ?? undefined,
        }
      : planType === "monthly"
        ? {
            monthlySubscriber: true,
            monthlyPlanStatus: resolvedStatus,
            lastPaymentReceivedAt: paidAt,
            subscriptionPurchasedAt: paidAt,
            subscriptionCheckedAt: new Date(),
            stripeSubscriptionId: subscriptionId ?? undefined,
            stripeCustomerId: customerId ?? undefined,
          }
        : {
            yearlySubscriber: true,
            yearlyPlanStatus: resolvedStatus,
            lastPaymentReceivedAt: paidAt,
            subscriptionPurchasedAt: paidAt,
            subscriptionCheckedAt: new Date(),
            stripeSubscriptionId: subscriptionId ?? undefined,
            stripeCustomerId: customerId ?? undefined,
          };

  await prisma.userProfile.update({
    where: { id: userProfileId },
    data,
  });
}

async function saveStripePayment(data: {
  stripeEventId: string;
  userProfileId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  planType?: PlanType | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  paidAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.stripePayment.upsert({
    where: { stripeEventId: data.stripeEventId },
    create: {
      stripeEventId: data.stripeEventId,
      userProfileId: data.userProfileId ?? null,
      stripeCustomerId: data.stripeCustomerId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      stripeCheckoutSessionId: data.stripeCheckoutSessionId ?? null,
      stripeInvoiceId: data.stripeInvoiceId ?? null,
      stripePaymentIntentId: data.stripePaymentIntentId ?? null,
      planType: data.planType ?? null,
      status: data.status ?? null,
      amount: data.amount ?? null,
      currency: data.currency ?? null,
      paidAt: data.paidAt ?? null,
      metadata: (data.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
    },
    update: {
      userProfileId: data.userProfileId ?? null,
      stripeCustomerId: data.stripeCustomerId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      stripeCheckoutSessionId: data.stripeCheckoutSessionId ?? null,
      stripeInvoiceId: data.stripeInvoiceId ?? null,
      stripePaymentIntentId: data.stripePaymentIntentId ?? null,
      planType: data.planType ?? null,
      status: data.status ?? null,
      amount: data.amount ?? null,
      currency: data.currency ?? null,
      paidAt: data.paidAt ?? null,
      metadata: (data.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}

function normalizeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

async function getUserProfileIdByUserId(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  return profile?.id ?? null;
}

async function resolveHirePilotUserId(params: {
  userIdFromMetadata?: string | null;
  customerEmail?: string | null;
}) {
  if (params.userIdFromMetadata) {
    return params.userIdFromMetadata;
  }

  if (!params.customerEmail) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: params.customerEmail },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function syncHirePilotBilling(params: {
  userId: string;
  unlimited?: boolean;
  creditDelta?: number;
}) {
  await prisma.userBilling.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      hirePilotUnlimited: params.unlimited ?? false,
      hirePilotCredits: params.creditDelta ?? 0,
    },
    update: {
      ...(typeof params.unlimited === "boolean"
        ? { hirePilotUnlimited: params.unlimited }
        : {}),
      ...(params.creditDelta
        ? {
            hirePilotCredits: {
              increment: params.creditDelta,
            },
          }
        : {}),
    },
  });
}

async function hasProcessedStripeEvent(eventId: string) {
  const existing = await prisma.stripePayment.findUnique({
    where: { stripeEventId: eventId },
    select: { id: true },
  });

  return Boolean(existing);
}

export async function POST(req: Request) {
  const stripeClient = getStripeClient();

  const secret = process.env.STRIPE_V1_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Missing STRIPE_V1_WEBHOOK_SECRET in /Hirexa/my-app/.env.local" },
      { status: 500 }
    );
  }

  const headerList = await headers();
  const sig = headerList.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(payload, sig, secret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const hirePilotPurchaseType = session.metadata?.hirepilot_purchase_type ?? null;
    const hirePilotUserId = await resolveHirePilotUserId({
      userIdFromMetadata: session.metadata?.hirepilot_user_id ?? null,
      customerEmail:
        session.customer_details?.email ??
        session.customer_email ??
        ((session.customer as Stripe.Customer | null | undefined)?.email ?? null),
    });

    if (hirePilotPurchaseType === "credit" && !(await hasProcessedStripeEvent(event.id))) {
      if (hirePilotUserId) {
        const creditCount = Math.max(1, Number(session.metadata?.hirepilot_credits ?? "1") || 1);
        await syncHirePilotBilling({ userId: hirePilotUserId, creditDelta: creditCount });
      }

      await saveStripePayment({
        stripeEventId: event.id,
        userProfileId: hirePilotUserId ? await getUserProfileIdByUserId(hirePilotUserId) : null,
        stripeCustomerId: normalizeCustomerId(session.customer),
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
        status: session.payment_status,
        amount: session.amount_total ?? null,
        currency: session.currency ?? null,
        paidAt: new Date(),
        metadata: {
          sessionMetadata: session.metadata,
          purchaseType: hirePilotPurchaseType,
        },
      });
    }

    if (hirePilotPurchaseType === "subscription" && hirePilotUserId) {
      await syncHirePilotBilling({ userId: hirePilotUserId, unlimited: true });
    }

    if (session.mode === "subscription" && session.subscription) {
      const subscriptionId = session.subscription as string;
      const sub = await stripeClient.subscriptions.retrieve(subscriptionId);

      const introPriceId =
        session?.metadata?.hirexa_intro_price_id ??
        sub.metadata?.hirexa_intro_price_id ??
        process.env.STRIPE_TRIAL_PRICE_ID;

      const fullPriceId =
        session?.metadata?.hirexa_full_price_id ??
        sub.metadata?.hirexa_full_price_id ??
        process.env.STRIPE_FULL_PRICE_ID;

      const introDaysRaw = session?.metadata?.hirexa_intro_days ?? sub.metadata?.hirexa_intro_days ?? "14";

      const introDays = Math.max(1, Math.min(30, Number(introDaysRaw || 14)));

      const planFromMetadata = session?.metadata?.hirexa_plan ?? sub.metadata?.hirexa_plan;

      const userProfileId =
        session.client_reference_id ??
        session?.metadata?.hirexa_user_profile_id ??
        sub.metadata?.hirexa_user_profile_id ??
        null;

      const planType: PlanType =
        planFromMetadata === "annual"
          ? "yearly"
          : planFromMetadata === "trial"
            ? "trial"
            : "monthly";

      if (userProfileId) {
        await applyPaymentStatus(
          userProfileId,
          planType,
          "payment approved",
          new Date(),
          subscriptionId,
          normalizeCustomerId(session.customer)
        );
      }

      await saveStripePayment({
        stripeEventId: event.id,
        userProfileId,
        stripeCustomerId: normalizeCustomerId(session.customer),
        stripeSubscriptionId: subscriptionId,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
        planType,
        status: session.payment_status,
        amount: session.amount_total ?? null,
        currency: session.currency ?? null,
        paidAt: new Date(),
        metadata: {
          sessionMetadata: session.metadata,
          subscriptionMetadata: sub.metadata,
        },
      });

      if (introPriceId && fullPriceId) {
        await stripeClient.subscriptionSchedules.create({
          from_subscription: subscriptionId,
          phases: [
            {
              items: [{ price: introPriceId, quantity: 1 }],
              iterations: 1,
              start_date: Math.floor(Date.now() / 1000),
              end_date: Math.floor(Date.now() / 1000) + introDays * 24 * 60 * 60,
            },
            {
              items: [{ price: fullPriceId, quantity: 1 }],
            },
          ],
          end_behavior: "release",
        } as any);
      }
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId =
      typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : null;

    if (subscriptionId) {
      const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
      if (subscription.metadata?.hirepilot_purchase_type === "subscription") {
        const hirePilotUserId = await resolveHirePilotUserId({
          userIdFromMetadata: subscription.metadata?.hirepilot_user_id ?? null,
          customerEmail:
            typeof invoice.customer_email === "string" ? invoice.customer_email : null,
        });

        if (hirePilotUserId) {
          await syncHirePilotBilling({ userId: hirePilotUserId, unlimited: true });
        }
      }

      const userProfileId = await getUserProfileIdFromSubscription(stripeClient, subscriptionId);
      const line = invoice.lines.data[0];
      const linePrice = (line as any)?.price;
      const interval = linePrice?.recurring?.interval;
      const paidAt = new Date(
        (invoice.status_transitions.paid_at ?? Math.floor(Date.now() / 1000)) * 1000
      );

      const planType: PlanType = interval === "year" ? "yearly" : "monthly";

      if (userProfileId) {
        await applyPaymentStatus(
          userProfileId,
          planType,
          "payed",
          paidAt,
          subscriptionId,
          normalizeCustomerId(invoice.customer)
        );
      }

      await saveStripePayment({
        stripeEventId: event.id,
        userProfileId,
        stripeCustomerId: normalizeCustomerId(invoice.customer),
        stripeSubscriptionId: subscriptionId,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: (() => {
          const pi = (invoice as any).payment_intent;
          return typeof pi === "string" ? pi : pi?.id;
        })(),
        planType,
        status: invoice.status,
        amount: invoice.amount_paid ?? null,
        currency: invoice.currency ?? null,
        paidAt,
        metadata: {
          invoiceNumber: invoice.number,
          billingReason: invoice.billing_reason,
        },
      });
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;

    if (subscription.metadata?.hirepilot_purchase_type === "subscription") {
      const hirePilotUserId = await resolveHirePilotUserId({
        userIdFromMetadata: subscription.metadata?.hirepilot_user_id ?? null,
      });

      if (hirePilotUserId) {
        await syncHirePilotBilling({
          userId: hirePilotUserId,
          unlimited: ["active", "trialing", "past_due", "unpaid"].includes(
            subscription.status ?? ""
          ),
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
