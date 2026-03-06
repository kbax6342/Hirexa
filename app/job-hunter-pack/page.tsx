"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getOrCreateGuestId } from "@/app/lib/guestId";

type JobPayload = {
  id?: string;
  title?: string;
  company?: string;
  url?: string;
  description?: string;
};

export default function JobHunterPackLandingPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobId = searchParams.get("jobId") ?? "";

  const job = useMemo<JobPayload | undefined>(() => {
    if (!jobId) return undefined;
    return { id: jobId };
  }, [jobId]);

  async function startCheckout() {
    try {
      setLoading(true);
      setError(null);

      const guestId = getOrCreateGuestId();
      if (!guestId) throw new Error("Unable to initialize guest checkout.");

      const res = await fetch("/api/checkout/job-hunter-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, job }),
      });

      const json = await res.json();
      if (!res.ok || !json?.checkoutUrl) {
        throw new Error(json?.error ?? "Could not start checkout.");
      }

      window.location.href = json.checkoutUrl as string;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-14">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold text-sky-700">Hirexa Product</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Job Hunter Pack</h1>
        <p className="mt-3 text-slate-600">
          A complete, job-specific application package that helps you stand out faster.
        </p>

        {jobId && (
          <p className="mt-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Building this pack for job ID: <span className="font-semibold">{jobId}</span>
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">One-time payment</p>
              <p className="text-4xl font-bold text-slate-900">$29</p>
            </div>
          </div>

          <ul className="mt-5 space-y-3 text-sm text-slate-700">
            <li>• ATS Resume Rewrite</li>
            <li>• Tailored Cover Letter</li>
            <li>• Interview Prep Guide</li>
          </ul>

          <button
            type="button"
            onClick={startCheckout}
            disabled={loading}
            className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Starting checkout..." : "Get Job Hunter Pack"}
          </button>

          <Link
            href="/jobs"
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Back to Jobs
          </Link>

          {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
        </div>
      </div>
    </main>
  );
}
