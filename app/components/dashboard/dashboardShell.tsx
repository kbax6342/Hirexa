// components/dashboard/dashboard-shell.tsx

import SensitiveContent from "@/app/components/SensitiveContent";

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
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <SensitiveContent mode="replace">{children}</SensitiveContent>
      </main>
    </div>
  );
}
