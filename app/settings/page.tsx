// Hirexa/my-app/app/settings/page.tsx
import Link from "next/link";
import { ChevronDownIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import LoginFooter from "../components/loginFooter/LoginFooter"

export default function SettingsPage() {
  // TODO: replace these with real values from your DB/session
  const accountId = "732604371";
  const email = "k3vin.baxt3r@gmail.com";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white">
    

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Left Tabs */}
          <aside className="lg:col-span-3">
            <div className="space-y-2">
              <TabLink href="/dashboard/settings" active>
                Account
              </TabLink>
              <TabLink href="/settings/notifications">
                Notifications
              </TabLink>
              <TabLink href="/settings/subscription">
                Subscription
              </TabLink>
            </div>
          </aside>

          {/* Right Panel */}
          <section className="lg:col-span-9">
            <h2 className="text-2xl font-bold text-gray-900">Account</h2>

            <div className="mt-8 border-b border-gray-200 pb-6">
              <SettingsRow label="Account ID" value={accountId} />
              <Divider />
              <SettingsRow
                label="Email Address"
                value={email}
                actionLabel="Change"
                actionHref="/dashboard/settings/account/email"
              />
              <Divider />
              <SettingsRow
                label="Password"
                value="••••••"
                actionLabel="Change"
                actionHref="/dashboard/settings/account/password"
              />
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
