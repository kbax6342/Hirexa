"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseIcon,
  HomeIcon,
  MegaphoneIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import RecruiterCard from "@/app/components/recruiter/RecruiterCard";
import { cn } from "@/app/lib/utils";

const recruiterNavItems = [
  { href: "/recruiter/dashboard", label: "Dashboard", icon: HomeIcon },
  { href: "/recruiter/job-orders", label: "Job Orders", icon: BriefcaseIcon },
  { href: "/recruiter/candidates", label: "Candidates", icon: UsersIcon },
  { href: "/recruiter/outreach", label: "Outreach", icon: MegaphoneIcon },
];

export default function RecruiterSidebar({
  agencyName,
  compact = false,
}: {
  agencyName: string;
  compact?: boolean;
}) {
  const pathname = usePathname();

  if (compact) {
    return (
      <RecruiterCard className="rounded-2xl border-slate-200 p-3">
        <div className="mb-3 px-2">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
            Recruiter
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{agencyName}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {recruiterNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "border border-sky-200 bg-sky-50/50 text-sky-700"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </RecruiterCard>
    );
  }

  return (
    <RecruiterCard className="sticky top-24 rounded-2xl border-slate-200 p-5">
      <div className="pb-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
          Recruiter Workspace
        </div>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{agencyName}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Manage job orders, ranked candidates, outreach, and stage flow in one place.
        </p>
      </div>

      <nav className="space-y-1">
        {recruiterNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",
                isActive
                  ? "border border-sky-200 bg-sky-50/50 text-sky-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </RecruiterCard>
  );
}
