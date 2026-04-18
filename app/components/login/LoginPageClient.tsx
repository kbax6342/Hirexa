"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getProviders, signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import RecruiterAccessNotice from "@/app/components/login/RecruiterAccessNotice";
import AppleButton from "@/app/components/loginForm/AppleButton";
import { GoogleLogo } from "@/app/components/loginForm/GoogleButton";
import LoginForm from "@/app/components/loginForm/LoginForm";
import { Button } from "@/app/components/ui/button";
import { CREATE_ACCOUNT_ROUTE } from "@/app/lib/onboarding-flow";

type OAuthProvider = {
  id: string;
  name: string;
};

type LoginPageClientProps = {
  callbackUrl: string;
  mode?: string | null;
  reason?: string | null;
  showRecruiterAccessNotice?: boolean;
};

const GOOGLE_CALLBACK_URL = "/auth/google/redirect";

export default function LoginPageClient({
  callbackUrl,
  mode,
  reason,
  showRecruiterAccessNotice = false,
}: LoginPageClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isStartingSignup, setIsStartingSignup] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [showRecruiterNotice, setShowRecruiterNotice] = useState(
    showRecruiterAccessNotice
  );
  const isRecruiterMode = mode === "recruiter";
  const safeCallbackUrl = useMemo(
    () => normalizeClientCallbackUrl(
      callbackUrl,
      isRecruiterMode ? "/recruiter/dashboard" : "/resume"
    ),
    [callbackUrl, isRecruiterMode]
  );

  const appleProviderEnabled = oauthProviders.some((provider) => provider.id === "apple");
  const visibleOauthProviders = oauthProviders.filter(
    (provider) => provider.id !== "apple"
  );

  function handleStartSignup() {
    setIsStartingSignup(true);
    router.push(CREATE_ACCOUNT_ROUTE);
  }

  useEffect(() => {
    let active = true;

    void getProviders()
      .then((providers) => {
        if (!active) return;

        const nextProviders = Object.values(providers ?? {})
          .filter((provider) => provider.id !== "credentials")
          .map((provider) => ({ id: provider.id, name: provider.name }));

        setOauthProviders(nextProviders);
      })
      .catch(() => {
        if (active) setOauthProviders([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isRecruiterMode || status !== "authenticated") {
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function checkRecruiterAccess() {
      try {
        const response = await fetch("/api/recruiter/agency", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!active) return;

        if (response.ok) {
          router.replace(safeCallbackUrl);
          router.refresh();
          return;
        }

        if (response.status === 403) {
          setShowRecruiterNotice(true);
        }
      } catch {
        if (active) {
          setShowRecruiterNotice(showRecruiterAccessNotice);
        }
      }
    }

    void checkRecruiterAccess();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    isRecruiterMode,
    router,
    safeCallbackUrl,
    showRecruiterAccessNotice,
    status,
  ]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSignInError(null);
    setIsSigningIn(true);

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsSigningIn(false);

    if (res?.error) {
      setSignInError("Incorrect email or password.");
      return;
    }

    if (isRecruiterMode) {
      router.push(safeCallbackUrl);
      router.refresh();
      return;
    }

    try {
      const onboardingRes = await fetch("/api/onboarding/key-questions", {
        cache: "no-store",
      });
      const onboardingData = await onboardingRes.json();
      router.push(
        onboardingData?.completed
          ? "/dashboard"
          : onboardingData?.nextPath || "/questions"
      );
    } catch {
      router.push("/questions");
    }
    router.refresh();
  }

  return (
    <div className="relative min-h-screen bg-white">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-50" />
        <div className="absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute right-[-120px] bottom-[-140px] h-[420px] w-[420px] rounded-full bg-indigo-200/25 blur-3xl" />
      </div>

      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-14">
        <div className="w-full max-w-md">
          <div className="mb-8 hidden text-center sm:block">
            <Link href="/" className="inline-flex items-center justify-center">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                Hirexa <span className="text-sky-500">AI</span>
              </span>
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/90 p-7 shadow-sm backdrop-blur">
            {showRecruiterNotice ? (
              <RecruiterAccessNotice reason={reason} />
            ) : null}

            <div className="text-center">
              <h1 className="text-xl font-semibold text-slate-900">
                Sign in to your account
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Welcome back! Please enter your details.
              </p>
            </div>

            <form className="mt-6" onSubmit={onSubmit}>
              <LoginForm isSigningIn={isSigningIn} signInError={signInError} />

              <Button
                type="button"
                size="lg"
                disabled={isStartingSignup || isSigningIn}
                onClick={handleStartSignup}
                className="
                  mt-3 h-12 w-full
                  bg-sky-500 text-white
                  hover:bg-sky-400
                  text-base font-semibold
                  shadow-lg shadow-sky-500/25
                  transition-all duration-200
                  active:scale-[0.97]
                  disabled:cursor-not-allowed disabled:opacity-70
                "
              >
                {isStartingSignup ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Getting started...
                  </span>
                ) : (
                  "Sign up for free"
                )}
              </Button>
              <div className="mt-3 text-right">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-500">Or continue with</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <AppleButton
              callbackUrl={safeCallbackUrl}
              disabled={!appleProviderEnabled}
            />

            {visibleOauthProviders.length > 0 ? (
              <div
                className={`mt-3 grid gap-3 ${
                  visibleOauthProviders.length > 1 ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {visibleOauthProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() =>
                      signIn(provider.id, {
                        callbackUrl:
                          provider.id === "google" && !isRecruiterMode
                            ? GOOGLE_CALLBACK_URL
                            : safeCallbackUrl,
                      })
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <span className="flex h-[18px] w-[18px] items-center justify-center">
                      {provider.id === "google" ? (
                        <GoogleLogo className="h-[18px] w-[18px] shrink-0" />
                      ) : (
                        <span className="text-base">
                          {provider.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span>
                      {provider.id === "google"
                        ? "Continue with Google"
                        : `Continue with ${provider.name}`}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
              <Link href="/terms" className="hover:text-slate-700">
                Terms
              </Link>
              <span className="text-slate-300">•</span>
              <Link href="/privacy" className="hover:text-slate-700">
                Privacy
              </Link>
              <span className="text-slate-300">•</span>
              <Link href="/help-center" className="hover:text-slate-700">
                Help Center
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function normalizeClientCallbackUrl(value: string, fallback: string) {
  const normalized = value.trim();
  if (!normalized) return fallback;

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const parsed = new URL(normalized, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return fallback;
    }

    const relativePath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return relativePath.startsWith("/") ? relativePath : fallback;
  } catch {
    return fallback;
  }
}
