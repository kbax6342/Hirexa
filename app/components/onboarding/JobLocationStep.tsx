"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import {
  getUSStateOptions,
  normalizeStateInput,
} from "@/app/lib/locationOptions";
import {
  HIRING_SIGNAL_ROUTE,
  ONBOARDING_FLOW_ROUTES,
  WORK_STORY_ROUTE,
} from "@/app/lib/onboarding-flow";
import { cn } from "@/app/lib/utils";

type PreferencesResponse = {
  preferences?: {
    city?: string;
    state?: string;
    postalCode?: string;
  };
  error?: string;
};

type FieldErrors = {
  city?: string;
  state?: string;
  postalCode?: string;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizePostalCode(value: string) {
  return value.trim();
}

function isValidPostalCode(value: string) {
  return /^\d{5}(?:-\d{4})?$/.test(normalizePostalCode(value));
}

function getLocationProgressPercent() {
  const hiringSignalStep = ONBOARDING_FLOW_ROUTES.indexOf(HIRING_SIGNAL_ROUTE) + 1;
  const locationStep = Math.max(1, hiringSignalStep - 1);

  return Math.max(
    8,
    Math.round((locationStep / ONBOARDING_FLOW_ROUTES.length) * 100)
  );
}

export default function JobLocationStep() {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [saving, setSaving] = useState(false);

  const progressPercent = useMemo(() => getLocationProgressPercent(), []);
  const stateOptions = useMemo(() => getUSStateOptions(), []);
  const canContinue =
    normalizeText(city).length > 0 &&
    normalizeText(state).length > 0 &&
    normalizePostalCode(postalCode).length > 0;

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

        setCity(String(data.preferences.city ?? "").trim());
        setState(
          normalizeStateInput(String(data.preferences.state ?? "").trim())?.name ?? ""
        );
        setPostalCode(String(data.preferences.postalCode ?? "").trim());
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

  function handleBack() {
    router.push(WORK_STORY_ROUTE);
  }

  function validateFields() {
    const nextErrors: FieldErrors = {};

    if (!normalizeText(city)) {
      nextErrors.city = "Enter the city you want Hirexa to search around.";
    }

    if (!normalizeText(state)) {
      nextErrors.state = "Enter the state for your job search.";
    } else if (!normalizeStateInput(state)) {
      nextErrors.state = "Select a valid state.";
    }

    if (!normalizePostalCode(postalCode)) {
      nextErrors.postalCode = "Enter your ZIP code.";
    } else if (!isValidPostalCode(postalCode)) {
      nextErrors.postalCode = "Enter a valid ZIP code.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleContinue() {
    setMessage(null);
    if (!validateFields()) return;

    setSaving(true);

    try {
      const matchedState = normalizeStateInput(state);
      const response = await fetch("/api/profile/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          city: normalizeText(city),
          state: matchedState?.code ?? normalizeText(state),
          postalCode: normalizePostalCode(postalCode),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "We could not save your location yet.");
      }

      router.push(HIRING_SIGNAL_ROUTE);
    } catch (submitError) {
      setMessage(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your location yet."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#edf4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:justify-center lg:py-12">
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Job Location</span>
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

        <div className="mx-auto mt-6 w-full max-w-2xl sm:mt-8">
          <section
            className={cn(
              "rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)] sm:rounded-[32px] sm:p-8",
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

            <div className="mt-4 rounded-[24px] border border-sky-100 bg-[radial-gradient(circle_at_top,rgba(20,94,252,0.09),transparent_55%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 sm:mt-6 sm:rounded-[28px] sm:p-5">
              <h1 className="text-[1.8rem] font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Where should we look for jobs?
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 sm:mt-3 sm:text-base">
                We&apos;ll use this to find nearby and regional job matches.
              </p>
            </div>

            <div className="mt-5 space-y-4 sm:mt-8 sm:space-y-5">
              <div>
                <label
                  htmlFor="job-location-city"
                  className="text-sm font-medium text-slate-700"
                >
                  City
                </label>
                <input
                  id="job-location-city"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                {fieldErrors.city ? (
                  <p className="mt-2 text-sm text-red-600">{fieldErrors.city}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-5">
                <div>
                  <label
                    htmlFor="job-location-state"
                    className="text-sm font-medium text-slate-700"
                  >
                    State
                  </label>
                  <input
                    id="job-location-state"
                    list="job-location-state-options"
                    autoComplete="address-level1"
                    placeholder="Start typing a state"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  <datalist id="job-location-state-options">
                    {stateOptions.map((option) => (
                      <option
                        key={option.code}
                        value={option.name}
                        label={option.code}
                      />
                    ))}
                  </datalist>
                  {fieldErrors.state ? (
                    <p className="mt-2 text-sm text-red-600">{fieldErrors.state}</p>
                  ) : null}
                </div>

                <div>
                  <label
                    htmlFor="job-location-postal-code"
                    className="text-sm font-medium text-slate-700"
                  >
                    ZIP code
                  </label>
                  <input
                    id="job-location-postal-code"
                    autoComplete="postal-code"
                    inputMode="numeric"
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  {fieldErrors.postalCode ? (
                    <p className="mt-2 text-sm text-red-600">
                      {fieldErrors.postalCode}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {message ? (
              <div
                className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                role="alert"
              >
                {message}
              </div>
            ) : null}

            <div className="pt-6 sm:pt-8">
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
