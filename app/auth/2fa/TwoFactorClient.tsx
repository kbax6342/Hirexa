"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

function safeCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export default function TwoFactorClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => safeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams]
  );
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/account/2fa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; nextUrl?: string }
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? "Invalid authentication code.");
      }

      router.replace(callbackUrl || data.nextUrl || "/dashboard");
      router.refresh();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Invalid authentication code."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_32%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] px-4 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-blue-950/10 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Account Security
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
            Two-factor authentication
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Enter the 6-digit code from your authenticator app to continue.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="two-factor-code"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                {useBackupCode ? "Backup recovery code" : "Authentication code"}
              </label>
              <Input
                id="two-factor-code"
                inputMode={useBackupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                value={code}
                onChange={(event) =>
                  setCode(
                    useBackupCode
                      ? event.target.value.toUpperCase()
                      : event.target.value.replace(/\D/g, "").slice(0, 6)
                  )
                }
                className="h-12 text-center text-lg font-semibold tracking-[0.2em]"
                placeholder={useBackupCode ? "XXXXX-XXXXX" : "000000"}
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-5 w-full text-center text-sm font-semibold text-blue-700 hover:underline"
            onClick={() => {
              setUseBackupCode((current) => !current);
              setCode("");
              setError(null);
            }}
          >
            {useBackupCode ? "Use authenticator code" : "Use backup code"}
          </button>
        </section>
      </div>
    </main>
  );
}
