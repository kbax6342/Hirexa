"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  JOB_LOCATION_ROUTE,
  ONBOARDING_FLOW_ROUTES,
  RESUME_IMPORT_ROUTE,
  WORK_STORY_ROUTE,
  getPreviousOnboardingRoute,
} from "@/app/lib/onboarding-flow";
import { getWorkStoryOptionsForRole } from "@/app/lib/onboarding/workStoryOptions";

const MAX_VISIBLE_WORK_STORY_OPTIONS = 4;

type SavedWorkStoryResponse = {
  jobs?: Array<{ uuid?: string; title?: string }>;
  roleFocus?: string | null;
  workStoryTags?: string[] | null;
  workStoryHighlight?: string | null;
  error?: string;
};

type WorkStoryOptionsResponse = {
  options?: string[] | null;
  source?: "openai" | "fallback";
  error?: string;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export default function WorkStoryStep() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [options, setOptions] = useState<string[]>(
    getWorkStoryOptionsForRole(null)
      .filter((option) => option !== "Other")
      .slice(0, MAX_VISIBLE_WORK_STORY_OPTIONS)
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallbackOptions = useMemo(() => {
    return getWorkStoryOptionsForRole(role || null)
      .filter((option) => option !== "Other")
      .slice(0, MAX_VISIBLE_WORK_STORY_OPTIONS);
  }, [role]);
  const canContinue = selectedTags.length > 0;
  const currentStep = ONBOARDING_FLOW_ROUTES.indexOf(WORK_STORY_ROUTE) + 1;
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
          | SavedWorkStoryResponse
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
        const savedTags = Array.isArray(data.workStoryTags)
          ? data.workStoryTags
              .map((tag) => normalizeText(String(tag ?? "")))
              .filter(Boolean)
          : [];
        setRole(savedRole);
        setSelectedTags(savedTags);
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
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDynamicOptions() {
      setLoadingOptions(true);

      try {
        if (!role) {
          if (active) {
            setOptions(fallbackOptions);
          }
          return;
        }

        const response = await fetch(
          `/api/onboarding/work-story-options?role=${encodeURIComponent(role)}`,
          {
            cache: "no-store",
            credentials: "include",
          }
        );

        const data = (await response.json().catch(() => null)) as
          | WorkStoryOptionsResponse
          | null;

        if (!active) {
          return;
        }

        if (response.ok && Array.isArray(data?.options) && data.options.length > 0) {
          setOptions(data.options.slice(0, MAX_VISIBLE_WORK_STORY_OPTIONS));
          return;
        }

        setOptions(fallbackOptions);
      } catch {
        if (active) {
          setOptions(fallbackOptions);
        }
      } finally {
        if (active) {
          setLoadingOptions(false);
        }
      }
    }

    void loadDynamicOptions();

    return () => {
      active = false;
    };
  }, [fallbackOptions, role]);

  useEffect(() => {
    setSelectedTags((current) => {
      const nextTags = current.filter((tag) =>
        options.some((option) => option === tag)
      );
      return nextTags.length === current.length ? current : nextTags;
    });
  }, [options]);

  function handleToggle(option: string) {
    setError(null);
    setSelectedTags((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
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
          ...(role ? { roleFocus: role } : {}),
          workStoryTags: selectedTags,
          workStoryHighlight: "",
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error ?? "We could not save your work story right now."
        );
      }

      router.push(JOB_LOCATION_ROUTE);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your work story right now."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    router.push(
      getPreviousOnboardingRoute(WORK_STORY_ROUTE) ?? RESUME_IMPORT_ROUTE
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:justify-center lg:py-12">
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Your Experience</span>
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

        <div className="mx-auto mt-8 w-full max-w-2xl">
          <section
            className={cn(
              "rounded-[32px] border border-slate-200/80 bg-white p-5 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)] sm:p-8",
              loadingSavedState && "opacity-90"
            )}
          >
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>

            <div className="mt-6">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Tell me about the work you&apos;ve actually done
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                Even if it wasn&apos;t your exact title, what did people rely on
                you for?
              </p>
            </div>

            <div className="mt-8">
              <p className="text-sm font-semibold text-slate-800">
                Pick the things you&apos;ve done before
              </p>
              {role ? (
                <p className="mt-2 text-sm text-slate-500">
                  Suggestions are tuned for {role}.
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-3">
                {loadingOptions ? (
                  <p className="text-sm text-slate-500">
                    Generating role-specific suggestions...
                  </p>
                ) : null}
                {options.map((option) => {
                  const isSelected = selectedTags.includes(option);

                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isSelected}
                    onClick={() => handleToggle(option)}
                    className={cn(
                        "flex min-h-14 w-full items-start justify-between gap-3 rounded-[24px] border px-4 py-3.5 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:text-[15px]",
                        isSelected
                          ? "border-sky-500 bg-sky-50 text-slate-950 shadow-[0_18px_40px_-32px_rgba(14,165,233,0.95)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <span className="flex-1">{option}</span>
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
                    </button>
                  );
                })}
              </div>
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
                {saving ? "Saving..." : "Use this experience"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
