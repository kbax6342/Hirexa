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
      <div className="mx-auto max-w-5xl rounded-md border border-slate-200 bg-white p-5 text-black shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-black">
              Cookie Preferences
            </p>
            <h2 className="mt-2 text-lg font-semibold text-black">
              We use essential cookies to keep Hirexa working and optional
              analytics to improve the site.
            </h2>
            <p className="mt-2 text-sm leading-6 text-black">
              You can accept all cookies, reject non-essential cookies, or
              manage your preferences. See our{" "}
              <Link
                href="/privacy/"
                className="font-semibold text-black underline transition hover:text-black"
              >
                Privacy Policy
              </Link>{" "}
              for more detail.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-black bg-white text-black hover:bg-white hover:text-black"
              onClick={() => setPreferencesOpen((open) => !open)}
            >
              Manage Preferences
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-black bg-white text-black hover:bg-white hover:text-black"
              onClick={onRejectNonEssential}
            >
              Reject Non-Essential
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-black bg-white text-black hover:bg-white hover:text-black"
              onClick={onAcceptAll}
            >
              Accept all
            </Button>
          </div>
        </div>

        {preferencesOpen ? (
          <div className="mt-5 rounded-md border border-slate-200 bg-white p-4 text-black sm:p-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-4">
                <div>
                  <h3 className="text-sm font-semibold text-black">
                    Strictly necessary
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-black">
                    Required for core functionality like sessions, security, and
                    navigation state.
                  </p>
                </div>
                <span className="inline-flex w-fit rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-black">
                  Always active
                </span>
              </div>

              <label className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-4">
                <div>
                  <h3 className="text-sm font-semibold text-black">
                    Analytics
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-black">
                    Helps us understand site performance and improve the
                    marketing experience over time.
                  </p>
                </div>

                <span className="inline-flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-black">
                    {analyticsEnabled ? "On" : "Off"}
                  </span>
                  <input
                    type="checkbox"
                    checked={analyticsEnabled}
                    onChange={(event) =>
                      setAnalyticsEnabled(event.currentTarget.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 accent-black focus:ring-black"
                  />
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-black bg-white text-black hover:bg-white hover:text-black"
                onClick={() =>
                  onSavePreferences({ analytics: analyticsEnabled })
                }
              >
                Save preferences
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="bg-white text-black hover:bg-white hover:text-black"
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
