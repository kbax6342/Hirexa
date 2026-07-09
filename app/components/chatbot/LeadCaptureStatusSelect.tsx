"use client";

import { useState } from "react";

import {
  LEAD_CAPTURE_STATUS_OPTIONS,
  type LeadCaptureStatus,
  getLeadCaptureStatusOption,
  isLeadCaptureStatus,
  normalizeLeadCaptureStatus,
} from "@/app/lib/chatbot/leadCaptureStatus";

type LeadCaptureStatusSelectProps = {
  companySlug: string;
  leadId: string;
  initialStatus: string | null;
};

type StatusUpdateResponse =
  | {
      ok: true;
      captureStatus: LeadCaptureStatus;
    }
  | {
      ok: false;
      error?: string;
    };

export default function LeadCaptureStatusSelect({
  companySlug,
  leadId,
  initialStatus,
}: LeadCaptureStatusSelectProps) {
  const [status, setStatus] = useState<LeadCaptureStatus>(
    normalizeLeadCaptureStatus(initialStatus)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentOption = getLeadCaptureStatusOption(status);

  async function handleStatusChange(nextValue: string) {
    if (!isLeadCaptureStatus(nextValue) || nextValue === status || isSaving) {
      return;
    }

    const previousStatus = status;
    setStatus(nextValue);
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/chatbots/${encodeURIComponent(
          companySlug
        )}/leads/${encodeURIComponent(leadId)}/capture-status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ captureStatus: nextValue }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | StatusUpdateResponse
        | null;

      if (!payload) {
        throw new Error("Unable to update lead status.");
      }

      if (!response.ok || !payload.ok) {
        const errorMessage = payload.ok
          ? "Unable to update lead status."
          : payload.error || "Unable to update lead status.";
        throw new Error(errorMessage);
      }

      setStatus(payload.captureStatus);
    } catch (statusError) {
      setStatus(previousStatus);
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update lead status."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-w-40 flex-col gap-1">
      <select
        aria-label="Lead capture status"
        title={currentOption.meaning}
        value={status}
        disabled={isSaving}
        onChange={(event) => void handleStatusChange(event.target.value)}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm outline-none transition-all duration-200 hover:shadow-md focus:ring-2 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-70 ${currentOption.badgeClassName}`}
      >
        {LEAD_CAPTURE_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="max-w-40 text-xs leading-4 text-red-600">{error}</span>
      ) : isSaving ? (
        <span className="text-xs leading-4 text-slate-500">Saving...</span>
      ) : null}
    </div>
  );
}
