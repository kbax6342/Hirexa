import Link from "next/link";
import type Stripe from "stripe";
import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  CreditCardIcon,
  HashtagIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { auth } from "@/auth";
import { getHirexaAccessForUser } from "@/app/lib/billing/getHirexaAccess";
import { getStripeClient } from "@/app/lib/stripeClient";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type BillingSuccessSummary = {
  sessionId: string | null;
  planName: string;
  billingFrequency: string;
  price: string;
  orderNumber: string;
  date: string;
  paymentMethod: string;
  receiptUrl: string | null;
  paymentReady: boolean;
};

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function formatCurrency(amount?: number | null, currency?: string | null) {
  if (typeof amount !== "number" || !currency) return "Pending confirmation";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(value?: number | Date | null) {
  if (!value) return "Pending confirmation";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending confirmation";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatInterval(
  interval?: Stripe.Price.Recurring.Interval | null,
  intervalCount?: number | null
) {
  if (!interval) return "Subscription";
  if (!intervalCount || intervalCount <= 1) {
    if (interval === "month") return "Billed monthly";
    if (interval === "year") return "Billed annually";
    if (interval === "week") return "Billed weekly";
    if (interval === "day") return "Billed daily";
  }

  return `Every ${intervalCount} ${interval}${intervalCount === 1 ? "" : "s"}`;
}

function humanizePlan(planKey?: string | null) {
  if (!planKey) return "Hirexa AI Subscription";

  const normalized = planKey.trim().toLowerCase();
  if (normalized === "trial") return "Hirexa AI Intro Plan";
  if (normalized === "annual" || normalized === "yearly") {
    return "Hirexa AI Annual Plan";
  }
  if (normalized === "monthly") return "Hirexa AI Monthly Plan";

  return "Hirexa AI Subscription";
}

function summarizePaymentMethod(
  paymentMethod: Stripe.Subscription["default_payment_method"] | null | undefined
) {
  if (!paymentMethod || typeof paymentMethod === "string") {
    return "Processed securely by Stripe";
  }

  if (paymentMethod.type === "card" && paymentMethod.card) {
    const brand =
      paymentMethod.card.brand.charAt(0).toUpperCase() +
      paymentMethod.card.brand.slice(1);
    return `${brand} ending in ${paymentMethod.card.last4}`;
  }

  return "Processed securely by Stripe";
}

async function getBillingSummary(
  sessionId: string
): Promise<BillingSuccessSummary | null> {
  try {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: [
        "subscription",
        "subscription.default_payment_method",
        "subscription.latest_invoice",
      ],
    });

    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 1,
      expand: ["data.price.product"],
    });

    const lineItem = lineItems.data[0];
    const price = lineItem?.price ?? null;
    const product =
      price?.product && typeof price.product !== "string" ? price.product : null;
    const subscription =
      session.subscription && typeof session.subscription !== "string"
        ? session.subscription
        : null;
    const invoice =
      subscription?.latest_invoice &&
      typeof subscription.latest_invoice !== "string"
        ? subscription.latest_invoice
        : null;

    const metadataPlan =
      session.metadata?.hirexa_plan ??
      subscription?.metadata?.hirexa_plan ??
      null;

    const planName =
      (product && !("deleted" in product && product.deleted) ? product.name : null) ??
      lineItem?.description ??
      humanizePlan(metadataPlan);

    const billingFrequency =
      formatInterval(price?.recurring?.interval, price?.recurring?.interval_count) ??
      "Subscription";

    return {
      sessionId: session.id,
      planName,
      billingFrequency,
      price: formatCurrency(session.amount_total, session.currency),
      orderNumber: session.id,
      date: formatDate(session.created * 1000),
      paymentMethod: summarizePaymentMethod(
        subscription?.default_payment_method ?? null
      ),
      receiptUrl: invoice?.invoice_pdf ?? invoice?.hosted_invoice_url ?? null,
      paymentReady:
        session.payment_status === "paid" ||
        session.payment_status === "no_payment_required",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Stripe lookup failure";
    console.warn("[BILLING_SUCCESS] session lookup failed", {
      sessionId,
      error: message,
    });
    return null;
  }
}

