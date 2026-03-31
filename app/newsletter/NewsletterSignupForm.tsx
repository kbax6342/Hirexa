"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  EnvelopeIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type SubmitState = "idle" | "loading" | "success" | "error";

export default function NewsletterSignupForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setState("error");
      setMessage("Enter your email address to subscribe.");
      return;
    }

    setState("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to subscribe right now.");
      }

      setState("success");
      setMessage(
        payload.message ??
          "You’re subscribed. We’ll send practical Hirexa AI updates to your inbox."
      );
      setEmail("");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to subscribe right now. Please try again."
      );
    }
  }

  const isLoading = state === "loading";
  const isSuccess = state === "success";
  const isError = state === "error";

  return (
    <div
      id="newsletter-signup"
      className="rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-6 shadow-[0_24px_70px_-42px_rgba(14,165,233,0.55)] sm:p-8"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-200">
          <EnvelopeIcon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">
            Email Updates
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Subscribe to the Hirexa AI newsletter
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Get practical product updates, hiring insights, application tips, and interview
            guidance without the noise.
          </p>
        </div>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-200">Email address</span>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
            className="h-12 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-slate-400"
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="submit"
            disabled={isLoading}
            className="h-12 rounded-xl bg-sky-500 px-6 text-sm font-semibold text-white hover:bg-sky-400"
          >
            {isLoading ? "Subscribing..." : "Subscribe"}
          </Button>
          <p className="text-sm text-slate-400">
            Practical updates only. Unsubscribe any time.
          </p>
        </div>
      </form>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
        We&apos;ll use your email for the Hirexa AI newsletter and product updates. No fake urgency,
        no overloaded send schedule.
      </div>

      {message ? (
        <div
          className={[
            "mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
            isSuccess
              ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
              : isError
                ? "border-red-300/20 bg-red-500/10 text-red-100"
                : "border-white/10 bg-white/[0.04] text-slate-200",
          ].join(" ")}
          role={isError ? "alert" : "status"}
        >
          {isSuccess ? (
            <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          ) : isError ? (
            <ExclamationCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <EnvelopeIcon className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}
