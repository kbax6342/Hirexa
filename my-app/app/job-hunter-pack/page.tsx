"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { getOrCreateGuestId } from "@/app/lib/guestId";

type JobContext = {
  id?: string;
  title?: string;
  company?: string;
  companyName?: string;
  url?: string;
  jobUrl?: string;
  description?: string;
  descriptionText?: string;
};

const includedItems = ["Optimized Resume", "Tailored Cover Letter", "Interview Prep"];

export default function JobHunterPackPage() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId") ?? undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const job: JobContext | undefined = useMemo(() => {
    if (!jobId) return undefined;
    return {
      id: jobId,
    };
  }, [jobId]);

  async function startCheckout() {
    try {
      setLoading(true);
      setError(null);

      const guestId = getOrCreateGuestId();
      const res = await fetch("/api/checkout/job-hunter-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, job }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.checkoutUrl) {
        throw new Error(data?.error ?? "Unable to start checkout");
      }

      window.location.href = data.checkoutUrl;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong while starting checkout.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-border/60 bg-card/40 p-8 backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Product</p>
          <h1 className="mt-4 text-3xl font-bold text-foreground md:text-4xl">Job Hunter Pack</h1>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            Get a complete, role-specific application package. Built for one job at a time.
          </p>

          <div className="mt-6 space-y-3">
            {includedItems.map((item) => (
              <div key={item} className="rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-sm font-medium text-foreground">
                {item}
              </div>
            ))}
          </div>

          {jobId && (
            <p className="mt-6 text-xs text-muted-foreground">Pack will be linked to job ID: {jobId}</p>
          )}
        </section>

        <aside className="rounded-3xl border border-emerald-200/40 bg-emerald-50/60 p-8">
          <div className="text-sm font-medium text-emerald-900">One-time purchase</div>
          <div className="mt-2 text-4xl font-bold text-emerald-700">$29</div>
          <p className="mt-2 text-sm text-emerald-900/80">Per targeted job application package.</p>

          <button
            type="button"
            onClick={startCheckout}
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Redirecting..." : "Get Job Hunter Pack"}
          </button>

          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

          <Link href="/jobs" className="mt-4 block text-center text-sm font-medium text-emerald-900 hover:underline">
            Continue browsing jobs
          </Link>
        </aside>
      </div>
    </main>
  );
}
