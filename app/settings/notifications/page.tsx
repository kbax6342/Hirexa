// Hirexa/my-app/app/settings/page.tsx
"use client"
import {useState} from "react"
import Link from "next/link";
import { ChevronDownIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import LoginFooter from "../../components/loginFooter/LoginFooter"

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
    "relative inline-flex h-7 w-14 items-center rounded-full border transition-colors duration-200",
    checked
      ? "bg-blue-600 border-blue-600"
      : "bg-white border-gray-300",
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
              <TabLink href="/settings/notifications" active>
                Notifications
              </TabLink>
              <TabLink href="/settings/subscription">
                Subscription
              </TabLink>
            </div>
          </aside>

          {/* Right Panel */}
          <section className="lg:col-span-9">
      <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>

      <div className="mt-8 max-w-2xl">
        <h3 className="text-sm font-semibold text-gray-900">
          Product notifications
        </h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          We&apos;ll inform you about new job matches and applications that need
          your attention so you can be among the first applicants and maximize
          your chances of getting the dream job.
        </p>

        <div className="mt-6 space-y-1">
          <Toggle
            label="Email notifications"
            checked={emailNotifs}
            onChange={setEmailNotifs}
          />
          <Toggle
            label="SMS notifications"
            checked={smsNotifs}
            onChange={setSmsNotifs}
          />
        </div>

        <h3 className="mt-8 text-sm font-semibold text-gray-900">
          Marketing notifications
        </h3>

        <div className="mt-4">
          <Toggle
            label="I am open to receive marketing communications."
            checked={marketing}
            onChange={setMarketing}
          />
        </div>
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
