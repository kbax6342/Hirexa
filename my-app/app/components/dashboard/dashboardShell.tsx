// components/dashboard/dashboard-shell.tsx
import Link from "next/link";
import LoginFooter from "../../components/loginFooter/LoginFooter";

type Active = "job-matches" | "applications" | "profile";

export default function DashboardShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active: Active;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      {/* <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-gray-900">
            Hirexa
          </Link>

          <nav className="flex items-center gap-6 text-xs font-semibold uppercase tracking-wide text-gray-700">
            <Link
              href="/dashboard"
              className={
                active === "job-matches"
                  ? "text-blue-700 underline underline-offset-4"
                  : "hover:text-gray-900"
              }
            >
              Job Matches
            </Link>
            <Link
              href="/dashboard/applications"
              className={
                active === "applications"
                  ? "text-blue-700 underline underline-offset-4"
                  : "hover:text-gray-900"
              }
            >
              Applications
            </Link>
            <Link
              href="/dashboard/profile"
              className={
                active === "profile"
                  ? "text-blue-700 underline underline-offset-4"
                  : "hover:text-gray-900"
              }
            >
              Profile
            </Link>
          </nav>

          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
              K
            </span>
            <span className="hidden sm:block">Kevin</span>
            <svg className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>
      </header> */}

      {/* Body */}
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>

      <LoginFooter />
    </div>
  );
}
