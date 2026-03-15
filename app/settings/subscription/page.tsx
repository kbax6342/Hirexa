import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import LoginFooter from "../../components/loginFooter/LoginFooter";
import {
  type SubscriptionSettingsProductView,
  getSubscriptionSettingsViewModel,
} from "@/app/lib/billing/subscriptionSettings";
import { BILLING_PRODUCT_KEYS } from "@/app/lib/billing/userBilling";

function formatDate(value?: Date | null) {
  if (!value) return "Not available";
  return value.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
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

function formatBillingCycle(product: SubscriptionSettingsProductView) {
  if (!product.isSubscription) return "One-time purchase";
  if (!product.billingInterval) return "Subscription";
  if (!product.billingIntervalCount || product.billingIntervalCount <= 1) {
    if (product.billingInterval === "month") return "Billed monthly";
    if (product.billingInterval === "year") return "Billed annually";
    if (product.billingInterval === "week") return "Billed weekly";
    if (product.billingInterval === "day") return "Billed daily";
  }

  return `Every ${product.billingIntervalCount} ${product.billingInterval}${
    product.billingIntervalCount === 1 ? "" : "s"
  }`;
}

function formatCardExpiry(month?: number | null, year?: number | null) {
  if (!month || !year) return "Not available";
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function statusBadge(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "active" || normalized === "trialing") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (normalized === "paid" || normalized === "succeeded") {
    return "bg-blue-100 text-blue-800";
  }
  if (normalized === "past due" || normalized === "past_due") {
    return "bg-amber-100 text-amber-700";
  }
  if (normalized === "canceled" || normalized === "cancelled" || normalized === "inactive") {
    return "bg-red-100 text-red-700";
  }
  return "bg-gray-100 text-gray-700";
}

function displayText(value?: string | null) {
  const text = value?.trim();
  return text ? text : "Not available";
}

function productActions(product: SubscriptionSettingsProductView) {
  const links = [
    product.receiptUrl
      ? { label: "Open receipt", href: product.receiptUrl, external: true }
      : null,
    product.hostedInvoiceUrl
      ? { label: "View hosted invoice", href: product.hostedInvoiceUrl, external: true }
      : null,
    product.invoicePdfUrl
      ? { label: "Download invoice PDF", href: product.invoicePdfUrl, external: true }
      : null,
  ].filter((link): link is { label: string; href: string; external: boolean } => Boolean(link));

  if (product.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY) {
    links.push({ label: "Open HirePilot", href: "/hirepilot", external: false });
  }

  if (product.productKey === BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT) {
    links.push({ label: "Use HirePilot", href: "/hirepilot", external: false });
  }

  if (product.productKey === BILLING_PRODUCT_KEYS.HIREXA_CORE) {
    links.push({ label: "View plans", href: "/plans", external: false });
  }

  return links;
}

export default async function SubscriptionSettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = (session.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) redirect("/login");

  const view = await getSubscriptionSettingsViewModel({
    userId,
    sessionEmail: session.user?.email ?? null,
  });

  if (!view) redirect("/login");

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white">
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Review Stripe-backed billing details for each product you have purchased.
        </p>

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
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">
                Product access overview
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <InfoRow label="Account ID" value={view.accountId} />
                <InfoRow label="Email" value={displayText(view.email)} />
                <InfoRow label="Hirexa AI access" value={view.access.hirexa} />
                <InfoRow label="HirePilot access" value={view.access.hirepilot} />
                <InfoRow
                  label="HirePilot credits remaining"
                  value={String(view.access.hirepilotCredits)}
                />
              </div>
            </div>

            {view.products.length > 0 ? (
              view.products.map((product) => {
                const links = productActions(product);
                const lastCharge =
                  product.lastChargeAmount != null && product.lastChargeCurrency
                    ? `${formatAmount(
                        product.lastChargeAmount,
                        product.lastChargeCurrency
                      )} on ${formatDate(product.lastChargeAt)}`
                    : "Not available";

                return (
                  <div
                    key={`${product.productKey}-${product.stripeSubscriptionId ?? product.stripeCheckoutSessionId ?? product.lastActivity?.toISOString() ?? "none"}`}
                    className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                          {product.productLabel}
                          {product.isPrimary ? (
                            <span className="ml-3 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                              Most recent
                            </span>
                          ) : null}
                        </h2>
                        <p className="mt-1 text-sm text-gray-600">
                          {product.accessLabel}
                        </p>
                      </div>
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                          statusBadge(product.status),
                        ].join(" ")}
                      >
                        {product.status}
                      </span>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <InfoRow label="Product" value={product.productLabel} />
                      <InfoRow label="Plan" value={product.planLabel} />
                      <InfoRow
                        label="Price"
                        value={formatAmount(product.priceAmount, product.priceCurrency)}
                      />
                      <InfoRow label="Billing cycle" value={formatBillingCycle(product)} />
                      <InfoRow label="Started on" value={formatDate(product.startedOn)} />
                      <InfoRow
                        label="Current period start"
                        value={formatDate(product.currentPeriodStart)}
                      />
                      <InfoRow
                        label="Current period end"
                        value={formatDate(product.currentPeriodEnd)}
                      />
                      <InfoRow
                        label="Cancel at period end"
                        value={product.cancelAtPeriodEnd ? "Yes" : "No"}
                      />
                    </div>

                    <div className="mt-6 border-t border-gray-100 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Billing details
                      </h3>
                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <InfoRow label="Last charge" value={lastCharge} />
                        <InfoRow
                          label="Latest invoice status"
                          value={displayText(product.latestInvoiceStatus)}
                        />
                        <InfoRow
                          label="Stripe invoice ID"
                          value={displayText(product.stripeInvoiceId)}
                        />
                        <InfoRow
                          label="Stripe customer ID"
                          value={displayText(product.stripeCustomerId)}
                        />
                        <InfoRow
                          label="Stripe subscription ID"
                          value={displayText(product.stripeSubscriptionId)}
                        />
                        <InfoRow
                          label="Checkout session ID"
                          value={displayText(product.stripeCheckoutSessionId)}
                        />
                      </div>
                    </div>

                    <div className="mt-6 border-t border-gray-100 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Payment method
                      </h3>
                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <InfoRow
                          label="Payment method"
                          value={product.paymentMethod.label}
                        />
                        <InfoRow
                          label="Payment method type"
                          value={displayText(product.paymentMethod.type)}
                        />
                        <InfoRow
                          label="Card details"
                          value={
                            product.paymentMethod.brand && product.paymentMethod.last4
                              ? `${product.paymentMethod.brand} ending in ${product.paymentMethod.last4}`
                              : "Not available"
                          }
                        />
                        <InfoRow
                          label="Card expiry"
                          value={formatCardExpiry(
                            product.paymentMethod.expMonth,
                            product.paymentMethod.expYear
                          )}
                        />
                        <InfoRow
                          label="Billing email"
                          value={displayText(product.billingEmail)}
                        />
                      </div>
                    </div>

                    <div className="mt-6 border-t border-gray-100 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Receipts and actions
                      </h3>
                      <div className="mt-4 flex flex-wrap gap-3">
                        {links.length > 0 ? (
                          links.map((link) => (
                            <ActionLink
                              key={`${product.productKey}-${link.label}`}
                              href={link.href}
                              label={link.label}
                              external={link.external}
                            />
                          ))
                        ) : (
                          <ActionButton label="No receipt or invoice links available" disabled />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900">Billing products</h2>
                <p className="mt-2 text-sm text-gray-600">
                  No Stripe-backed billing products were found for this account yet.
                </p>
                <div className="mt-4">
                  <ActionLink href="/plans" label="View plans" />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">Support</h3>
              <p className="mt-2 text-sm text-gray-700">
                Need help with billing or want to make changes to your plan?
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
                    support@hirexa.ai (set EMAIL_SUPPORT)
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
        active
          ? "bg-blue-100 text-blue-900"
          : "text-gray-700 hover:bg-gray-100",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-100 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 break-all text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function ActionButton({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "rounded-md border px-4 py-2 text-sm font-semibold",
        disabled
          ? "cursor-not-allowed border-gray-200 text-gray-400"
          : "border-gray-300 text-gray-700 hover:bg-gray-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ActionLink({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const className =
    "inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
