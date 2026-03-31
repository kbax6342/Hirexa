"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobSource } from "@/app/lib/jobs/types";
import {
  buildApplyProviderPayload,
} from "@/app/lib/apply/providerDetection";

const extensionUrl = process.env.NEXT_PUBLIC_AUTOFILL_EXTENSION_URL;

type AutofillButtonProps = {
  job: {
    sourceJobId?: string | null;
    jobTitle: string;
    company: string;
    location?: string | null;
    jobUrl?: string | null;
    source?: JobSource | null;
  };
};

export default function AutofillButton({ job }: AutofillButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAutofill() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/billing/plan-status", { method: "GET" });
      const data = await res.json();

      if (data?.pending) {
        setError("We’re confirming your subscription. Please try auto-fill again in a moment.");
        return;
      }

      if (!data?.ok || !data.active) {
        router.push("/plans?source=autofill");
        return;
      }

      if (extensionUrl) {
        window.open(extensionUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const applyRes = await fetch("/api/applications/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildApplyProviderPayload({
            id: job.sourceJobId ?? job.jobUrl ?? job.jobTitle,
            title: job.jobTitle,
            company: job.company,
            location: job.location ?? "",
            jobUrl: job.jobUrl ?? undefined,
            source: job.source ?? "other",
          })
        ),
      });
      const applyData = await applyRes.json();

      if (!applyRes.ok || !applyData?.applicationId) {
        throw new Error("Unable to auto apply.");
      }

      router.push(`/dashboard/application/${applyData.applicationId}/audit`);
    } catch (error) {
      console.error("[AUTOFILL] access check failed", error);
      setError("Unable to verify your subscription right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleAutofill}
        disabled={loading}
        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "...applying" : "+ Auto-fill application"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
