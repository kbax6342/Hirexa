"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

const extensionUrl = process.env.NEXT_PUBLIC_AUTOFILL_EXTENSION_URL;

type AutofillButtonProps = {
  job: {
    sourceJobId?: string | null;
    jobTitle: string;
    company: string;
    location?: string | null;
    jobUrl?: string | null;
  };
};

export default function AutofillButton({ job }: AutofillButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAutofill() {
    try {
      setLoading(true);

      const res = await fetch("/api/billing/plan-status", { method: "GET" });
      const data = await res.json();

      if (!data?.ok || !data.active) {
        router.push("/plans?source=autofill");
        return;
      }

      if (extensionUrl) {
        window.open(extensionUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const applyRes = await fetch("/api/auto-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
      });
      const applyData = await applyRes.json();

      if (!applyRes.ok || !applyData?.applicationId) {
        throw new Error("Unable to auto apply.");
      }

      router.push(`/dashboard/application/${applyData.applicationId}/audit`);
    } catch {
      router.push("/plans?source=autofill");
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
    </div>
  );
}