export default async function BillingSuccessPage({ searchParams }: Props) {
  const params = await searchParams;
  const sessionId = readParam(params.session_id);
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (userId) {
    try {
      await getHirexaAccessForUser({
        userId,
        sessionEmail: session?.user?.email ?? null,
        forceSync: true,
      });
    } catch (error) {
      console.warn("[BILLING_SUCCESS] access sync failed", {
        userId,
        sessionId: sessionId || null,
        error: error instanceof Error ? error.message : "Unknown billing sync error",
      });
    }
  }

  const summary = sessionId ? await getBillingSummary(sessionId) : null;

  const display = summary ?? {
    sessionId: sessionId || null,
    planName: "Hirexa AI Subscription",
    billingFrequency: "Preparing your billing details",
    price: "Pending confirmation",
    orderNumber: sessionId || "Available in billing history",
    date: "Pending confirmation",
    paymentMethod: "Processed securely by Stripe",
    receiptUrl: null,
    paymentReady: false,
  };

  const supportingCopy = display.paymentReady
    ? "Thank you for subscribing to Hirexa AI. Your account has been upgraded."
    : "Thank you for subscribing to Hirexa AI. We’re preparing your access now.";

  const summaryRows = [
    {
      label: "Plan",
      value: display.planName,
      icon: SparklesIcon,
    },
    {
      label: "Billing frequency",
      value: display.billingFrequency,
      icon: CreditCardIcon,
    },
    {
      label: "Price",
      value: display.price,
      icon: CreditCardIcon,
    },
    {
      label: "Order number",
      value: display.orderNumber,
      icon: HashtagIcon,
    },
    {
      label: "Date",
      value: display.date,
      icon: CalendarDaysIcon,
    },
    {
      label: "Payment method",
      value: display.paymentMethod,
      icon: CreditCardIcon,
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] px-4 pb-16 pt-28 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-24 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute right-[-8rem] top-1/3 h-[24rem] w-[24rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute left-[-8rem] bottom-0 h-[20rem] w-[20rem] rounded-full bg-blue-700/15 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-7rem)] max-w-4xl items-center justify-center">
        <Card className="w-full overflow-hidden rounded-[28px] border border-white/12 bg-white/8 shadow-[0_24px_80px_rgba(5,8,22,0.55)] backdrop-blur-2xl">
          <CardContent className="p-0">
            <div className="border-b border-white/10 px-6 py-5 sm:px-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-blue-300/25">
                    <span className="text-lg font-bold text-blue-100">H</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tracking-[0.22em] text-blue-200/80">
                      HIREXA AI
                    </div>
                    <div className="text-xs text-slate-300">
                      Billing confirmation
                    </div>
                  </div>
                </div>

                <Button
                  asChild
                  variant="outline"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              </div>
            </div>

            <div className="px-6 py-10 sm:px-8 sm:py-12">
              <div className="mx-auto max-w-2xl text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-blue-300/20 bg-blue-500/15 shadow-[0_0_0_10px_rgba(59,130,246,0.08)]">
                  <CheckCircleIcon className="h-10 w-10 text-blue-200" />
                </div>

                <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Payment Successful!
                </h1>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  {supportingCopy}
                </p>
              </div>

              <div className="mx-auto mt-10 max-w-2xl">
                <div className="rounded-[24px] border border-white/10 bg-slate-950/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Order summary
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Your billing details for this subscription.
                      </p>
                    </div>

                    <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
                      {display.paymentReady ? "Confirmed" : "Pending"}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {summaryRows.map((row) => (
                      <div
                        key={row.label}
                        className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          <row.icon className="h-4 w-4 text-blue-300" />
                          {row.label}
                        </div>
                        <div className="mt-2 text-sm font-medium leading-6 text-white sm:text-[15px]">
                          {row.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {display.sessionId ? (
                    <p className="mt-5 text-xs text-slate-500">
                      Session reference: {display.sessionId}
                    </p>
                  ) : null}
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="flex-1 rounded-xl bg-blue-500 text-white shadow-[0_18px_40px_rgba(59,130,246,0.28)] hover:bg-blue-400"
                  >
                    <Link href="/dashboard">
                      Go to Dashboard
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                  </Button>

                  {display.receiptUrl ? (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="flex-1 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                      <a
                        href={display.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download Receipt
                        <ArrowDownTrayIcon className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="flex-1 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                      <Link href="/settings/subscription">View Billing</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
