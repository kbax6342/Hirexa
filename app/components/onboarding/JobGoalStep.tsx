"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { getJobGoalOptionsForRole } from "@/app/lib/onboarding/jobGoalOptions";
import { cn } from "@/app/lib/utils";
import {
  JOB_GOAL_ROUTE,
  JOB_INTEREST_ROUTE,
  JOB_PRIORITIES_ROUTE,
  PRIMARY_ONBOARDING_FLOW_ROUTES,
  getNextPrimaryOnboardingRoute,
  getPreviousPrimaryOnboardingRoute,
} from "@/app/lib/onboarding-flow";

type SavedIntentResponse = {
  jobs?: Array<{ uuid?: string; title?: string }>;
  roleFocus?: string | null;
  jobSearchGoal?: string | null;
  error?: string;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export default function JobGoalStep() {
  const router = useRouter();

  const [role, setRole] = useState("");
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = Boolean(role && selectedGoal);
  const goalOptions = useMemo(
    () => getJobGoalOptionsForRole(role, [], 4),
    [role]
  );
  const currentStep = PRIMARY_ONBOARDING_FLOW_ROUTES.indexOf(JOB_GOAL_ROUTE) + 1;
  const progressPercent = useMemo(
    () =>
      Math.max(
        8,
        Math.round((currentStep / PRIMARY_ONBOARDING_FLOW_ROUTES.length) * 100)
      ),
    [currentStep]
  );

  useEffect(() => {
    let active = true;

    async function loadSavedIntent() {
      try {
        const response = await fetch("/api/job-interests", {
          cache: "no-store",
          credentials: "include",
        });

        const data = (await response.json().catch(() => null)) as
          | SavedIntentResponse
          | null;

        if (!active || !response.ok || !data) {
          return;
        }

        const savedRole = normalizeText(
          data.roleFocus ??
            data.jobs?.find((job) => normalizeText(String(job.title ?? "")))?.title ??
            ""
        );
        const savedGoal = normalizeText(data.jobSearchGoal ?? "") || null;

        if (!savedRole) {
          router.replace(JOB_INTEREST_ROUTE);
          return;
        }

        setRole(savedRole);
        setSelectedGoal(savedGoal);
      } finally {
        if (active) {
          setLoadingSavedState(false);
        }
      }
    }

    void loadSavedIntent();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedGoal) return;
    if (goalOptions.includes(selectedGoal)) return;
    setSelectedGoal(null);
  }, [goalOptions, selectedGoal]);

  async function handleContinue() {
    if (!canContinue) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/job-interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          roleFocus: role,
          jobSearchGoal: selectedGoal,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error ?? "We could not save your goal right now."
        );
      }

      router.push(
        getNextPrimaryOnboardingRoute(JOB_GOAL_ROUTE) ?? JOB_PRIORITIES_ROUTE
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your goal right now."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    router.push(getPreviousPrimaryOnboardingRoute(JOB_GOAL_ROUTE) ?? JOB_INTEREST_ROUTE);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:justify-center lg:py-12">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-5 px-1 sm:mb-6">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span>Your Target Job</span>
              <span>{progressPercent}% complete</span>
            </div>
            <div
              className="mt-3 h-2 rounded-full bg-slate-200/90"
              aria-label="Onboarding progress"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progressPercent}
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 shadow-[0_8px_24px_-12px_rgba(37,99,235,0.9)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <section
            className={cn(
              "rounded-[32px] border border-slate-200/80 bg-white p-5 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)] sm:p-8",
              loadingSavedState && "opacity-90"
            )}
          >
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>

            <div className="mt-6">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Which best describes your goal right now?
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                Choose the path that feels most true for what you want next. We&apos;ll
                use it to guide your experience around {role}.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              {goalOptions.map((goal) => {
                const isSelected = selectedGoal === goal;
                return (
                  <button
                    key={goal}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedGoal(goal);
                      setError(null);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[24px] border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:px-5",
                      isSelected
                        ? "border-sky-500 bg-sky-50 text-slate-950 shadow-[0_18px_40px_-30px_rgba(14,165,233,0.9)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <span className="pr-4 text-sm font-medium leading-6 sm:text-base">
                      {goal}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                        isSelected
                          ? "border-sky-200 bg-white text-sky-700"
                          : "border-slate-200 text-slate-400"
                      )}
                    >
                      {isSelected ? "Selected" : "Choose"}
                    </span>
                  </button>
                );
              })}
            </div>

            {error ? (
              <div
                className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <div className="pt-8">
              <Button
                type="button"
                size="lg"
                disabled={!canContinue || saving}
                onClick={handleContinue}
                className="h-[52px] w-full rounded-2xl bg-[#145efc] text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6]"
              >
                {saving ? "Saving..." : "Continue"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
