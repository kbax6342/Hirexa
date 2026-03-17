"use client";

import { useMemo, useState } from "react";
import { ArrowPathIcon, LifebuoyIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";

type ManagedProductKey = "hirexa_core" | "hirepilot_monthly";
type CancellationStep = "intent" | "retention" | "confirm" | "success";

const RETENTION_REASONS = [
  { value: "cost", label: "Cost is too high" },
  { value: "not_using", label: "Not using it enough" },
  { value: "taking_break", label: "Just taking a break" },
  { value: "technical", label: "Technical problems" },
  { value: "other", label: "Other" },
] as const;

function retentionMessage(args: {
  productKey: ManagedProductKey;
  reason: string;
  purchasedCreditsRemaining: number;
}) {
  if (args.reason === "cost") {
    return "You can keep access through the end of the current billing period and turn off auto-renew without losing the rest of this cycle.";
  }

  if (args.reason === "not_using") {
    return args.productKey === "hirepilot_monthly" && args.purchasedCreditsRemaining > 0
      ? `You can cancel auto-renew now and still keep your ${args.purchasedCreditsRemaining} purchased HirePilot credits until they expire.`
      : "You can cancel auto-renew now and come back later without losing access for the rest of this billing period.";
  }

  if (args.reason === "taking_break") {
    return "Canceling at period end is the lightest option if you just want to pause and avoid the next renewal.";
  }

  if (args.reason === "technical") {
    return "If something is broken, support can help before you lose access. You can still cancel at period end if you prefer.";
  }

  return "You can go back at any time before confirming. Nothing changes until you finish the final cancellation step.";
}

export default function CancelSubscriptionModal({
  productKey,
  productLabel,
  currentPeriodEnd,
  purchasedCreditsRemaining = 0,
  triggerClassName,
  onCancelled,
}: {
  productKey: ManagedProductKey;
  productLabel: string;
  currentPeriodEnd?: string | null;
  purchasedCreditsRemaining?: number;
  triggerClassName?: string;
  onCancelled?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<CancellationStep>("intent");
  const [reason, setReason] = useState<string>("cost");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const currentPeriodLabel = useMemo(() => {
    if (!currentPeriodEnd) return "the end of your current billing period";
    const date = new Date(currentPeriodEnd);
    if (Number.isNaN(date.getTime())) return "the end of your current billing period";
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [currentPeriodEnd]);

  function reset() {
    setStep("intent");
    setReason("cost");
    setLoading(false);
    setError(null);
    setSuccessMessage(null);
  }

  async function confirmCancellation() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productKey,
          reason,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string; portalUrl?: string }
        | null;

      if (!response.ok || !data?.ok) {
        if (data?.portalUrl) {
          window.location.href = data.portalUrl;
          return;
        }

        throw new Error(data?.error ?? "Unable to cancel this subscription right now.");
      }

      setSuccessMessage(
        data?.message ??
          `${productLabel} will stay active through ${currentPeriodLabel} and then cancel.`
      );
      setStep("success");
      onCancelled?.();
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to cancel this subscription right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={triggerClassName}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <XCircleIcon className="h-4 w-4" />
        {`Cancel ${productLabel}`}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{`Cancel ${productLabel}`}</DialogTitle>
            <DialogDescription>
              Changes will take effect at the end of your current billing period unless billing
              support tells you otherwise.
            </DialogDescription>
          </DialogHeader>

          {step === "intent" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                You will keep access through <strong>{currentPeriodLabel}</strong>. Billing will
                stop after that unless you reactivate before the renewal date.
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <p>Before you cancel, you can still:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Keep access until period end</li>
                  <li>Use the billing portal to review payment settings</li>
                  {productKey === "hirepilot_monthly" && purchasedCreditsRemaining > 0 ? (
                    <li>Keep your purchased HirePilot credits after cancellation</li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}

          {step === "retention" ? (
            <div className="space-y-4">
              <div className="text-sm font-semibold text-slate-900">What best describes why you’re leaving?</div>
              <div className="grid gap-2">
                {RETENTION_REASONS.map((item) => (
                  <label
                    key={item.value}
                    className={[
                      "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                      reason === item.value
                        ? "border-blue-300 bg-blue-50 text-blue-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="cancel-reason"
                      checked={reason === item.value}
                      onChange={() => setReason(item.value)}
                      className="mt-1"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <LifebuoyIcon className="h-4 w-4" />
                  Before you finish
                </div>
                <p className="mt-2 leading-6">
                  {retentionMessage({
                    productKey,
                    reason,
                    purchasedCreditsRemaining,
                  })}
                </p>
              </div>
            </div>
          ) : null}

          {step === "confirm" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Final check: <strong>{productLabel}</strong> will stay active through{" "}
                <strong>{currentPeriodLabel}</strong>, then auto-renew will stop.
              </div>
              {productKey === "hirepilot_monthly" && purchasedCreditsRemaining > 0 ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                  Your purchased HirePilot credits will remain available after the subscription ends
                  until their expiration date.
                </div>
              ) : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>
          ) : null}

          {step === "success" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                {successMessage}
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {step === "intent" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Keep my subscription
                </Button>
                <Button type="button" onClick={() => setStep("retention")}>
                  Continue
                </Button>
              </>
            ) : null}

            {step === "retention" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setStep("intent")}>
                  Back
                </Button>
                <Button type="button" onClick={() => setStep("confirm")}>
                  Continue to cancel
                </Button>
              </>
            ) : null}

            {step === "confirm" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setStep("retention")}>
                  Back
                </Button>
                <Button type="button" disabled={loading} onClick={() => void confirmCancellation()}>
                  {loading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Confirm cancellation"
                  )}
                </Button>
              </>
            ) : null}

            {step === "success" ? (
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
