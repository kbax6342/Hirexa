"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  CREATE_ACCOUNT_ROUTE,
  HIRING_SIGNAL_ROUTE,
  JOB_LOCATION_ROUTE,
  ONBOARDING_FLOW_ROUTES,
} from "@/app/lib/onboarding-flow";

const HIRING_SIGNAL_OPTIONS = [
  "I learn fast",
  "I'm reliable",
  "I work well with people",
  "I solve problems calmly",
  "I've led or trained others",
  "I hit goals",
  "I'm organized",
  "I'm technical",
  "I'm adaptable",
  "I show up and get it done",
] as const;

type HiringSignalOption = (typeof HIRING_SIGNAL_OPTIONS)[number];

type PreferencesResponse = {
  ok?: boolean;
  preferences?: {
    roleFocus?: string;
    hiringSignalTraits?: string[];
  };
  error?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function isHiringSignalOption(value: string): value is HiringSignalOption {
  return HIRING_SIGNAL_OPTIONS.includes(value as HiringSignalOption);
}

function normalizeTraits(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: HiringSignalOption[] = [];

  for (const item of value) {
    const text = normalizeText(item);
    if (!isHiringSignalOption(text)) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
  }

  return normalized;
}

function getHiringSignalOptionsForRole(
  roleFocus: string,
  limit = 4
) {
  const normalizedRole = normalizeText(roleFocus).toLowerCase();

  const prioritize = (...prioritized: HiringSignalOption[]) => {
    const seen = new Set<string>();
    const merged = [...prioritized, ...HIRING_SIGNAL_OPTIONS];

    return merged
      .filter((trait) => {
        const key = trait.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  };

  if (
    /(software|engineer|developer|frontend|backend|full stack|data|analyst|qa|devops|designer)/.test(
      normalizedRole
    )
  ) {
    return prioritize(
      "I'm technical",
      "I solve problems calmly",
      "I learn fast",
      "I'm adaptable",
      "I hit goals"
    );
  }

  if (
    /(customer support|customer service|support|retail|barista|cashier|server|host|crew|restaurant|food|hospitality|sales|associate)/.test(
      normalizedRole
    )
  ) {
    return prioritize(
      "I work well with people",
      "I'm reliable",
      "I solve problems calmly",
      "I'm adaptable",
      "I show up and get it done"
    );
  }

  if (
    /(warehouse|logistics|delivery|driver|forklift|stock|inventory|fulfillment|manufacturing|picker|packer)/.test(
      normalizedRole
    )
  ) {
    return prioritize(
      "I'm reliable",
      "I show up and get it done",
      "I'm organized",
      "I learn fast",
      "I hit goals"
    );
  }

  if (
    /(administrative|assistant|office|coordinator|scheduler|receptionist|operations)/.test(
      normalizedRole
    )
  ) {
    return prioritize(
      "I'm organized",
      "I'm reliable",
      "I work well with people",
      "I learn fast",
      "I hit goals"
    );
  }

  if (
    /(nurse|medical|healthcare|cna|caregiver|patient|phlebotom|dental|clinic|hospital)/.test(
      normalizedRole
    )
  ) {
    return prioritize(
      "I'm reliable",
      "I work well with people",
      "I solve problems calmly",
      "I show up and get it done",
      "I'm adaptable"
    );
  }

  if (
    /(electrician|plumber|hvac|maintenance|mechanic|construction|technician|installer|welder|carpenter|trade)/.test(
      normalizedRole
    )
  ) {
    return prioritize(
      "I'm technical",
      "I'm reliable",
      "I show up and get it done",
      "I solve problems calmly",
      "I'm adaptable"
    );
  }

  if (
    /(manager|supervisor|lead|director|head|owner|product manager|project manager|program manager)/.test(
      normalizedRole
    )
  ) {
    return prioritize(
      "I've led or trained others",
      "I hit goals",
      "I'm organized",
      "I work well with people",
      "I solve problems calmly"
    );
  }

  return prioritize(
    "I learn fast",
    "I'm reliable",
    "I work well with people",
    "I'm adaptable",
    "I show up and get it done"
  );
}

export default function HiringSignalStep() {
  const router = useRouter();
  const [roleFocus, setRoleFocus] = useState("");
  const [selectedTraits, setSelectedTraits] = useState<HiringSignalOption[]>([]);
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = ONBOARDING_FLOW_ROUTES.indexOf(HIRING_SIGNAL_ROUTE) + 1;
  const progressPercent = useMemo(
    () =>
      Math.max(
        8,
        Math.round((currentStep / ONBOARDING_FLOW_ROUTES.length) * 100)
      ),
    [currentStep]
  );
  const displayTraits = useMemo(
    () => getHiringSignalOptionsForRole(roleFocus),
    [roleFocus]
  );
  const canContinue = selectedTraits.length > 0;

  useEffect(() => {
    let active = true;

    async function loadSavedState() {
      try {
        const response = await fetch("/api/profile/preferences", {
          cache: "no-store",
          credentials: "include",
        });

        const data = (await response.json().catch(() => null)) as
          | PreferencesResponse
          | null;

        if (!active || !response.ok || !data?.preferences) {
          return;
        }

        const nextRoleFocus = normalizeText(data.preferences.roleFocus);
        const nextSavedTraits = normalizeTraits(data.preferences.hiringSignalTraits);
        const nextDisplayTraits = getHiringSignalOptionsForRole(nextRoleFocus);

        setRoleFocus(nextRoleFocus);
        setSelectedTraits(
          nextSavedTraits.filter((trait) => nextDisplayTraits.includes(trait))
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
  }, []);

  useEffect(() => {
    setSelectedTraits((current) => {
      const nextTraits = current.filter((trait) => displayTraits.includes(trait));
      return nextTraits.length === current.length ? current : nextTraits;
    });
  }, [displayTraits]);

  function handleBack() {
    router.push(JOB_LOCATION_ROUTE);
  }

  function handleToggleTrait(trait: HiringSignalOption) {
    setError(null);
    setSelectedTraits((current) =>
      current.includes(trait)
        ? current.filter((item) => item !== trait)
        : [...current, trait]
    );
  }

  async function handleContinue() {
    if (!canContinue) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          hiringSignalTraits: selectedTraits,
          hiringSignalEmphasis: "",
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error ?? "We could not save your hiring signal yet."
        );
      }

      router.push(CREATE_ACCOUNT_ROUTE);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your hiring signal yet."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#edf4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:justify-center lg:py-12">
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Hiring Signal</span>
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

            <div className="mt-6 rounded-[28px] border border-sky-100 bg-[radial-gradient(circle_at_top,rgba(20,94,252,0.09),transparent_55%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5">
              <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                Stronger Positioning
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                What&apos;s something that makes you a strong hire?
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                <span className="sm:hidden">
                  Pick the strengths you want Hirexa to emphasize.
                </span>
                <span className="hidden sm:inline">
                  This can be experience, reliability, speed, leadership,
                  results, or willingness to learn.
                </span>
              </p>
              {roleFocus ? (
                <p className="mt-2 text-sm text-slate-500">
                  Suggestions are tuned for {roleFocus}.
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {displayTraits.map((trait) => {
                const isSelected = selectedTraits.includes(trait);

                return (
                  <button
                    key={trait}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleToggleTrait(trait)}
                    className={cn(
                      "flex min-h-14 w-full items-center justify-between gap-3 rounded-[24px] border px-4 py-3.5 text-left text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:text-[15px]",
                      isSelected
                        ? "border-sky-500 bg-sky-50 text-slate-950 shadow-[0_18px_40px_-32px_rgba(14,165,233,0.95)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <span className="flex-1">{trait}</span>
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

            {error ? (
              <div
                className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <div className="pt-6">
              <Button
                type="button"
                size="lg"
                disabled={!canContinue || saving}
                onClick={handleContinue}
                className="h-[52px] w-full rounded-2xl bg-[#145efc] text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6]"
              >
                {saving ? "Saving..." : "Finish setup"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
