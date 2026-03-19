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
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
          <EnvelopeIcon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Subscribe to the Hirexa newsletter</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Product updates, hiring insights, job search tips, and new feature launches.
          </p>
        </div>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Email address</span>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
            className="h-12 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="submit"
            disabled={isLoading}
            className="h-12 rounded-xl bg-sky-600 px-6 text-sm font-semibold text-white hover:bg-sky-700"
          >
            {isLoading ? "Subscribing..." : "Subscribe"}
          </Button>
          <p className="text-sm text-slate-500">No spam. Just practical updates for job seekers.</p>
        </div>
      </form>

      {message ? (
        <div
          className={[
            "mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
            isSuccess
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : isError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-slate-50 text-slate-700",
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
