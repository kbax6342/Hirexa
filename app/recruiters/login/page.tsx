import Link from "next/link";
import { redirect } from "next/navigation";

import { getRecruiterAccessResult } from "@/app/lib/recruiter/server";

const RECRUITER_DASHBOARD_CALLBACK = "/agency/dashboard";

export default async function RecruiterLoginPage() {
  const access = await getRecruiterAccessResult();

  if (access.ok) {
    redirect(RECRUITER_DASHBOARD_CALLBACK);
  }

  if (access.reason === "NOT_RECRUITER") {
    redirect(
      `/login?mode=recruiter&callbackUrl=${encodeURIComponent(
        RECRUITER_DASHBOARD_CALLBACK
      )}&reason=not-recruiter`
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-24">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Recruiters
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
          Agency Dashboard Login
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
          Sign in to access Hirexa's private recruiter workspace for job orders, candidate matching, outreach, and pipeline tracking.
        </p>
        <Link
          href="/login?mode=recruiter&callbackUrl=%2Fagency%2Fdashboard"
          className="mt-6 inline-flex items-center rounded-2xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-600"
        >
          Continue to Agency Dashboard
        </Link>
      </div>
    </main>
  );
}
