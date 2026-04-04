"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  JOB_INTEREST_ROUTE,
  ONBOARDING_FLOW_ROUTES,
  RESUME_ROUTE,
  getNextOnboardingRoute,
  getPreviousOnboardingRoute,
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

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export default function JobIntentStep() {
  const router = useRouter();

  const [role, setRole] = useState("");
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settledRole, setSettledRole] = useState("");
  const [showSettledRole, setShowSettledRole] = useState(false);

  const normalizedRole = useMemo(() => normalizeText(role), [role]);
  const canContinue = Boolean(normalizedRole);

  const currentStep = ONBOARDING_FLOW_ROUTES.indexOf(JOB_INTEREST_ROUTE) + 1;
  const progressPercent = Math.max(
    8,
    Math.round((currentStep / ONBOARDING_FLOW_ROUTES.length) * 100)
  );

  useEffect(() => {
    let active = true;

    async function loadSavedIntent() {
      try {
        await fetch("/api/onboarding/start", { method: "POST" }).catch(() => {});

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

        setRole(savedRole);
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
  }, []);

  useEffect(() => {
    if (!normalizedRole) {
      setShowSettledRole(false);
      setSettledRole("");
      return;
    }

    setShowSettledRole(false);

    const timeout = window.setTimeout(() => {
      setSettledRole(normalizedRole);
      window.requestAnimationFrame(() => {
        setShowSettledRole(true);
      });
    }, 450);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [normalizedRole]);

  function handleRoleChange(nextValue: string) {
    setRole(nextValue);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canContinue) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/job-interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobs: [{ uuid: slugify(normalizedRole), title: normalizedRole }],
          roleFocus: normalizedRole,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error ?? "We could not save your target role right now."
        );
      }

      router.push(
        getNextOnboardingRoute(JOB_INTEREST_ROUTE) ?? "/onboarding/job-goal"
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your target role right now."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    router.push(getPreviousOnboardingRoute(JOB_INTEREST_ROUTE) ?? RESUME_ROUTE);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:py-12">
        <div className="w-full px-1">
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

        <div className="mx-auto mt-4 w-full max-w-2xl sm:mt-6 lg:mt-8">
          <section
            className={cn(
              "flex flex-col rounded-[28px] mt-[60%] border  border-slate-200/80 bg-white p-4 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)] sm:rounded-[32px] sm:p-8",
              loadingSavedState && "opacity-90"
            )}
          >
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex w-fit self-start items-center gap-2 rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>

            <div className="mt-4 sm:mt-6">
              <h1 className="text-[1.85rem] font-semibold tracking-tight text-slate-950 sm:text-4xl">
                What kind of job are you going after?
              </h1>
              <p className="mt-2 max-w-xl text-[13px] leading-5 text-slate-600 sm:mt-3 sm:text-base sm:leading-6">
                Start with the role you want most. You can add more later.
              </p>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-300 ease-out",
                  settledRole ? "mt-3 max-h-20" : "mt-0 max-h-0"
                )}
                aria-live="polite"
              >
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm font-medium text-sky-700 shadow-[0_14px_28px_-22px_rgba(14,165,233,0.85)] transition-all duration-300 ease-out",
                    showSettledRole
                      ? "translate-y-0 opacity-100"
                      : "-translate-y-2 opacity-0"
                  )}
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  Targeting {settledRole}
                </div>
              </div>
            </div>

            <form className="space-y-5 pt-6 sm:space-y-7 sm:pt-8" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="job-intent-role"
                  className="text-sm font-medium text-slate-700"
                >
                  Target role
                </label>
                <div className="relative mt-3">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="job-intent-role"
                    type="text"
                    value={role}
                    onChange={(event) => handleRoleChange(event.target.value)}
                    placeholder='Try "Customer Support," "Software Engineer," or "Medical Assistant"'
                    autoComplete="off"
                    className="h-[3.25rem] w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-100 sm:h-14"
                  />
                </div>
              </div>

              {error ? (
                <div
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <div className="pt-1">
                <Button
                  type="submit"
                  size="lg"
                  disabled={!canContinue || saving}
                  className="h-[52px] w-full rounded-2xl bg-[#145efc] text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6]"
                >
                  {saving ? "Saving..." : "Continue"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
