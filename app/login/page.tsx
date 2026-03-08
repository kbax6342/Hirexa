"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { getProviders, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { startOnboarding } from "../api/actions/startOnboarding";
import LoginForm from "../components/loginForm/LoginForm";
import { Button } from "../components/ui/button";

type OAuthProvider = {
  id: string;
  name: string;
};

export default function LoginPage() {
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);

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

    router.push("/questions");
    router.refresh();
  }

  return (
    <div className="min-[116vh] bg-white">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-50" />
        <div className="absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute right-[-120px] bottom-[-140px] h-[420px] w-[420px] rounded-full bg-indigo-200/25 blur-3xl" />
      </div>

      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 pt-14">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center justify-center">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                Hirexa <span className="text-sky-500">AI</span>
              </span>
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/90 p-7 shadow-sm backdrop-blur">
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
                  disabled:cursor-not-allowed disabled:opacity-70
                "
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Getting started...
                  </span>
                ) : (
                  "Sign up for free"
                )}
              </Button>
            </form>

            {oauthProviders.length > 0 ? (
              <>
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-500">Or continue with</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <div
                  className={`grid gap-3 ${
                    oauthProviders.length > 1 ? "grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  {oauthProviders.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => signIn(provider.id, { callbackUrl: "/" })}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                      <span className="text-base">
                        {provider.id === "google"
                          ? "G"
                          : provider.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        {provider.id === "google"
                          ? "Continue with Google"
                          : `Continue with ${provider.name}`}
                      </span>
                    </button>
                  ))}
                </div>
              </>
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
              <Link href="/help" className="hover:text-slate-700">
                Help Center
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
