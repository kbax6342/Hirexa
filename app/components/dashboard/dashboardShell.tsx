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
      

      {/* Body */}
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>

      <div className="hidden md:block">
        <LoginFooter />
      </div>
    </div>
  );
}
