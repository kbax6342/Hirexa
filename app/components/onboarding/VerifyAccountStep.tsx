"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  CREATE_ACCOUNT_ROUTE,
  DASHBOARD_ROUTE,
  HIRING_SIGNAL_ROUTE,
  PRIMARY_ONBOARDING_FLOW_ROUTES,
} from "@/app/lib/onboarding-flow";
import {
  clearPendingOnboardingSignup,
  readPendingOnboardingSignup,
} from "@/app/lib/auth/onboardingPendingSignup";
import { maskPhoneForDisplay } from "@/app/lib/verification/phone";

function getVerifyAccountProgressPercent() {
  const totalSteps = PRIMARY_ONBOARDING_FLOW_ROUTES.length + 2;
  const verifyStep = PRIMARY_ONBOARDING_FLOW_ROUTES.indexOf(HIRING_SIGNAL_ROUTE) + 3;

  return Math.max(8, Math.round((verifyStep / totalSteps) * 100));
}

function resolvePostVerifyRedirect(value: string | null) {
  if (!value) {
    return DASHBOARD_ROUTE;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return DASHBOARD_ROUTE;
  }

  return value;
}

export default function VerifyAccountStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [verificationChannel, setVerificationChannel] = useState<"email" | "sms">(
    "email"
  );
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [destinationLabel, setDestinationLabel] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const progressPercent = useMemo(() => getVerifyAccountProgressPercent(), []);
  const cooldownSeconds = useMemo(
    () => Math.max(0, Math.ceil((cooldownUntil - now) / 1000)),
    [cooldownUntil, now]
  );
  const callbackUrl = useMemo(
    () => resolvePostVerifyRedirect(searchParams.get("callbackUrl")),
    [searchParams]
  );
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [cooldownSeconds]);

  useEffect(() => {
    const pending = readPendingOnboardingSignup();

    if (pending) {
      setEmail(pending.email);
      setPhone(pending.phone);
      setPassword(pending.password);
      setVerificationChannel(pending.verificationChannel);
      setDestinationLabel(
        pending.verificationChannel === "sms"
          ? maskPhoneForDisplay(pending.phone)
          : pending.email
      );
      setLoadingDefaults(false);
      return;
    }

    if (status === "loading") {
      return;
    }

    const sessionEmail = String(session?.user?.email ?? "").trim().toLowerCase();
    if (status === "authenticated" && sessionEmail) {
      setEmail(sessionEmail);
      setPhone("");
      setPassword("");
      setVerificationChannel("email");
      setDestinationLabel(sessionEmail);
      setLoadingDefaults(false);
      return;
    }

    router.replace(CREATE_ACCOUNT_ROUTE);
  }, [router, session?.user?.email, status]);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    let active = true;

    async function loadVerificationContext() {
      try {
        const response = await fetch("/api/auth/register/context", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              channel?: "email" | "sms";
              resolvedChannel?: "email" | "sms";
              destinationLabel?: string | null;
            }
          | null;

        if (!active || !response.ok || !data?.ok) {
          return;
        }

        setVerificationChannel(data.resolvedChannel ?? data.channel ?? "email");
        setDestinationLabel(data.destinationLabel ?? null);
      } catch {
        // Keep the locally inferred destination if the context lookup fails.
      }
    }

    void loadVerificationContext();

    return () => {
      active = false;
    };
  }, [status]);

  function handleBack() {
    router.push(CREATE_ACCOUNT_ROUTE);
  }

  async function handleVerify() {
    setMessage(null);
    setMessageType(null);
    if (code.trim().length !== 6) {
      setMessage("Enter the 6-digit security code.");
      setMessageType("error");
      return;
    }

    setLoading(true);

    try {
      if (!executeRecaptcha) {
        throw new Error("Security check not ready. Try again.");
      }

      const recaptchaToken = await executeRecaptcha("signup_verify");
      const response = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          verificationChannel,
          code: code.trim(),
          recaptchaToken,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Verification failed.");
      }

      if (!isAuthenticated && password) {
        const login = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (login?.error) {
          throw new Error(
            "Your account was verified, but automatic sign-in failed. Please log in."
          );
        }
      }

      clearPendingOnboardingSignup();
      router.push(callbackUrl);
      router.refresh();
    } catch (verifyError) {
      setMessage(
        verifyError instanceof Error
          ? verifyError.message
          : "Verification failed."
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resending || cooldownSeconds > 0) {
      return;
    }

    setMessage(null);
    setMessageType(null);
    setResending(true);

    try {
      if (!executeRecaptcha) {
        throw new Error("Security check not ready. Try again.");
      }

      const recaptchaToken = await executeRecaptcha("signup_resend");
      const response = await fetch("/api/auth/register/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          phone,
          verificationChannel,
          recaptchaToken,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            message?: string;
            channel?: "email" | "sms";
            destinationLabel?: string | null;
            retryAfterSeconds?: number;
          }
        | null;

      if (!response.ok || !data?.ok) {
        if (data?.retryAfterSeconds) {
          setCooldownUntil(Date.now() + data.retryAfterSeconds * 1000);
          setNow(Date.now());
        }
        throw new Error(data?.error ?? "We couldn't send the code. Please try again.");
      }

      setVerificationChannel(data.channel ?? verificationChannel);
      if (data.destinationLabel) {
        setDestinationLabel(data.destinationLabel);
      }
      setCooldownUntil(
        Date.now() + Math.max(1, data.retryAfterSeconds ?? 30) * 1000
      );
      setNow(Date.now());
      setMessage(data.message ?? "Verification code sent.");
      setMessageType("success");
    } catch (resendError) {
      setMessage(
        resendError instanceof Error
          ? resendError.message
          : "We couldn't send the code. Please try again."
      );
      setMessageType("error");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#edf4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:justify-center lg:py-12">
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Verify Account</span>
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

        <div className="mx-auto mt-8 w-full max-w-xl">
          <section
            className={cn(
              "rounded-[32px] border border-slate-200/80 bg-white p-5 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)] sm:p-8",
              loadingDefaults && "opacity-90"
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
                Secure Your Setup
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Check your code
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                We sent a verification code to your{" "}
                {verificationChannel === "sms" ? "phone" : "email"} so we can
                secure your Hirexa account before you continue.
              </p>
              {destinationLabel ? (
                <p className="mt-2 text-sm text-slate-500">{destinationLabel}</p>
              ) : null}
            </div>

            <div className="mt-8">
              <label
                htmlFor="verify-account-code"
                className="text-sm font-medium text-slate-700"
              >
                Security code
              </label>
              <input
                id="verify-account-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 tracking-[0.3em] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={resending || cooldownSeconds > 0}
                  className="text-sm font-medium text-sky-700 transition hover:text-sky-800 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {resending
                    ? "Sending..."
                    : cooldownSeconds > 0
                      ? `Resend code in ${cooldownSeconds}s`
                      : "Resend code"}
                </button>
              </div>
            </div>

            {message ? (
              <div
                className={cn(
                  "mt-6 rounded-2xl px-4 py-3 text-sm",
                  messageType === "error"
                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                )}
                role="alert"
              >
                {message}
              </div>
            ) : null}

            <div className="pt-8">
              <Button
                type="button"
                size="lg"
                disabled={loading || code.trim().length !== 6}
                onClick={handleVerify}
                className="h-[52px] w-full rounded-2xl bg-[#145efc] text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6]"
              >
                {loading ? "Finishing..." : "Finish setup"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
