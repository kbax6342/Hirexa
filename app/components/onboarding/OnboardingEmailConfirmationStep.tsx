"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/app/components/ui/button";

type OnboardingEmailConfirmationStepProps = {
  email: string | null;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  nextUrl?: string;
  retryAfterSeconds?: number;
};

export default function OnboardingEmailConfirmationStep({
  email,
}: OnboardingEmailConfirmationStepProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [sentOnLoad, setSentOnLoad] = useState(false);

  const cooldownSeconds = useMemo(
    () => Math.max(0, Math.ceil((cooldownUntil - now) / 1000)),
    [cooldownUntil, now]
  );

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [cooldownSeconds]);

  const sendCode = useCallback(async () => {
    if (sending || cooldownSeconds > 0) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/onboarding/send-confirmation-code", {
        method: "POST",
        credentials: "include",
      });
      const data = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !data?.ok) {
        if (response.status === 429 && data?.retryAfterSeconds) {
          setCooldownUntil(Date.now() + data.retryAfterSeconds * 1000);
        }
        throw new Error(data?.error ?? "Could not send the confirmation code.");
      }

      setMessage("We sent a confirmation code to your email.");
      setCooldownUntil(Date.now() + 60 * 1000);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send the confirmation code."
      );
    } finally {
      setSending(false);
    }
  }, [cooldownSeconds, sending]);

  useEffect(() => {
    if (sentOnLoad) return;
    setSentOnLoad(true);
    void sendCode();
  }, [sendCode, sentOnLoad]);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.replace(/\D/g, "").slice(0, 6);

    setCode(normalizedCode);
    setError(null);
    setMessage(null);

    if (normalizedCode.length !== 6) {
      setError("Enter the 6-digit confirmation code.");
      return;
    }

    setVerifying(true);

    try {
      const response = await fetch("/api/onboarding/verify-confirmation-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const data = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? "Could not verify the confirmation code.");
      }

      setMessage("Email confirmed. Redirecting to your dashboard...");
      router.replace(data.nextUrl ?? "/dashboard");
      router.refresh();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Could not verify the confirmation code."
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl items-center">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-blue-950/10 sm:p-8">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
              Final Step
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
              Confirm your email to continue
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Enter the 6-digit code we sent to your email so we can finish
              setting up your Hirexa AI account.
            </p>
            {email ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                Code sent to {email}
              </p>
            ) : null}
          </div>

          <form className="space-y-5" onSubmit={handleVerify}>
            <div>
              <label
                className="mb-2 block text-sm font-semibold text-slate-700"
                htmlFor="onboarding-confirmation-code"
              >
                Confirmation code
              </label>
              <input
                id="onboarding-confirmation-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl font-semibold tracking-[0.32em] text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="000000"
              />
            </div>

            {message ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700"
              disabled={verifying}
            >
              {verifying ? "Verifying..." : "Verify and go to dashboard"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-xl border-slate-300 text-base font-semibold"
              disabled={sending || cooldownSeconds > 0}
              onClick={() => void sendCode()}
            >
              {sending
                ? "Sending..."
                : cooldownSeconds > 0
                  ? `Resend code in ${cooldownSeconds}s`
                  : "Resend code"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
