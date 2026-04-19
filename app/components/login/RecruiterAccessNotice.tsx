"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";

import { Button } from "@/app/components/ui/button";
import { clearAppliedJobsSession } from "@/app/lib/appliedJobsSession";

export default function RecruiterAccessNotice({
  reason,
}: {
  reason?: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnHref = query ? `${pathname}?${query}` : pathname;

  const message =
    reason === "not-recruiter"
      ? "This account does not have recruiter access. To access the Agency Dashboard, please log in with your recruiter account."
      : "You're currently signed in as a job seeker account. To access the Agency Dashboard, please log in with your recruiter account.";

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
      <p className="text-sm font-semibold text-amber-900">Recruiter access required</p>
      <p className="mt-2 text-sm leading-6 text-amber-800">{message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => {
            clearAppliedJobsSession();
            void signOut({ callbackUrl: returnHref });
          }}
          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          Switch account
        </Button>
        <Button
          asChild
          variant="outline"
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Link href="/dashboard">Go back</Link>
        </Button>
      </div>
    </div>
  );
}
