"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  HIREXA_SUPPORT_EXTRAS_ROUTE,
  HIREXA_SUPPORT_ROUTE,
  HIRING_SIGNAL_ROUTE,
  ONBOARDING_FLOW_ROUTES,
  getNextOnboardingRoute,
  getPreviousOnboardingRoute,
} from "@/app/lib/onboarding-flow";
import {
  getSupportExtrasForRole,
  getDisplaySupportExtras,
  normalizeSupportExtras,
  normalizeSupportText,
  type SupportExtra,
} from "@/app/lib/onboarding/hirexaSupportOptions";

type PreferencesResponse = {
  ok?: boolean;
  preferences?: {
    roleFocus?: string;
    hirexaSupportLevel?: string;
    hirexaSupportExtras?: string[];
  };
  error?: string;
};

export default function HirexaSupportExtrasStep() {
  const router = useRouter();
  const [roleFocus, setRoleFocus] = useState("");
  const [supportLevel, setSupportLevel] = useState("");
  const [selectedExtras, setSelectedExtras] = useState<SupportExtra[]>([]);
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep =
    ONBOARDING_FLOW_ROUTES.indexOf(HIREXA_SUPPORT_EXTRAS_ROUTE) + 1;
  const progressPercent = useMemo(
    () =>
      Math.max(
        8,
        Math.round((currentStep / ONBOARDING_FLOW_ROUTES.length) * 100)
      ),
    [currentStep]
  );
  const displayExtras = useMemo(
    () => getDisplaySupportExtras(roleFocus, selectedExtras),
    [roleFocus, selectedExtras]
  );

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

        const nextLevel = normalizeSupportText(data.preferences.hirexaSupportLevel);
        if (!nextLevel) {
          router.replace(HIREXA_SUPPORT_ROUTE);
          return;
        }

        const nextRoleFocus = normalizeSupportText(data.preferences.roleFocus);
        const savedExtras = normalizeSupportExtras(data.preferences.hirexaSupportExtras);
        const roleLedExtras = getSupportExtrasForRole(nextRoleFocus);
        const roleLedKeys = new Set(
          roleLedExtras.map((extra) => extra.toLowerCase())
        );

        setRoleFocus(nextRoleFocus);
        setSupportLevel(nextLevel);
        setSelectedExtras(
          savedExtras.filter((extra) => roleLedKeys.has(extra.toLowerCase()))
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

  function handleBack() {
    router.push(
      getPreviousOnboardingRoute(HIREXA_SUPPORT_EXTRAS_ROUTE) ??
        HIREXA_SUPPORT_ROUTE
    );
  }

  function handleToggleExtra(extra: SupportExtra) {
    setError(null);
    setSelectedExtras((current) =>
      current.includes(extra)
        ? current.filter((item) => item !== extra)
        : [...current, extra]
    );
  }

  async function handleContinue() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          hirexaSupportLevel: supportLevel,
          hirexaSupportExtras: selectedExtras,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error ?? "We could not save your Hirexa support preferences yet."
        );
      }

      router.push(
        getNextOnboardingRoute(HIREXA_SUPPORT_EXTRAS_ROUTE) ??
          HIRING_SIGNAL_ROUTE
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your Hirexa support preferences yet."
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
            <span>Extra Support</span>
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
                Optional Extras
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Want help with any of these too?
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                You picked {supportLevel}. Add any extra support you want Hirexa to
                layer on top.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {roleFocus
                  ? `These suggestions are tuned for ${roleFocus}.`
                  : "These suggestions are based on the kind of support most job seekers ask Hirexa for next."}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {displayExtras.map((extra) => {
                const isSelected = selectedExtras.includes(extra);

                return (
                  <button
                    key={extra}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleToggleExtra(extra)}
                    className={cn(
                      "inline-flex min-h-12 items-center gap-2 rounded-full border px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
                      isSelected
                        ? "border-sky-500 bg-sky-50 text-slate-950"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-sky-500 bg-sky-500 text-white"
                          : "border-slate-300 text-transparent"
                      )}
                      aria-hidden="true"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                    {extra}
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
                disabled={saving}
                onClick={handleContinue}
                className="h-[52px] w-full rounded-2xl bg-[#145efc] text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6]"
              >
                {saving ? "Saving..." : "Set my preferences"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
