// /app/onboarding/job-alerts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/90">
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M16.25 5.75L8.5 13.5L3.75 8.75"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="text-sm leading-6 text-white/90">{children}</p>
    </div>
  );
}

export default function JobAlertsOnboardingPage() {
  const [email, setEmail] = useState("");
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setJobsLoading(true);
        const res = await fetch("/api/onboarding/selected-jobs", { cache: "no-store" });
        const data: { jobs?: string[] } = await res.json();
        if (cancelled) return;
        setSelectedJobs(Array.isArray(data.jobs) ? data.jobs : []);
      } catch {
        if (!cancelled) setSelectedJobs([]);
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const emailLooksValid = useMemo(() => {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }, [email]);

  const titlesText = useMemo(() => {
    if (!selectedJobs?.length) return "roles";
    const max = 5;
    const list = selectedJobs.slice(0, max);
    const extra = selectedJobs.length - list.length;

    const joined =
      list.length === 1
        ? list[0]
        : list.length === 2
        ? `${list[0]} and ${list[1]}`
        : `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;

    return extra > 0 ? `${joined}, and ${extra} more` : joined;
  }, [selectedJobs]);

  async function onNext() {
    if (!emailLooksValid || saving) return;

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/onboarding/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const text = await res.text();
      console.log("job-alerts /email raw:", { ok: res.ok, status: res.status, body: text });

      if (!res.ok) {
        let parsed: any = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {}
        setSaveError(parsed?.error ?? parsed?.message ?? text ?? "Failed to save email");
        return;
      }

      const parsed = text ? JSON.parse(text) : { ok: true };
      console.log("✅ PROOF email/newsletter saved:", parsed?.proof ?? parsed);

      router.push("/onboarding/choose-workplace");
    } catch (e: any) {
      console.error("❌ onNext failed:", e?.message ?? e);
      setSaveError("Failed to save email");
    } finally {
      setSaving(false);
    }
  }

  return (
    // ✅ Same structure as the Skills page: flex column + sticky footer
    <div className="min-h-screen bg-white flex flex-col">
      {/* ✅ Content grows; footer stays bottom */}
      <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-[100px] flex-1">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Don’t miss out on new openings
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">
            Save your progress and get custom job alerts for{" "}
            <span className="font-medium text-gray-800">
              {jobsLoading ? "your selected roles" : titlesText}
            </span>{" "}
            based on your preferences.
          </p>
        </div>

        <div className="mt-7 w-full max-w-2xl text-left mx-auto">
          <label htmlFor="email" className="block text-xs font-medium text-gray-700">
            *Email Address
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
          {saveError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </div>

        <div className="mt-10 w-full max-w-3xl mx-auto rounded-xl bg-[#0B1F4B] px-6 py-8 text-left text-white shadow-sm">
          <h2 className="text-center text-xl font-semibold sm:text-2xl">
            Cast a wider net while saving time
          </h2>

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <Bullet>We continuously scan millions of openings to find your top matches.</Bullet>
            <Bullet>
              Submit 10x as many applications with less effort than one manual application
              <sup className="ml-0.5 text-xs">1</sup>.
            </Bullet>
            <Bullet>Start each day with a list of roles matched to your skills and preferences.</Bullet>
            <Bullet>Reclaim your time by letting our AI handle the grunt work of job searching.</Bullet>
          </div>
        </div>
      </main>

      {/* ✅ Footer matches the previous page */}
      <footer className="sticky bottom-0 w-full border-t border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <div className="mx-auto w-9/12 md:w-11/12 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-6 py-3 text-black font-medium rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back
            </button>

            <button
              type="button"
              onClick={onNext}
              disabled={!emailLooksValid || saving}
              className={[
                "px-8 py-3 rounded-full font-medium text-white disabled:opacity-50 transition",
                emailLooksValid && !saving ? "bg-black hover:bg-black/90" : "bg-gray-300 text-gray-600",
              ].join(" ")}
            >
              {saving ? "Saving..." : "Next"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
