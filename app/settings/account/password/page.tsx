import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import LoginFooter from "@/app/components/loginFooter/LoginFooter";
import { prisma } from "@/app/lib/prisma";
import PasswordChangeForm from "@/app/dashboard/settings/account/password/PasswordChangeForm";

export default async function SettingsPasswordPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = (session.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      password: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white">
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
            <p className="mt-1 text-sm text-gray-600">Update your password securely.</p>
          </div>
          <Link href="/settings" className="text-sm font-semibold text-blue-700 hover:underline">
            Back to settings
          </Link>
        </div>

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
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">Change password</h2>
              <p className="mt-2 text-sm text-gray-600">
                For your security, confirm your current password before setting a new one.
              </p>

              <div className="mt-6">
                <PasswordChangeForm
                  hasPassword={Boolean(user.password)}
                  email={user.email}
                />
              </div>
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
        active ? "bg-blue-100 text-blue-900" : "text-gray-700 hover:bg-gray-100",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
