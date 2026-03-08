// Hirexa/my-app/app/settings/subscription/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginFooter from "../../components/loginFooter/LoginFooter";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

function formatDate(value?: Date | null) {
  if (!value) return "Not available";
  return value.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

function formatAmount(amount?: number | null, currency?: string | null) {
  if (!amount || !currency) return "Not available";
  const value = amount / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(value);
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "trialing") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (normalized === "canceled" || normalized === "cancelled") {
    return "bg-red-100 text-red-700";
  }
  if (normalized === "past_due") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-gray-100 text-gray-700";
}

function planLabel(planType: string | null) {
  if (planType === "trial") return "Trial";
  if (planType === "monthly") return "Monthly";
  if (planType === "yearly") return "Annual";
  return "Not available";
}

export default async function SubscriptionSettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = (session.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) redirect("/login");

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionPurchasedAt: true,
      lastPaymentReceivedAt: true,
      trialSubscriber: true,
      monthlySubscriber: true,
      yearlySubscriber: true,
      trialPlanStatus: true,
      monthlyPlanStatus: true,
      yearlyPlanStatus: true,
    },
  });

  const lastPayment = profile?.id
    ? await prisma.stripePayment.findFirst({
        where: { userProfileId: profile.id },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        select: { amount: true, currency: true, paidAt: true, createdAt: true },
      })
    : null;

  const planType = profile?.trialSubscriber
    ? "trial"
    : profile?.monthlySubscriber
      ? "monthly"
      : profile?.yearlySubscriber
        ? "yearly"
        : null;

  const rawStatus =
    profile?.trialPlanStatus ??
    profile?.monthlyPlanStatus ??
    profile?.yearlyPlanStatus ??
    null;

  const status = rawStatus ?? (planType ? "active" : "inactive");
  const planDisplay = planType ? planLabel(planType) : "No active subscription";
  const billingCycle = planType ? planLabel(planType) : "Not available";

  const supportEmail = process.env.EMAIL_SUPPORT;

  const hasSubscription =
    Boolean(planType) || Boolean(rawStatus) || Boolean(profile?.stripeSubscriptionId);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white">
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage your Hirexa subscription, billing details, and payment method.
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

          <section className="lg:col-span-9 space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Plan summary
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Overview of your current Hirexa plan.
                  </p>
                </div>
                <span
                  className={[
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                    statusBadge(status),
                  ].join(" ")}
                >
                  {status.replace("_", " ")}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <InfoRow label="Plan" value={planDisplay} />
                <InfoRow label="Billing cycle" value={billingCycle} />
                <InfoRow label="Account ID" value={user.id} />
                <InfoRow label="Email" value={user.email ?? "Not available"} />
              </div>

              {!hasSubscription ? (
                <div className="mt-6 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  No active subscription found.{" "}
                  <Link href="/plans" className="font-semibold underline">
                    Choose a plan
                  </Link>{" "}
                  to unlock Hirexa premium features.
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">
                Billing details
              </h3>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <InfoRow
                  label="Started on"
                  value={formatDate(profile?.subscriptionPurchasedAt)}
                />
                <InfoRow label="Next renewal" value="Not available" />
                <InfoRow
                  label="Last charge"
                  value={
                    lastPayment
                      ? `${formatAmount(
                          lastPayment.amount,
                          lastPayment.currency
                        )} on ${formatDate(
                          lastPayment.paidAt ?? lastPayment.createdAt
                        )}`
                      : "Not available"
                  }
                />
                <InfoRow
                  label="Billing status"
                  value={status.replace("_", " ")}
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">
                Payment method
              </h3>
              <div className="mt-4">
                <InfoRow
                  label="Payment method"
                  value="No payment method on file"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton label="Update payment method" disabled />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">
                Subscription actions
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Manage your subscription, billing history, or cancellation.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton label="Manage subscription" disabled />
                <ActionButton label="View billing history" disabled />
                <ActionButton label="Cancel subscription" disabled />
              </div>
              <p className="mt-3 text-xs text-gray-500">
                These actions will be available once billing is fully connected.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">Support</h3>
              <p className="mt-2 text-sm text-gray-700">
                Need help with billing or want to make changes to your plan?
              </p>
              <p className="mt-2 text-sm text-gray-700">
                Contact Hirexa Support at{" "}
                {supportEmail ? (
                  <Link
                    href={`mailto:${supportEmail}`}
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    {supportEmail}
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

      <LoginFooter></LoginFooter>
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
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
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
