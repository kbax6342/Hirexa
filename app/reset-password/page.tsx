"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  const missingToken = useMemo(() => !token, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (!token) {
      setTokenInvalid(true);
      setError("This password reset link is invalid.");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError("Please fill out both password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || payload?.ok === false) {
        const nextError = payload?.error ?? "Unable to reset password.";
        setError(nextError);
        if (/invalid|expired|already been used|no longer valid/i.test(nextError)) {
          setTokenInvalid(true);
        }
        return;
      }

      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      setTokenInvalid(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to reset password."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const showInvalidState = missingToken || tokenInvalid;

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
                Set a new password
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Choose a new password for your Hirexa account.
              </p>
            </div>

            {showInvalidState ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error ?? "This password reset link is invalid or has expired."}
                </div>
                <div className="flex items-center justify-between">
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-slate-700 hover:text-slate-900"
                  >
                    Request a new link
                  </Link>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Back to login
                  </Link>
                </div>
              </div>
            ) : success ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Your password has been reset. You can now sign in with your new password.
                </div>
                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-sm font-semibold text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Go to login
                  </Link>
                </div>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-sm font-medium text-slate-700"
                  >
                    New password
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="mt-1 h-12 bg-white text-slate-900"
                    placeholder="Create a new password"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Confirm new password
                  </label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-1 h-12 bg-white text-slate-900"
                    placeholder="Re-enter new password"
                  />
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  <p className="font-semibold text-gray-900">Password requirements</p>
                  <p className="mt-2">
                    Use at least 8 characters and include a mix of uppercase,
                    lowercase, numbers, or symbols.
                  </p>
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
                  {isSubmitting ? "Resetting..." : "Reset password"}
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
