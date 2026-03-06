// Hirexa/my-app/app/settings/page.tsx
"use client"
import {useState} from "react"
import Link from "next/link";
import { ChevronDownIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import LoginFooter from "../../components/loginFooter/LoginFooter"
import { PencilIcon } from "@heroicons/react/24/outline";

type Row = { label: string; value: string; actionLabel?: string;
 actionHref?: string };

type ToggleProps = {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
  };

  function Toggle({ label, checked, onChange }: ToggleProps) {
    return (
      <div className="flex items-center gap-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={[
            "relative inline-flex h-7 w-14 items-center rounded-full border transition",
            checked ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-6 w-6 transform rounded-full bg-white shadow transition",
              checked ? "translate-x-7" : "translate-x-0.5",
            ].join(" ")}
          />
          {!checked ? (
            <span className="pointer-events-none absolute right-2 text-sm font-semibold text-gray-500">
              ×
            </span>
          ) : (
            <span className="pointer-events-none absolute left-2 text-sm font-semibold text-white">
              ✓
            </span>
          )}
        </button>
  
        <div className="text-sm text-gray-800">{label}</div>
      </div>
    );
  }

  function KeyValueRow({ label, value, actionLabel, actionHref }: Row) {
    return (
      <div className="grid grid-cols-12 items-center gap-3 py-4">
        <div className="col-span-4 text-sm font-semibold text-gray-900">{label}</div>
        <div className="col-span-6 text-sm text-gray-700">{value}</div>
        <div className="col-span-2 text-right">
          {actionLabel && actionHref ? (
            <Link href={actionHref} className="text-sm font-semibold text-blue-700 hover:underline">
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

export default function NotificationsPage() {
     // default states shown in screenshot:
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [marketing, setMarketing] = useState(true);
  // TODO: replace these with real values from your DB/session
  const accountId = "732604371";
  const email = "k3vin.baxt3r@gmail.com";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white">
    

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-20">
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Left Tabs */}
          <aside className="lg:col-span-3">
            <div className="space-y-2">
              <TabLink href="/settings" >
                Account
              </TabLink>
              <TabLink href="/settings/notifications" >
                Notifications
              </TabLink>
              <TabLink href="/settings/subscription" active>
                Subscription
              </TabLink>
            </div>
          </aside>

          {/* Right Panel */}
          <section className="lg:col-span-9">
      <h2 className="text-2xl font-bold text-gray-900">Subscription</h2>

      {/* Support box */}
      <div className="mt-6 max-w-3xl rounded-lg border border-gray-300 bg-gray-50 p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Need help or want to change your subscription?
            </div>
            <div className="mt-2 text-sm text-gray-700">Contact us at:</div>

            <ul className="mt-3 space-y-2 text-sm text-gray-800">
              <li className="flex items-center gap-2">
                <span className="text-gray-700">•</span>
                <span className="font-semibold">855-695-3235</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-700">•</span>
                <Link
                  href="mailto:customersupport@sonara.ai"
                  className="font-semibold text-blue-700 hover:underline"
                >
                  customersupport@sonara.ai
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:border-l md:border-gray-300 md:pl-6">
            <div className="text-sm font-semibold text-gray-900">Available 7 days a week</div>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li>Monday–Friday: 8am–8pm (CST)</li>
              <li>Saturday: 8am–5pm (CST)</li>
              <li>Sunday: 10am–6pm (CST)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Account ID row */}
      <div className="mt-10 max-w-3xl">
        <KeyValueRow label="Account ID" value={accountId} />
        <Divider />
      </div>

      {/* Subscription details */}
      <div className="mt-10 max-w-3xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Subscription details</h3>
          <Link href="/dashboard/settings/subscription/billing-history" className="text-sm font-semibold text-blue-700 hover:underline">
            View billing history
          </Link>
        </div>

        <div className="mt-4">
          <Divider />
          <KeyValueRow
            label="Status"
            value="Active"
            actionLabel="Cancel subscription"
            actionHref="/dashboard/settings/subscription/cancel"
          />
          <Divider />
          <KeyValueRow label="Billing cycle" value="Trial" />
          <Divider />
          <KeyValueRow label="Billing start date" value="February 01, 2026" />
          <Divider />
          <KeyValueRow label="Last payment" value="February 01, 2026" />
          <Divider />
          <KeyValueRow label="Next payment" value="February 15, 2026" />
          <Divider />
        </div>
      </div>

      {/* Card details */}
      <div className="mt-14 max-w-3xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Card details</h3>

          <Link
            href="/dashboard/settings/subscription/card"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </Link>
        </div>

        <div className="mt-4">
          <Divider />
          <KeyValueRow label="Card type" value="mastercard" />
          <Divider />
          <KeyValueRow label="Card number" value="•••• •••• •••• 1188" />
          <Divider />
          <KeyValueRow label="Expiration date" value="July 2030" />
          <Divider />
        </div>

        <p className="mt-6 text-sm text-gray-600">
          For more information or changes to your subscription, contact us at{" "}
          <Link href="mailto:customersupport@sonara.ai" className="font-semibold text-blue-700 hover:underline">
            customersupport@sonara.ai
          </Link>
          .
        </p>
      </div>
    </section>
        </div>
      </main>
      

      {/* Footer (simple version to match screenshot) */}
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

function SettingsRow({
  label,
  value,
  actionLabel,
  actionHref,
}: {
  label: string;
  value: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 py-4 sm:grid-cols-12">
      <div className="sm:col-span-3 text-sm font-semibold text-gray-900">
        {label}
      </div>

      <div className="sm:col-span-7 text-sm text-gray-700">{value}</div>

      <div className="sm:col-span-2 sm:text-right">
        {actionLabel && actionHref ? (
          <Link
            href={actionHref}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-gray-200" />;
}
