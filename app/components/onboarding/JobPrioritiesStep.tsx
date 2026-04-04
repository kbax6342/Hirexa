"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { useIsMobile } from "@/app/components/ui/use-mobile";
import {
  ALL_JOB_PRIORITY_OPTIONS,
  getJobPriorityOptionsForRole,
} from "@/app/lib/onboarding/jobPriorityOptions";
import { cn } from "@/app/lib/utils";
import {
  JOB_GOAL_ROUTE,
  JOB_INTEREST_ROUTE,
  JOB_PRIORITIES_ROUTE,
  ONBOARDING_FLOW_ROUTES,
  RESUME_IMPORT_ROUTE,
  WORK_STORY_ROUTE,
  getNextOnboardingRoute,
  getPreviousOnboardingRoute,
} from "@/app/lib/onboarding-flow";

type SavedPrioritiesResponse = {
  jobs?: Array<{ uuid?: string; title?: string }>;
  roleFocus?: string | null;
  jobSearchGoal?: string | null;
  jobPriorities?: string[] | null;
  error?: string;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSavedPriorities(value: string[] | null | undefined) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const text = normalizeText(String(item ?? ""));
    if (
      !text ||
      !ALL_JOB_PRIORITY_OPTIONS.includes(
        text as (typeof ALL_JOB_PRIORITY_OPTIONS)[number]
      )
    ) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
  }

  return normalized;
}

export default function JobPrioritiesStep() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [role, setRole] = useState("");
  const [jobSearchGoal, setJobSearchGoal] = useState("");
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = selectedPriorities.length > 0;
  const priorityOptions = useMemo(
    () => getJobPriorityOptionsForRole(role, selectedPriorities, 4),
    [role, selectedPriorities]
  );
  const currentStep = ONBOARDING_FLOW_ROUTES.indexOf(JOB_PRIORITIES_ROUTE) + 1;
  const progressPercent = useMemo(
    () =>
      Math.max(
        8,
        Math.round((currentStep / ONBOARDING_FLOW_ROUTES.length) * 100)
      ),
    [currentStep]
  );

  useEffect(() => {
    let active = true;

    async function loadSavedState() {
      try {
        const response = await fetch("/api/job-interests", {
          cache: "no-store",
          credentials: "include",
        });

        const data = (await response.json().catch(() => null)) as
          | SavedPrioritiesResponse
          | null;

        if (!active || !response.ok || !data) {
          return;
        }

        const savedRole = normalizeText(
          data.roleFocus ??
            data.jobs?.find((job) => normalizeText(String(job.title ?? "")))
              ?.title ??
            ""
        );
        const savedGoal = normalizeText(data.jobSearchGoal ?? "");

        if (!savedRole) {
          router.replace(JOB_INTEREST_ROUTE);
          return;
        }

        if (!savedGoal) {
          router.replace(JOB_GOAL_ROUTE);
          return;
        }

        setRole(savedRole);
        setJobSearchGoal(savedGoal);
        const savedPriorities = normalizeSavedPriorities(data.jobPriorities);
        const visiblePriorities = getJobPriorityOptionsForRole(
          savedRole,
          savedPriorities,
          4
        );
        setSelectedPriorities(
          savedPriorities.filter((priority) =>
            visiblePriorities.includes(priority)
          )
        );
      } finally {
        if (active) {
          setLoadingSavedState(false);
        }
      }
    }

    void loadSavedState();

    return () => {
      active = false;
    };
  }, [router]);

  function handleToggle(priority: string) {
    setError(null);

    if (selectedPriorities.includes(priority)) {
      setSelectedPriorities((current) =>
        current.filter((item) => item !== priority)
      );
      return;
    }

    setSelectedPriorities((current) => [...current, priority]);
  }

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
          jobSearchGoal,
          jobPriorities: selectedPriorities,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error ?? "We could not save your priorities right now."
        );
      }

      const shouldSkipResumeImport =
        typeof window !== "undefined"
          ? window.matchMedia("(min-width: 768px)").matches
          : !isMobile;

      router.push(
        shouldSkipResumeImport
          ? WORK_STORY_ROUTE
          : getNextOnboardingRoute(JOB_PRIORITIES_ROUTE) ?? RESUME_IMPORT_ROUTE
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your priorities right now."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    router.push(
      getPreviousOnboardingRoute(JOB_PRIORITIES_ROUTE) ?? JOB_GOAL_ROUTE
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:justify-center lg:py-12">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-5 px-1 sm:mb-6">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span>Your Priorities</span>
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
                What matters most in your next job?
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                We&apos;ll use this to rank better matches.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              {priorityOptions.map((priority) => {
                const isSelected = selectedPriorities.includes(priority);

                return (
                  <button
                    key={priority}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleToggle(priority)}
                    className={cn(
                      "flex min-h-14 w-full items-start justify-start gap-3 rounded-[24px] border px-4 py-3.5 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:text-[15px]",
                      isSelected
                        ? "border-sky-500 bg-sky-50 text-slate-950 shadow-[0_18px_40px_-32px_rgba(14,165,233,0.95)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-sky-500 bg-sky-500 text-white"
                          : "border-slate-300 text-transparent"
                      )}
                      aria-hidden="true"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1">{priority}</span>
                  </button>
                );
              })}
            </div>

            {error ? (
              <div
                className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
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
                {saving ? "Saving..." : "Sounds Good"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
