"use client";

import { useMemo, useState } from "react";
import { ClipboardDocumentIcon, SparklesIcon } from "@heroicons/react/24/outline";

import RecruiterCard from "@/app/components/recruiter/RecruiterCard";
import { Button } from "@/app/components/ui/button";
import type {
  RecruiterCandidateRecord,
  RecruiterJobOrderRecord,
} from "@/app/components/recruiter/types";
import {
  RECRUITER_STAGE_LABELS,
  RECRUITER_STAGE_OPTIONS,
  normalizeRecruiterStage,
} from "@/app/lib/recruiter/constants";

function buildCandidateName(candidate: RecruiterCandidateRecord) {
  const parts = [candidate.firstName, candidate.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return candidate.email || "Unnamed candidate";
}

const MESSAGE_TYPES = [
  "intro outreach",
  "screen scheduling",
  "submission update",
  "interview follow-up",
  "offer congratulations",
] as const;

export default function OutreachComposer({
  jobOrders,
  candidates,
  initialSelection,
}: {
  jobOrders: RecruiterJobOrderRecord[];
  candidates: RecruiterCandidateRecord[];
  initialSelection?: {
    jobOrderId?: string | null;
    candidateId?: string | null;
    stage?: string | null;
  };
}) {
  const [jobOrderId, setJobOrderId] = useState(initialSelection?.jobOrderId ?? jobOrders[0]?.id ?? "");
  const [candidateId, setCandidateId] = useState(
    initialSelection?.candidateId ?? candidates[0]?.id ?? ""
  );
  const [stage, setStage] = useState(
    normalizeRecruiterStage(initialSelection?.stage ?? "SCREENED")
  );
  const [messageType, setMessageType] = useState<string>("intro outreach");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedJobOrder = useMemo(
    () => jobOrders.find((jobOrder) => jobOrder.id === jobOrderId) ?? null,
    [jobOrderId, jobOrders]
  );
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === candidateId) ?? null,
    [candidateId, candidates]
  );

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/recruiter/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobOrderId,
          candidateId,
          stage,
          messageType,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error ?? "Unable to generate outreach message.");
      }

      setMessage(String(data.message ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate outreach message.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setNotice("Message copied.");
    } catch {
      setNotice("Copy failed. You can still copy manually.");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <RecruiterCard className="rounded-2xl border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Generate recruiter outreach</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick a candidate, job order, and stage to draft a recruiter-ready message fast.
        </p>

        <div className="mt-5 space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Job order</span>
            <select
              value={jobOrderId}
              onChange={(event) => setJobOrderId(event.target.value)}
              className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"
            >
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.title} · {jobOrder.companyName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Candidate</span>
            <select
              value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}
              className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"
            >
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {buildCandidateName(candidate)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Stage</span>
              <select
                value={stage}
                onChange={(event) => setStage(normalizeRecruiterStage(event.target.value))}
                className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"
              >
                {RECRUITER_STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {RECRUITER_STAGE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Message type</span>
              <select
                value={messageType}
                onChange={(event) => setMessageType(event.target.value)}
                className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"
              >
                {MESSAGE_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedJobOrder ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-semibold text-slate-900">{selectedJobOrder.title}</div>
              <div className="mt-1">{selectedJobOrder.companyName}</div>
              <div className="mt-2 text-xs text-slate-500">
                {(selectedJobOrder.requiredSkills ?? []).slice(0, 5).join(", ") || "Required skills will appear here."}
              </div>
            </div>
          ) : null}

          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading || !jobOrderId || !candidateId}
            className="rounded-full !border-slate-200 !bg-white !text-slate-700 shadow-sm hover:!bg-slate-50"
          >
            <SparklesIcon className="h-4 w-4" />
            {loading ? "Generating..." : "Generate message"}
          </Button>
        </div>
      </RecruiterCard>

      <RecruiterCard className="rounded-2xl border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Draft</h3>
            <p className="mt-1 text-sm text-slate-500">
              Copy, personalize, or regenerate before you send.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-full !border-slate-200 !bg-white !text-slate-700 shadow-sm hover:!bg-slate-50"
            onClick={() => void handleCopy()}
            disabled={!message}
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            Copy
          </Button>
        </div>

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-4 min-h-[420px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-400"
          placeholder="Your generated outreach message will appear here."
        />

        {selectedCandidate ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">{buildCandidateName(selectedCandidate)}</div>
            <div className="mt-1">{selectedCandidate.headline || selectedCandidate.email || "Candidate context"}</div>
            <div className="mt-2 text-xs text-slate-500">
              {(selectedCandidate.skills ?? []).slice(0, 6).join(", ") || "Parsed skills will show here."}
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        {notice ? <p className="mt-4 text-sm text-sky-600">{notice}</p> : null}
      </RecruiterCard>
    </div>
  );
}
