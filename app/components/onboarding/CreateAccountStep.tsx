"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { getProviders } from "next-auth/react";
import {
  ArrowLeftIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

import AppleButton from "@/app/components/loginForm/AppleButton";
import GoogleButton from "@/app/components/loginForm/GoogleButton";
import LinkedInButton from "@/app/components/loginForm/LinkedInButton";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  CREATE_ACCOUNT_ROUTE,
  HIRING_SIGNAL_ROUTE,
  PRIMARY_ONBOARDING_FLOW_ROUTES,
  VERIFY_ACCOUNT_ROUTE,
} from "@/app/lib/onboarding-flow";
import {
  clearPendingOnboardingSignup,
  readPendingOnboardingSignup,
  writePendingOnboardingSignup,
} from "@/app/lib/auth/onboardingPendingSignup";
import { normalizePhoneForSms } from "@/app/lib/verification/phone";

type DraftResponse = {
  draft?: {
    payload?: {
      profile?: {
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;
      signup?: {
        phone?: string | null;
        verificationChannel?: "email" | "sms" | null;
      } | null;
    } | null;
  } | null;
};

type FieldErrors = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
};

function scorePassword(password: string) {
  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const passed = Object.values(rules).filter(Boolean).length;
  return {
    passed,
    label:
      passed <= 2
        ? "Weak"
        : passed === 3
          ? "Okay"
          : passed === 4
            ? "Good"
            : "Strong",
  };
}

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value.trim());
}

function getCreateAccountProgressPercent() {
  const totalSteps = PRIMARY_ONBOARDING_FLOW_ROUTES.length + 2;
  const createStep = PRIMARY_ONBOARDING_FLOW_ROUTES.indexOf(HIRING_SIGNAL_ROUTE) + 2;

  return Math.max(8, Math.round((createStep / totalSteps) * 100));
}

