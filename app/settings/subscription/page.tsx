import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import LoginFooter from "@/app/components/loginFooter/LoginFooter";
import ManageBillingButton from "@/app/components/settings/ManageBillingButton";
import CancelSubscriptionModal from "@/app/components/settings/CancelSubscriptionModal";
import {
  type SubscriptionSettingsProductView,
  getSubscriptionSettingsViewModel,
} from "@/app/lib/billing/subscriptionSettings";
import { BILLING_PRODUCT_KEYS } from "@/app/lib/billing/userBilling";
import { getManagedSubscriptionTargets } from "@/app/lib/billing/subscriptionManagement";
import { getHirePilotCreditSummary } from "@/app/lib/hirepilot/credits";

type CreditSummary = Awaited<ReturnType<typeof getHirePilotCreditSummary>>;

const EMPTY_CREDIT_SUMMARY: CreditSummary = {
  totalAvailable: 0,
  monthlyCredits: 0,
  rolloverCredits: 0,
  starterCredits: 0,
  starterCreditsGranted: false,
  purchasedCredits: 0,
  nextMonthlyResetAt: null,
  earliestPurchasedExpiryAt: null,
  lowBalance: false,
  hasExpiringCredits: false,
  expiringSoon: [],
  recentUsage: [],
} as const;

