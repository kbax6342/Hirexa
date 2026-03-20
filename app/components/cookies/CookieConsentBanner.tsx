"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/app/components/ui/button";
import type { CookieConsent } from "@/app/lib/cookies/consent";

type Props = {
  ready: boolean;
  consent: CookieConsent | null;
  onAcceptAll: () => void;
  onRejectNonEssential: () => void;
  onSavePreferences: (preferences: { analytics: boolean }) => void;
};

export default function CookieConsentBanner({
  ready,
  consent,
  onAcceptAll,
  onRejectNonEssential,
  onSavePreferences,
}: Props) {
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  if (!ready || consent) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="mx-auto max-w-5xl rounded-[28px] border border-slate-200 bg-white/95 p-5 text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              Cookie Preferences
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              We use essential cookies to keep Hirexa working and optional
              analytics to improve the site.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You can accept all cookies, reject non-essential cookies, or
              manage your preferences. See our{" "}
              <Link
                href="/privacy/"
                className="font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
              >
                Privacy Policy
              </Link>{" "}
              for more detail.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={() => setPreferencesOpen((open) => !open)}
            >
              Manage preferences
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={onRejectNonEssential}
            >
              Reject non-essential
            </Button>
            <Button
              type="button"
              className="rounded-full bg-sky-600 text-white hover:bg-sky-700"
              onClick={onAcceptAll}
            >
              Accept all
            </Button>
          </div>
        </div>

        {preferencesOpen ? (
          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Strictly necessary
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Required for core functionality like sessions, security, and
                    navigation state.
                  </p>
                </div>
                <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Always active
                </span>
              </div>

              <label className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="pr-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Analytics
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Helps us understand site performance and improve the
                    marketing experience over time.
                  </p>
                </div>

                <span className="inline-flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {analyticsEnabled ? "On" : "Off"}
                  </span>
                  <input
                    type="checkbox"
                    checked={analyticsEnabled}
                    onChange={(event) =>
                      setAnalyticsEnabled(event.currentTarget.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                className="rounded-full bg-sky-600 text-white hover:bg-sky-700"
                onClick={() =>
                  onSavePreferences({ analytics: analyticsEnabled })
                }
              >
                Save preferences
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full text-slate-600 hover:bg-white"
                onClick={() => setPreferencesOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
