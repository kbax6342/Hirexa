"use client";

import { useState } from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";

export default function ManageBillingButton({
  className,
  label = "Manage Billing",
}: {
  className?: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/subscription/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; url?: string; error?: string }
        | null;

      if (!response.ok || !data?.ok || !data.url) {
        throw new Error(data?.error ?? "Unable to open billing settings.");
      }

      window.location.href = data.url;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to open billing settings."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={() => void openPortal()} disabled={loading} className={className}>
        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        {loading ? "Opening..." : label}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