function formatDate(value?: Date | null) {
  if (!value) return "Not available";
  return value.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(amount?: number | null, currency?: string | null) {
  if (typeof amount !== "number" || !currency) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function displayText(value?: string | null) {
  const text = value?.trim();
  return text ? text : "Not available";
}

function statusPill(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === "active" || normalized === "trialing") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (normalized.includes("credit")) {
    return "bg-sky-100 text-sky-800";
  }

  if (normalized === "inactive" || normalized === "canceled" || normalized === "cancelled") {
    return "bg-rose-100 text-rose-800";
  }

  return "bg-slate-100 text-slate-700";
}

function pickProduct(
  products: SubscriptionSettingsProductView[],
  productKey: string
) {
  return products.find((product) => product.productKey === productKey) ?? null;
}

function getProductLinks(product: SubscriptionSettingsProductView | null) {
  if (!product) return [];

  return [
    product.receiptUrl
      ? { label: "Open receipt", href: product.receiptUrl, external: true }
      : null,
    product.hostedInvoiceUrl
      ? { label: "View invoice", href: product.hostedInvoiceUrl, external: true }
      : null,
    product.invoicePdfUrl
      ? { label: "Download invoice PDF", href: product.invoicePdfUrl, external: true }
      : null,
  ].filter((item): item is { label: string; href: string; external: boolean } => Boolean(item));
}

function renderLinks(links: Array<{ label: string; href: string; external?: boolean }>) {
  if (links.length === 0) {
    return <p className="text-sm text-slate-500">No receipt or invoice links are available yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {links.map((link) =>
        link.external ? (
          <a
            key={`${link.label}-${link.href}`}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {link.label}
          </a>
        ) : (
          <Link
            key={`${link.label}-${link.href}`}
            href={link.href}
            className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {link.label}
          </Link>
        )
      )}
    </div>
  );
}

function DetailGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-md border border-gray-100 bg-white px-4 py-3"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {item.label}
          </div>
          <div className="mt-1 break-words text-sm font-semibold text-gray-900">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function SubscriptionSettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = (session.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) redirect("/login");

  const [view, cancelableTargets] = await Promise.all([
    getSubscriptionSettingsViewModel({
      userId,
      sessionEmail: session.user?.email ?? null,
    }),
    getManagedSubscriptionTargets(userId),
  ]);

  let creditSummary = EMPTY_CREDIT_SUMMARY;
  let hirePilotCreditsUnavailable = false;

  try {
    creditSummary = await getHirePilotCreditSummary(userId);
  } catch (error) {
    hirePilotCreditsUnavailable = true;
    console.error("[settings/subscription] failed to load HirePilot credits", error);
  }

  if (!view) redirect("/login");

  const hirexaProduct = pickProduct(view.products, BILLING_PRODUCT_KEYS.HIREXA_CORE);
  const hirepilotSubscription = pickProduct(
    view.products,
    BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY
  );
  const hirexaLinks = getProductLinks(hirexaProduct);
  const hirepilotCreditsProduct = pickProduct(
    view.products,
    BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT
  );
  const cancelableKeys = new Set(cancelableTargets.map((target) => target.productKey));
  const hirepilotLinks = [
    ...getProductLinks(hirepilotSubscription),
    ...getProductLinks(hirepilotCreditsProduct),
  ].filter(
    (link, index, links) =>
      links.findIndex((item) => item.label === link.label && item.href === link.href) === index
  );

  const hirepilotStatus = hirepilotSubscription
    ? hirepilotSubscription.status
    : creditSummary.totalAvailable > 0
      ? "Credits available"
      : "Inactive";
  const hirePilotUnlimitedAccess = view.access.hirepilot === "Unlimited access active";
  const hasTrackedHirePilotCredits =
    creditSummary.totalAvailable > 0 ||
    creditSummary.monthlyCredits > 0 ||
    creditSummary.rolloverCredits > 0 ||
    creditSummary.starterCredits > 0 ||
    creditSummary.purchasedCredits > 0;
  const hirepilotCanCancel = cancelableKeys.has(BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY);
  const hirepilotPlanLabel = hirepilotSubscription
    ? hirepilotSubscription.planLabel
    : creditSummary.totalAvailable > 0
      ? "Credits only"
      : "No active HirePilot plan";
  const hirepilotPrimaryPayment =
    hirepilotSubscription?.lastChargeAmount != null && hirepilotSubscription.lastChargeCurrency
      ? `${formatAmount(
          hirepilotSubscription.lastChargeAmount,
          hirepilotSubscription.lastChargeCurrency
        )} on ${formatDate(hirepilotSubscription.lastChargeAt)}`
      : hirepilotCreditsProduct?.lastChargeAmount != null &&
          hirepilotCreditsProduct.lastChargeCurrency
        ? `${formatAmount(
            hirepilotCreditsProduct.lastChargeAmount,
            hirepilotCreditsProduct.lastChargeCurrency
          )} on ${formatDate(hirepilotCreditsProduct.lastChargeAt)}`
        : "Not available";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white">
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Review product status and understand how HirePilot credits are currently available on
              your account.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
          <aside className="lg:col-span-3">
            <div className="space-y-2">
              <TabLink href="/settings">Account</TabLink>
              <TabLink href="/settings/notifications">Notifications</TabLink>
              <TabLink href="/settings/subscription" active>
                Subscription
              </TabLink>
            </div>
          </aside>

          <section className="space-y-6 lg:col-span-9">
            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Hirexa AI</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Core Hirexa AI subscription and billing status.
                  </p>
                </div>
                <span
                  className={[
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                    statusPill(hirexaProduct?.status ?? view.access.hirexa),
                  ].join(" ")}
                >
                  {hirexaProduct?.status ?? view.access.hirexa}
                </span>
              </div>

              <div className="mt-6">
                <DetailGrid
                  items={[
                    { label: "Current status", value: hirexaProduct?.status ?? view.access.hirexa },
                    { label: "Plan", value: hirexaProduct?.planLabel ?? "No active Hirexa AI plan" },
                    {
                      label: "Renewal / end date",
                      value: formatDate(hirexaProduct?.currentPeriodEnd),
                    },
                    {
                      label: "Last payment",
                      value:
                        hirexaProduct?.lastChargeAmount != null &&
                        hirexaProduct.lastChargeCurrency
                          ? `${formatAmount(
                              hirexaProduct.lastChargeAmount,
                              hirexaProduct.lastChargeCurrency
                            )} on ${formatDate(hirexaProduct.lastChargeAt)}`
                          : "Not available",
                    },
                    {
                      label: "Next payment",
                      value: hirexaProduct?.cancelAtPeriodEnd
                        ? "Auto-renew is off"
                        : formatDate(hirexaProduct?.currentPeriodEnd),
                    },
                    {
                      label: "Stripe subscription",
                      value: displayText(hirexaProduct?.stripeSubscriptionId),
                    },
                  ]}
                />
              </div>

              <div className="mt-6 border-t border-gray-100 pt-6">
                <h3 className="text-lg font-semibold text-gray-900">Receipts and invoice links</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Open invoice links, manage billing, and control auto-renew for your Hirexa AI
                  subscription from here.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {hirexaLinks.length > 0 ? (
                    hirexaLinks.map((link) =>
                      link.external ? (
                        <a
                          key={`${link.label}-${link.href}`}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          key={`${link.label}-${link.href}`}
                          href={link.href}
                          className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          {link.label}
                        </Link>
                      )
                    )
                  ) : (
                    <p className="text-sm text-slate-500">
                      No receipt or invoice links are available yet.
                    </p>
                  )}
                  <ManageBillingButton className="rounded-md px-4 py-2" />
                  {cancelableKeys.has(BILLING_PRODUCT_KEYS.HIREXA_CORE) ? (
                    <CancelSubscriptionModal
                      productKey={BILLING_PRODUCT_KEYS.HIREXA_CORE}
                      productLabel="Hirexa AI"
                      currentPeriodEnd={hirexaProduct?.currentPeriodEnd?.toISOString() ?? null}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">
                      No active recurring Hirexa AI subscription is available to cancel.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">HirePilot</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Interview billing, recurring plan state, and available credits.
                  </p>
                </div>
                <span
                  className={[
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                    statusPill(hirepilotStatus),
                  ].join(" ")}
                >
                  {hirepilotStatus}
                </span>
              </div>

              <div className="mt-6">
                <DetailGrid
                  items={[
                    { label: "Current status", value: hirepilotStatus },
                    { label: "Plan", value: hirepilotPlanLabel },
                    {
                      label: "Renewal / end date",
                      value: formatDate(hirepilotSubscription?.currentPeriodEnd),
                    },
                    { label: "Last payment", value: hirepilotPrimaryPayment },
                    {
                      label: "Next payment",
                      value: hirepilotSubscription?.cancelAtPeriodEnd
                        ? "Auto-renew is off"
                        : formatDate(hirepilotSubscription?.currentPeriodEnd),
                    },
                    {
                      label: "Stripe subscription",
                      value: displayText(hirepilotSubscription?.stripeSubscriptionId),
                    },
                  ]}
                />
              </div>

              <div className="mt-6 rounded-lg border border-sky-100 bg-sky-50/70 p-5">
                <h3 className="text-lg font-semibold text-sky-950">HirePilot credits</h3>
                {hirePilotCreditsUnavailable ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    HirePilot credits are temporarily unavailable in this environment. Check the
                    Prisma credits setup and regenerate the Prisma client, then reload the app.
                  </div>
                ) : null}
                {hirePilotUnlimitedAccess && !hasTrackedHirePilotCredits ? (
                  <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    Unlimited HirePilot subscription active. Live listening is available without
                    monthly or purchased credits.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <CreditStat label="Total available" value={String(creditSummary.totalAvailable)} />
                      <CreditStat label="Monthly credits" value={String(creditSummary.monthlyCredits)} />
                      <CreditStat label="Rollover credits" value={String(creditSummary.rolloverCredits)} />
                      <CreditStat label="Starter credits" value={String(creditSummary.starterCredits)} />
                      <CreditStat label="Purchased credits" value={String(creditSummary.purchasedCredits)} />
                      <CreditStat
                        label="Next monthly reset"
                        value={formatDate(creditSummary.nextMonthlyResetAt)}
                      />
                      <CreditStat
                        label="Earliest purchased expiry"
                        value={formatDate(creditSummary.earliestPurchasedExpiryAt)}
                      />
                    </div>

                    {creditSummary.lowBalance || creditSummary.hasExpiringCredits ? (
                      <div className="mt-4 space-y-2">
                        {creditSummary.lowBalance ? (
                          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Your HirePilot balance is getting low. Review your remaining credits before
                            starting another live session.
                          </div>
                        ) : null}
                        {creditSummary.hasExpiringCredits ? (
                          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                            Some HirePilot credits are expiring soon. Use older credits first to avoid
                            losing them.
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-6">
                      <h4 className="text-sm font-semibold text-slate-900">Recent usage</h4>
                      {creditSummary.recentUsage.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {creditSummary.recentUsage.map((usage) => (
                            <div
                              key={usage.id}
                              className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                            >
                              <span>
                                {usage.amount} credit{usage.amount === 1 ? "" : "s"} used for{" "}
                                {usage.sourceType?.replace(/_/g, " ") ?? "HirePilot usage"}
                              </span>
                              <span className="text-xs text-slate-500">
                                {formatDate(usage.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">
                          No HirePilot credit usage has been recorded yet.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/hirepilot/app"
                  className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Open HirePilot
                </Link>
              </div>

              <div className="mt-6 border-t border-gray-100 pt-6">
                <h3 className="text-lg font-semibold text-gray-900">Receipts and invoice links</h3>
                <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0 flex-1">{renderLinks(hirepilotLinks)}</div>
                  <div className="flex justify-start md:justify-end">
                    {hirepilotCanCancel ? (
                      <CancelSubscriptionModal
                        productKey={BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY}
                        productLabel="HirePilot"
                        currentPeriodEnd={hirepilotSubscription?.currentPeriodEnd?.toISOString() ?? null}
                        purchasedCreditsRemaining={creditSummary.purchasedCredits}
                      />
                    ) : creditSummary.totalAvailable > 0 ? (
                      <p className="text-sm text-slate-500 md:text-right">
                        You currently have HirePilot credits only. There is no recurring HirePilot
                        subscription to cancel.
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500 md:text-right">
                        No active recurring HirePilot subscription is available to cancel.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">Billing support</h3>
              <p className="mt-2 text-sm text-gray-700">
                Need help with payment issues, billing changes, or a cancellation question?
              </p>
              <p className="mt-2 text-sm text-gray-700">
                Contact Hirexa Support at{" "}
                {view.supportEmail ? (
                  <Link
                    href={`mailto:${view.supportEmail}`}
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    {view.supportEmail}
                  </Link>
                ) : (
                  <span className="font-semibold text-gray-900">
                    support@hirexa-ai.com (set EMAIL_SUPPORT)
                  </span>
                )}
                .
              </p>
            </div>
          </section>
        </div>
      </main>

      <LoginFooter />
    </div>
  );
}

function CreditStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-sky-100 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "block w-full rounded-md px-4 py-2 text-sm font-medium",
        active ? "bg-blue-100 text-blue-900" : "text-gray-700 hover:bg-gray-100",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
