"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || payload?.ok === false) {
        setError(payload?.error ?? "Unable to send password reset email.");
        return;
      }

      setSubmitted(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to send password reset email."
      );
    } finally {
      setIsSubmitting(false);
    }
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
                Forgot your password?
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Enter the email you use with Hirexa and we&apos;ll send you a reset link.
              </p>
            </div>

            {submitted ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  If an account exists for this email, we sent a password reset link.
                </div>

                <div className="flex items-center justify-between">
                  <Link
                    href="/login"
                    className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    Back to login
                  </Link>
                  <Button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setError(null);
                    }}
                  >
                    Send another email
                  </Button>
                </div>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Email
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 h-12 bg-white text-slate-900"
                    placeholder="you@example.com"
                  />
                </div>

                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="h-12 w-full bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isSubmitting ? "Sending..." : "Send reset link"}
                </Button>

                <div className="text-center text-sm text-slate-500">
                  <Link
                    href="/login"
                    className="font-medium text-slate-700 hover:text-slate-900"
                  >
                    Back to login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