export default function CreateAccountStep() {
  const router = useRouter();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationChannel, setVerificationChannel] = useState<"email" | "sms">(
    "email"
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [oauthProviderIds, setOauthProviderIds] = useState<string[]>([]);

  const passwordScore = useMemo(() => scorePassword(password), [password]);
  const progressPercent = useMemo(() => getCreateAccountProgressPercent(), []);
  const googleProviderEnabled = oauthProviderIds.includes("google");
  const appleProviderEnabled = oauthProviderIds.includes("apple");
  const linkedInProviderEnabled = oauthProviderIds.includes("linkedin");

  useEffect(() => {
    let active = true;

    const pending = readPendingOnboardingSignup();
    if (pending) {
      setFirstName(pending.firstName);
      setLastName(pending.lastName);
      setEmail(pending.email);
      setPhone(pending.phone);
      setPassword(pending.password);
      setConfirmPassword(pending.password);
      setVerificationChannel(pending.verificationChannel);
      setLoadingDefaults(false);
      setDraftHydrated(true);
      return () => {
        active = false;
      };
    }

    async function loadProfileDefaults() {
      try {
        const response = await fetch("/api/onboarding/draft", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await response.json().catch(() => null)) as DraftResponse | null;

        if (!active || !response.ok || !data?.draft?.payload?.profile) {
          return;
        }

        setFirstName((current) =>
          current || String(data.draft?.payload?.profile?.firstName ?? "").trim()
        );
        setLastName((current) =>
          current || String(data.draft?.payload?.profile?.lastName ?? "").trim()
        );
        setEmail((current) =>
          current || String(data.draft?.payload?.profile?.email ?? "").trim()
        );
        setPhone((current) => {
          const nextPhone =
            String(data.draft?.payload?.signup?.phone ?? "").trim() ||
            String(data.draft?.payload?.profile?.phone ?? "").trim();
          return current || nextPhone;
        });
        setVerificationChannel(
          data.draft?.payload?.signup?.verificationChannel === "sms"
            ? "sms"
            : "email"
        );
      } finally {
        if (active) {
          setLoadingDefaults(false);
          setDraftHydrated(true);
        }
      }
    }

    void loadProfileDefaults();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getProviders()
      .then((providers) => {
        if (!active) return;

        const nextProviders = Object.values(providers ?? {})
          .filter((provider) => provider.id !== "credentials")
          .map((provider) => provider.id);

        setOauthProviderIds(nextProviders);
      })
      .catch(() => {
        if (active) {
          setOauthProviderIds([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetch("/api/onboarding/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lastStep: CREATE_ACCOUNT_ROUTE,
          payload: {
            profile: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim(),
              phone: phone.trim(),
            },
            signup: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim().toLowerCase(),
              phone: phone.trim(),
              verificationChannel,
            },
          },
        }),
      }).catch(() => {});
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [draftHydrated, email, firstName, lastName, phone, verificationChannel]);

  function handleBack() {
    router.push(HIRING_SIGNAL_ROUTE);
  }

  function validateFields() {
    const nextErrors: FieldErrors = {};

    if (!firstName.trim()) {
      nextErrors.firstName = "First name is required.";
    }

    if (!lastName.trim()) {
      nextErrors.lastName = "Last name is required.";
    }

    if (!isValidEmail(email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (phone.trim() && !normalizePhoneForSms(phone)) {
      nextErrors.phone = "Please enter a valid phone number.";
    }

    if (verificationChannel === "sms" && !normalizePhoneForSms(phone)) {
      nextErrors.phone = "Please enter a valid phone number.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (passwordScore.passed < 4) {
      nextErrors.password =
        "Use 8+ characters with uppercase, lowercase, a number, and a symbol.";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    setMessage(null);
    if (!validateFields()) return;

    setLoading(true);

    try {
      if (!executeRecaptcha) {
        throw new Error("Security check not ready. Try again.");
      }

      const recaptchaToken = await executeRecaptcha("signup_init");
      const response = await fetch("/api/auth/register/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          password,
          verificationChannel,
          recaptchaToken,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "We could not start account setup.");
      }

      writePendingOnboardingSignup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        verificationChannel,
      });

      router.push(VERIFY_ACCOUNT_ROUTE);
    } catch (submitError) {
      setMessage(
        submitError instanceof Error
          ? submitError.message
          : "We could not start account setup."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#edf4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:justify-center lg:py-12">
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Account Setup</span>
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

        <div className="mx-auto mt-4 w-full max-w-2xl sm:mt-6">
          <section
            className={cn(
              "rounded-[28px] border border-slate-200/80 bg-white p-3.5 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)] sm:rounded-[32px] sm:p-8",
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

            <div className="mt-3 rounded-[22px] border border-sky-100 bg-[radial-gradient(circle_at_top,rgba(20,94,252,0.09),transparent_55%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 sm:mt-6 sm:rounded-[28px] sm:p-5">
              <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-700 sm:px-3 sm:py-1 sm:text-[11px] sm:tracking-[0.18em]">
                Final Unlock
              </span>
              <h1 className="mt-2 text-[1.45rem] font-semibold leading-tight tracking-tight text-slate-950 sm:mt-4 sm:text-4xl">
                Save your progress and unlock your matches
              </h1>
              <p className="mt-1.5 max-w-xl text-[12px] leading-[1.15rem] text-slate-600 sm:mt-3 sm:text-base sm:leading-6">
                Create your account so Hirexa can save your profile, keep your filters,
                and track your best-fit jobs.
              </p>
            </div>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-500">Or continue with</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <GoogleButton
                callbackUrl="/dashboard"
                disabled={loading || !googleProviderEnabled}
                onBeforeSignIn={clearPendingOnboardingSignup}
                className="h-12"
              />
              <AppleButton
                callbackUrl="/dashboard"
                disabled={loading || !appleProviderEnabled}
                onBeforeSignIn={clearPendingOnboardingSignup}
                className="h-12"
              />
              <LinkedInButton
                callbackUrl="/dashboard"
                disabled={loading || !linkedInProviderEnabled}
                onBeforeSignIn={clearPendingOnboardingSignup}
                className="h-12 sm:col-span-2"
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5">
              <div>
                <label
                  htmlFor="create-account-first-name"
                  className="text-sm font-medium text-slate-700"
                >
                  First name
                </label>
                <input
                  id="create-account-first-name"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                {fieldErrors.firstName ? (
                  <p className="mt-2 text-sm text-red-600">{fieldErrors.firstName}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="create-account-last-name"
                  className="text-sm font-medium text-slate-700"
                >
                  Last name
                </label>
                <input
                  id="create-account-last-name"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                {fieldErrors.lastName ? (
                  <p className="mt-2 text-sm text-red-600">{fieldErrors.lastName}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 sm:mt-5">
              <label
                htmlFor="create-account-email"
                className="text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="create-account-email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="email"
                spellCheck={false}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              {fieldErrors.email ? (
                <p className="mt-2 text-sm text-red-600">{fieldErrors.email}</p>
              ) : null}
            </div>

            <div className="mt-4 sm:mt-5">
              <label
                htmlFor="create-account-phone"
                className="text-sm font-medium text-slate-700"
              >
                Phone number
              </label>
              <input
                id="create-account-phone"
                autoComplete="tel"
                inputMode="tel"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(555) 123-4567"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                By adding your phone number, you agree to receive verification
                text messages from Hirexa AI. Message and data rates may apply.
              </p>
              {fieldErrors.phone ? (
                <p className="mt-2 text-sm text-red-600">{fieldErrors.phone}</p>
              ) : null}
            </div>

            <div className="mt-4 sm:mt-5">
              <p className="text-sm font-medium text-slate-700">
                Send my verification code by
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setVerificationChannel("email")}
                  className={cn(
                    "h-12 rounded-2xl border px-4 text-sm font-semibold transition",
                    verificationChannel === "email"
                      ? "border-sky-500 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationChannel("sms")}
                  className={cn(
                    "h-12 rounded-2xl border px-4 text-sm font-semibold transition",
                    verificationChannel === "sms"
                      ? "border-sky-500 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  SMS
                </button>
              </div>
            </div>

            <div className="mt-4 sm:mt-5">
              <label
                htmlFor="create-account-password"
                className="text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <div className="relative mt-2">
                <input
                  id="create-account-password"
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-14 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className="relative mt-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5 sm:hidden">
                <div className="flex items-center gap-3">
                  <div className="grid flex-1 grid-cols-5 gap-1.5">
                    {Array.from({ length: 5 }, (_, index) => (
                      <div
                        key={index}
                        className={cn(
                          "h-1.5 rounded-full transition-colors",
                          index < passwordScore.passed
                            ? "bg-sky-500"
                            : "bg-slate-200"
                        )}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPasswordHelp((current) => !current)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    aria-expanded={showPasswordHelp}
                    aria-controls="mobile-password-help"
                  >
                    <InformationCircleIcon className="h-4 w-4" />
                    <span className="sr-only">Show password requirements</span>
                  </button>
                </div>
                {showPasswordHelp ? (
                  <div
                    id="mobile-password-help"
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-56 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-4 text-slate-600 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)]"
                  >
                    Use 8+ characters with uppercase, lowercase, a number, and a
                    symbol.
                  </div>
                ) : null}
              </div>
              <div className="mt-3 hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:block">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-500">Password strength</span>
                  <span className="text-slate-700">{passwordScore.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {Array.from({ length: 5 }, (_, index) => (
                    <div
                      key={index}
                      className={cn(
                        "h-2 rounded-full transition-colors",
                        index < passwordScore.passed
                          ? "bg-sky-500"
                          : "bg-slate-200"
                      )}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Use 8+ characters with uppercase, lowercase, a number, and a
                  symbol.
                </p>
              </div>
              {fieldErrors.password ? (
                <p className="mt-2 text-sm text-red-600">{fieldErrors.password}</p>
              ) : null}
            </div>

            <div className="mt-4 sm:mt-5">
              <label
                htmlFor="create-account-confirm-password"
                className="text-sm font-medium text-slate-700"
              >
                Confirm password
              </label>
              <div className="relative mt-2">
                <input
                  id="create-account-confirm-password"
                  autoComplete="new-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-14 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.confirmPassword ? (
                <p className="mt-2 text-sm text-red-600">
                  {fieldErrors.confirmPassword}
                </p>
              ) : null}
            </div>

            {message ? (
              <div
                className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                role="alert"
              >
                {message}
              </div>
            ) : null}

            <div className="pt-5 sm:pt-8">
              <Button
                type="button"
                size="lg"
                disabled={loading}
                onClick={handleSubmit}
                className="h-[52px] w-full rounded-2xl bg-[#145efc] text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6]"
              >
                {loading ? "Sending code..." : "Unlock my matches"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
