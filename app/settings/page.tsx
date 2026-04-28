// Hirexa/my-app/app/settings/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { prisma } from "../lib/prisma";
import LoginFooter from "../components/loginFooter/LoginFooter";
import DeleteAccountModal from "../components/settings/DeleteAccountModal";
import TwoFactorSettings from "../components/settings/TwoFactorSettings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = (session.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      twoFactorEnabled: true,
      userProfile: { select: { id: true } },
      twoFactorBackupCodes: {
        where: { usedAt: null },
        select: { id: true },
      },
    },
  });

  if (!user) redirect("/login");

  const accountId = user.id;
  const email = user.email ?? "Not provided";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white">
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
          <aside className="lg:col-span-3">
            <div className="space-y-2">
              <TabLink href="/settings" active>
                Account
              </TabLink>
              <TabLink href="/settings/notifications">Notifications</TabLink>
              <TabLink href="/settings/subscription">Subscription</TabLink>
            </div>
          </aside>

          <section className="lg:col-span-9">
            <h2 className="text-2xl font-bold text-gray-900">Account</h2>

            <div className="mt-8 border-b border-gray-200 pb-6">
              <SettingsRow label="Account ID" value={accountId} />
              <Divider />
              <SettingsRow
                label="Email Address"
                value={email}
              />
              <Divider />
              <SettingsRow
                label="Password"
                value="******"
                actionLabel="Change"
                actionHref="/settings/account/password"
              />
            </div>

            <TwoFactorSettings
              initialEnabled={user.twoFactorEnabled}
              initialBackupCodeCount={user.twoFactorBackupCodes.length}
            />

            <div className="mt-8 rounded-lg border border-red-200 bg-red-50/60 p-6">
              <p className="max-w-2xl text-sm leading-6 text-red-800">
                Deleting your account permanently removes your profile, resumes, job
                applications, and related Hirexa data. If you have active Hirexa AI or
                HirePilot subscriptions, they will be cancelled before deletion completes.
              </p>

              <div className="mt-4">
                <DeleteAccountModal />
              </div>
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
        active ? "bg-blue-100 text-blue-900" : "text-gray-700 hover:bg-gray-100",
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
      <div className="sm:col-span-3 text-sm font-semibold text-gray-900">{label}</div>

      <div className="sm:col-span-7 text-sm text-gray-700">{value}</div>

      <div className="sm:col-span-2 sm:text-right">
        {actionLabel && actionHref ? (
          <Link href={actionHref} className="text-sm font-semibold text-blue-700 hover:underline">
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
