import type { ReactNode } from "react";

import SensitiveContent from "@/app/components/SensitiveContent";
import RecruiterSidebar from "@/app/components/recruiter/RecruiterSidebar";

export default function RecruiterShell({
  agencyName,
  children,
}: {
  agencyName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto flex w-full max-w-7xl gap-6 px-4 pb-10 pt-28 lg:px-6">
        <aside className="hidden w-72 shrink-0 lg:block">
          <RecruiterSidebar agencyName={agencyName} />
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-5 lg:hidden">
            <RecruiterSidebar agencyName={agencyName} compact />
          </div>
          <SensitiveContent mode="replace">{children}</SensitiveContent>
        </div>
      </main>
    </div>
  );
}
