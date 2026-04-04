"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  HIGHLIGHT_SKILLS_ROUTE,
  JOB_FILTERS_ROUTE,
  ONBOARDING_FLOW_ROUTES,
  WORK_STORY_ROUTE,
  getNextOnboardingRoute,
  getPreviousOnboardingRoute,
} from "@/app/lib/onboarding-flow";
import { getSuggestedHighlightSkills } from "@/app/lib/onboarding/skillSuggestions";

const MAX_VISIBLE_SKILLS = 4;

type SavedHighlightSkillsResponse = {
  roleFocus?: string | null;
  workStoryTags?: string[] | null;
  workStoryHighlight?: string | null;
  skills?: string[] | null;
  resumeSkills?: string[] | null;
  highlightSkillsConfidence?: string | null;
  error?: string;
};

function normalizeSkill(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function dedupeSkills(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeSkill(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export default function HighlightSkillsStep() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [resumeSkills, setResumeSkills] = useState<string[]>([]);
  const [workStoryTags, setWorkStoryTags] = useState<string[]>([]);
  const [savedSkills, setSavedSkills] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedSkills = useMemo(
    () =>
      getSuggestedHighlightSkills({
        role,
        resumeSkills,
        workStoryTags,
        savedSkills,
        limit: MAX_VISIBLE_SKILLS,
      }),
    [role, resumeSkills, savedSkills, workStoryTags]
  );
  const displaySkills = useMemo(
    () =>
      dedupeSkills([...selectedSkills, ...suggestedSkills]).slice(
        0,
        MAX_VISIBLE_SKILLS
      ),
    [selectedSkills, suggestedSkills]
  );
  const canContinue = selectedSkills.length > 0;
  const currentStep = ONBOARDING_FLOW_ROUTES.indexOf(HIGHLIGHT_SKILLS_ROUTE) + 1;
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
          | SavedHighlightSkillsResponse
          | null;

        if (!active || !response.ok || !data) {
          return;
        }

        const nextRole = normalizeSkill(data.roleFocus);
        const nextResumeSkills = dedupeSkills(
          Array.isArray(data.resumeSkills) ? data.resumeSkills : []
        );
        const nextWorkStoryTags = dedupeSkills(
          Array.isArray(data.workStoryTags) ? data.workStoryTags : []
        );
        const nextSavedSkills = dedupeSkills(
          Array.isArray(data.skills) ? data.skills : []
        );
        const roleLedSkills = getSuggestedHighlightSkills({
          role: nextRole,
          resumeSkills: nextResumeSkills,
          workStoryTags: nextWorkStoryTags,
          savedSkills: [],
          limit: MAX_VISIBLE_SKILLS,
        });
        const roleLedSkillKeys = new Set(
          roleLedSkills.map((skill) => skill.toLowerCase())
        );
        const roleRelevantSavedSkills = nextSavedSkills.filter((skill) =>
          roleLedSkillKeys.has(skill.toLowerCase())
        );

        setRole(nextRole);
        setResumeSkills(nextResumeSkills);
        setWorkStoryTags(nextWorkStoryTags);
        setSavedSkills(nextSavedSkills);
        setSelectedSkills(roleRelevantSavedSkills.slice(0, MAX_VISIBLE_SKILLS));
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

  function handleToggleSkill(skill: string) {
    setError(null);
    setSelectedSkills((current) =>
      current.includes(skill)
        ? current.filter((item) => item !== skill)
        : [...current, skill]
    );
  }

  async function handleContinue() {
    if (!canContinue) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/onboarding/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          skills: selectedSkills,
          allowShortlist: true,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "We could not save your skills yet.");
      }

      router.push(
        getNextOnboardingRoute(HIGHLIGHT_SKILLS_ROUTE) ?? JOB_FILTERS_ROUTE
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your skills yet."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    router.push(
      getPreviousOnboardingRoute(HIGHLIGHT_SKILLS_ROUTE) ?? WORK_STORY_ROUTE
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:justify-center lg:py-12">
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Your Skills</span>
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
                What do you want employers to notice about you?
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                Choose the skills you want Hirexa to highlight.
              </p>
            </div>

            <div className="mt-8">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Suggested skills
                </p>
                {role ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Suggestions are tuned for {role}.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    These picks are based on the experience you&apos;ve shared so
                    far.
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {displaySkills.map((skill) => {
                  const isSelected = selectedSkills.includes(skill);

                  return (
                    <button
                      key={skill}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleToggleSkill(skill)}
                      className={cn(
                        "flex min-h-14 w-full items-center justify-between gap-3 rounded-[24px] border px-4 py-3.5 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:text-[15px]",
                        isSelected
                          ? "border-sky-500 bg-sky-50 text-slate-950 shadow-[0_18px_40px_-32px_rgba(14,165,233,0.95)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <span className="flex-1">{skill}</span>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
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
              <p className="mt-4 text-sm text-slate-500">
                You can always add more skills later - let&apos;s keep going.
              </p>
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
