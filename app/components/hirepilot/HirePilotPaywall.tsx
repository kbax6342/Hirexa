"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  CreditCardIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

type HirePilotPaywallProps = {
  onClose?: () => void;
};

type HirePilotStatusResponse = {
  hasHirePilotAccess?: boolean;
  hirePilotUnlimited: boolean;
  hirePilotCredits: number;
  productKey?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  error?: string;
};

async function createCheckout(path: string) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = (await res.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;

  if (!res.ok || !data?.url) {
    throw new Error(data?.error ?? "Unable to start checkout.");
  }

  window.location.assign(data.url);
}

async function refreshHirePilotStatus() {
  const res = await fetch("/api/user/hirepilot-status", {
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as HirePilotStatusResponse | null;

  if (!res.ok) {
    throw new Error(data?.error ?? "Unable to verify HirePilot access.");
  }

  return {
    hasHirePilotAccess:
      Boolean(data?.hasHirePilotAccess) ||
      Boolean(data?.hirePilotUnlimited) ||
      Number(data?.hirePilotCredits ?? 0) > 0,
    hirePilotUnlimited: Boolean(data?.hirePilotUnlimited),
    hirePilotCredits: Number(data?.hirePilotCredits ?? 0),
  };
}

export default function HirePilotPaywall({ onClose }: HirePilotPaywallProps) {
  const [loadingAction, setLoadingAction] = useState<"subscription" | "credit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(action: "subscription" | "credit") {
    if (loadingAction) {
      return;
    }

    setLoadingAction(action);
    setError(null);

    try {
      const status = await refreshHirePilotStatus();
      const hasActiveSubscription = status.hirePilotUnlimited;
      const hasUsableCreditAccess = status.hasHirePilotAccess;

      if (
        (action === "subscription" && hasActiveSubscription) ||
        (action === "credit" && hasUsableCreditAccess)
      ) {
        setLoadingAction(null);
        onClose?.();
        return;
      }

      await createCheckout(
        action === "subscription"
          ? "/api/stripe/create-hirepilot-subscription"
          : "/api/stripe/create-hirepilot-credit"
      );
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to start checkout."
      );
      setLoadingAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-6 py-10 backdrop-blur-sm">
      <Card className="w-full max-w-4xl border-slate-200 bg-white shadow-2xl">
        <CardHeader className="border-b border-slate-200 bg-slate-50">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
                <SparklesIcon className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl text-slate-950">Unlock HirePilot</CardTitle>
                <p className="max-w-2xl text-sm text-slate-600">
                  AI-powered real-time interview assistant powered by your Hirexa
                  profile.
                </p>
              </div>
            </div>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                aria-label="Close HirePilot paywall"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                Option 1
              </div>
              <div className="mt-3 text-2xl font-semibold text-slate-950">
                Unlimited Interviews
              </div>
              <div className="mt-1 text-sm text-slate-600">$9.99 / month</div>

              <Button
                type="button"
                onClick={() => void handleCheckout("subscription")}
                disabled={loadingAction !== null}
                className="mt-6 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              >
                <CreditCardIcon className="h-5 w-5" />
                {loadingAction === "subscription" ? "Checking..." : "Subscribe"}
              </Button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Option 2
              </div>
              <div className="mt-3 text-2xl font-semibold text-slate-950">
                Single Interview
              </div>
              <div className="mt-1 text-sm text-slate-600">$3 per interview</div>

              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCheckout("credit")}
                disabled={loadingAction !== null}
                className="mt-6 w-full rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
              >
                <CreditCardIcon className="h-5 w-5" />
                {loadingAction === "credit" ? "Checking..." : "Buy Credit"}
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-900">
              HirePilot includes
            </div>
            <div className="mt-4 space-y-3">
              {[
                "Real-time interview answers",
                "Powered by your Hirexa profile",
                "Job-specific responses",
                "Live AI coaching",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                >
                  <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-none text-blue-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
