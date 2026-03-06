"use client";

import Link from "next/link";
import LoginFooter from "../components/loginFooter/LoginFooter";
import LoginForm from "../components/loginForm/LoginForm";
import { startOnboarding } from "../api/actions/startOnboarding";
import { useEffect, useTransition, useState } from "react";
import { Button } from "../components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") ?? "/dashboard";
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">(
    "loading",
  );
  const [session, setSession] = useState<any>(null);

  const [isPending, startTransition] = useTransition(); // for signup action
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await authClient.getSession();
        if (!cancelled) {
          setSession(s);
          setStatus(s?.user ? "authenticated" : "unauthenticated");
          if (s?.user) {
            router.replace(callbackUrl);
          }
        }
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, callbackUrl]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSignInError(null);
    setIsSigningIn(true);

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");

    try {
      const res = await authClient.signIn.emailPassword({
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      setIsSigningIn(false);

      if (res.error) {
        setSignInError(res.error);
        return;
      }

      // Refresh session client-side
      const s = await authClient.getSession();
      setSession(s);
      setStatus(s?.user ? "authenticated" : "unauthenticated");
      router.replace(callbackUrl);
    } catch (err: unknown) {
      setIsSigningIn(false);
      const message = err instanceof Error ? err.message : "Sign in failed.";
      setSignInError(message);
    }
  }

  return (
    <div className="min-[116vh] bg-white">
      {/* soft background like the rest of your app */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-50" />
        <div className="absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute right-[-120px] bottom-[-140px] h-[420px] w-[420px] rounded-full bg-indigo-200/25 blur-3xl" />
      </div>

      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 pt-14">
        <div className="w-full max-w-md">
          {/* Brand */}
          <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center justify-center">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                Hirexa <span className="text-sky-500">AI</span>
              </span>
            </Link>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-7 shadow-sm backdrop-blur">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-slate-900">
                Sign in to your account
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Welcome back! Please enter your details.
              </p>
            </div>

            {/* ✅ ONE form only */}
            <form className="mt-6" onSubmit={onSubmit}>
              <LoginForm isSigningIn={isSigningIn} signInError={signInError} />

              {/* Sign up for free (secondary action, NOT another form) */}
              <Button
                type="button"
                size="lg"
                disabled={isPending || isSigningIn}
                onClick={() =>
                  startTransition(async () => {
                    await startOnboarding();
                  })
                }
                className="
                  mt-3 h-12 w-full
                  bg-sky-500 text-white
                  hover:bg-sky-400
                  text-base font-semibold
                  shadow-lg shadow-sky-500/25
                  transition-all duration-200
                  active:scale-[0.97]
                  disabled:opacity-70 disabled:cursor-not-allowed
                "
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Getting started…
                  </span>
                ) : (
                  "Sign up for free"
                )}
              </Button>
            </form>

            {/* Terms row */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
              <Link href="/terms" className="hover:text-slate-700">
                Terms
              </Link>
              <span className="text-slate-300">•</span>
              <Link href="/privacy" className="hover:text-slate-700">
                Privacy
              </Link>
              <span className="text-slate-300">•</span>
              <Link href="/help" className="hover:text-slate-700">
                Help Center
              </Link>
            </div>
          </div>

          <div className="mt-10">
           
          </div>
        </div>
      </main>
    </div>
  );
}
