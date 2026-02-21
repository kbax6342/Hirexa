"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function AutofillButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAutofill() {
    try {
      setLoading(true);

      const res = await fetch("/api/billing/plan-status", { method: "GET" });
      const data = await res.json();

      if (!data?.ok) {
        // if session expired or error, send to login or plans
        router.push("/plans");
        return;
      }

      if (!data.active) {
        // no paid plan -> upsell
        router.push("/plans");
        return;
      }

      // ✅ Active plan: go to your Auto-Apply dashboard / flow
      router.push("/auto-apply"); 
      // (or if you have a specific page for autofill setup: router.push("/autofill"))
    } catch (e) {
      router.push("/plans");
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
        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Checking plan..." : "+ Auto-fill application"}
      </button>
    </div>
  );
}