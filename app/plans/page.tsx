// app/plans/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircleIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

type PlanId = "trial" | "annual";

type Plan = {
  id: PlanId;
  label: string;
  price: string;
  cadence?: string;
  pill?: string;
  recommended?: boolean;
  perks: string[];
};

export default function PlansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Optional context from the Auto-fill button:
  // /plans?source=autofill&jobId=123
  const source = searchParams.get("source") ?? null;
  const jobId = searchParams.get("jobId") ?? null;

  const plans: Plan[] = useMemo(
    () => [
      {
        id: "trial",
        label: "Trial access",
        price: "$1.95",
        pill: "RECOMMENDED",
        recommended: true,
        perks: [
          "AI-powered job search",
          "Best job matches",
          "Auto-fill your applications",
          "After 14 days, auto-renews with full access at $18.95, billed every 4 weeks. Cancel anytime.",
        
        ],
      },
      {
        id: "annual",
        label: "Annual access",
        price: "$4.95",
        cadence: "/mo",
        perks: [
          "AI-powered job search",
          "Best job matches",
          "Auto-fill your applications",
          "Billed annually. Cancel anytime.",
          
        ],
      },
    ],
    []
  );

  const [selected, setSelected] = useState<PlanId>("trial");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedPlan = plans.find((p) => p.id === selected)!;

  async function onNext() {
    if (saving) return;
  
    setSaving(true);
    setSaveError(null);
  
    try {
      const res = await fetch("/api/benefits/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          selectedPlan: selectedPlan.id,
          benefits: selectedPlan.perks,
          source,
          jobId,
        }),
      });
  
      const data = await res.json().catch(() => ({}));
  
      if (!res.ok) {
        setSaveError(data?.error ?? "Failed to continue.");
        return;
      }
  
      if (!data?.url) {
        setSaveError("Checkout URL missing from server.");
        return;
      }
  
      window.location.href = data.url;
    } catch {
      setSaveError("Failed to continue.");
    } finally {
      setSaving(false);
    }
  }
  

  return (
    <div className="min-h-screen bg-white">
      {/* Top step nav */}
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
           

            <nav className="hidden items-center gap-6 text-sm text-gray-500 md:flex">
              <Step label="Sign Up" state="done" />
              <Step label="Benefits" state="current" />
              <Step label="Payment" state="upcoming" />
              <Step label="Auto apply" state="upcoming" />
            </nav>
          </div>
        </div>
      </header>

    
      {/* Main */}
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
          You’re moments away from applying smarter, not harder.
          </h1>

          {(source || jobId) && (
            <p className="mt-3 text-sm text-gray-500">
              {source === "autofill" ? "Auto-fill" : "Upgrade"}{" "}
              {jobId ? `for job ${jobId}` : ""} is ready — pick a plan to
              continue.
            </p>
          )}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-12">
          {/* LEFT: Plan selectors */}
          <section className="lg:col-span-4">
            <div className="space-y-4">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={selected === plan.id}
                  onSelect={() => setSelected(plan.id)}
                />
              ))}

              {/* Perks list (left box) */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <ul className="space-y-3 text-sm text-gray-700">
                  {selectedPlan.perks.map((t, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                    <CheckCircleIcon className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
                    <span className="leading-5">{t}</span>
                  </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* RIGHT: Benefits + Next */}
          <section className="lg:col-span-8">
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <h2 className="text-center text-lg font-extrabold text-gray-900">
                All subscription features
              </h2>

              <div className="mt-8 grid gap-8 md:grid-cols-2">
                <Feature
                  icon={<MagnifyingGlassIcon className="h-6 w-6 text-emerald-700" />}
                  title="Job searching, fully automated"
                  desc="Hirexa finds and applies to relevant jobs for you — continuously and intelligently."
                />
                <Feature
                  icon={<DocumentTextIcon className="h-6 w-6 text-emerald-700" />}
                  title="One profile. Unlimited reach."
                  desc="Turn a single setup into hundreds of tailored applications without extra effort."
                />
                <Feature
                  icon={<SparklesIcon className="h-6 w-6 text-emerald-700" />}
                  title="More time. Less stress. Better results."
                  desc="No more copy-pasting applications. Hirexa handles it so you don’t have to."
                />
                <Feature
                  icon={<ShieldCheckIcon className="h-6 w-6 text-emerald-700" />}
                  title="Support that works around your schedule"
                  desc="Reach out anytime — we respond as quickly as possible during business hours.."
                />
              
             
              </div>

              <button
                type="button"
                onClick={onNext}
                disabled={saving}
                className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving..." : "Next"}
                <ArrowRightIcon className="h-5 w-5" />
              </button>

              {saveError && (
                <p className="mt-4 text-center text-sm text-red-600">{saveError}</p>
              )}

              <p className="text-center text-xs text-gray-400 pt-5">
                You may cancel by email or online
              </p>
            </div>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-12 flex items-center justify-between border-t pt-6 text-xs text-gray-500">
          <div className="flex gap-6">
            <button className="hover:underline" type="button">
              Terms &amp; Conditions
            </button>
            <button className="hover:underline" type="button">
              Privacy Policy
            </button>
          </div>
          <div>© {new Date().getFullYear()}, BA Tech. All rights reserved.</div>
        </div>
      </main>
    </div>
  );
}

/* ------------------ UI bits ------------------ */

function Step({
  label,
  state,
}: {
  label: string;
  state: "done" | "current" | "upcoming";
}) {
  const dot =
    state === "done"
      ? "bg-emerald-500"
      : state === "current"
      ? "bg-blue-600"
      : "bg-gray-200";

  const text =
    state === "current" ? "text-gray-900 font-semibold" : "text-gray-500";

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className={text}>{label}</span>
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: Plan;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-xl border bg-white p-4 text-left shadow-sm transition",
        selected
          ? "border-blue-600 ring-1 ring-blue-600"
          : "border-gray-200 hover:border-gray-300",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={[
              "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border",
              selected ? "border-blue-600 bg-blue-50" : "border-gray-300 bg-white",
            ].join(" ")}
            aria-hidden
          >
            {selected ? (
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
            ) : null}
          </span>

          <div>
            <div className="text-sm font-semibold text-gray-900">
              {plan.label}
            </div>
            <div className="mt-1 flex items-end gap-1">
              <div className="text-2xl font-extrabold text-gray-900">
                {plan.price}
              </div>
              {plan.cadence ? (
                <div className="text-sm font-semibold text-gray-500">
                  {plan.cadence}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {plan.pill ? (
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
            {plan.pill}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
        {icon}
      </div>
      <div>
        <div className="text-sm font-bold text-gray-900">{title}</div>
        <div className="mt-1 text-sm text-gray-600">{desc}</div>
      </div>
    </div>
  );
}
