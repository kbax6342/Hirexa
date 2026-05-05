"use client";

import { useDeferredValue, useState, startTransition } from "react";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import CandidateEvidenceModal from "@/app/recruiter/jobs/[jobId]/candidates/CandidateEvidenceModal";
import type {
  RecruiterResumeSnapshotRecord,
  ResumeSubmissionRecord,
} from "@/app/recruiter/jobs/[jobId]/candidates/types";

type CandidateRankingTableProps = {
  jobId: string;
  snapshot: RecruiterResumeSnapshotRecord;
  runningAll: boolean;
  onRunAllEvaluations: () => Promise<void>;
  onSnapshotChange: (snapshot: RecruiterResumeSnapshotRecord) => void;
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function buildCandidateLabel(submission: ResumeSubmissionRecord) {
  return submission.candidate.name || submission.candidate.email || "Unnamed candidate";
}

function buildCurrentTitle(submission: ResumeSubmissionRecord) {
  return submission.candidate.currentTitle || submission.parsedProfile?.roles[0] || "Not specified";
}

function recommendationClass(recommendation: string | null | undefined) {
  switch (recommendation) {
    case "STRONG_REVIEW":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "REVIEW":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
    case "POSSIBLE_FIT":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "WEAK_FIT":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function confidenceClass(confidence: string | null | undefined) {
  switch (confidence) {
    case "high":
      return "text-emerald-700";
    case "medium":
      return "text-sky-700";
    default:
      return "text-amber-700";
  }
}

function summarizeItems(items: string[], emptyLabel: string) {
  if (!items.length) return emptyLabel;
  return items.slice(0, 2).join(" · ");
}

export default function CandidateRankingTable({
  jobId,
  snapshot,
  runningAll,
  onRunAllEvaluations,
  onSnapshotChange,
}: CandidateRankingTableProps) {
  const [query, setQuery] = useState("");
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<ResumeSubmissionRecord | null>(
    null
  );
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const submissions = snapshot.submissions.filter((submission) => {
    if (!deferredQuery) return true;
    return [
      buildCandidateLabel(submission),
      buildCurrentTitle(submission),
      submission.candidate.location ?? "",
      submission.latestEvaluation?.recommendation ?? "",
      ...(submission.latestEvaluation?.strengths ?? []),
      ...(submission.parsedProfile?.skills ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(deferredQuery);
  });

  async function handleRerunEvaluation(submissionId: string) {
    setRerunningId(submissionId);
    setError(null);

    try {
      const response = await fetch(`/api/recruiter/resumes/${submissionId}/evaluate`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            snapshot?: RecruiterResumeSnapshotRecord;
          }
        | null;

      if (!response.ok || data?.ok === false || !data?.snapshot) {
        throw new Error(data?.error ?? "Unable to evaluate this resume.");
      }

      startTransition(() => {
        onSnapshotChange(data.snapshot as RecruiterResumeSnapshotRecord);
      });
    } catch (rerunError) {
      setError(rerunError instanceof Error ? rerunError.message : "Unable to evaluate resume.");
    } finally {
      setRerunningId(null);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Candidate ranking</h2>
          <p className="mt-1 text-sm text-slate-500">
            Candidates are sorted by fit score, but every result still requires recruiter review.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
            <MagnifyingGlassIcon className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search candidates"
              className="w-56 border-0 bg-transparent text-slate-900 outline-none"
            />
          </label>
          <Button
            type="button"
            disabled={runningAll}
            className="rounded-2xl bg-sky-500 text-white hover:bg-sky-600"
            onClick={() => void onRunAllEvaluations()}
          >
            {runningAll ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <SparklesIcon className="h-4 w-4" />
            )}
            {runningAll ? "Evaluating..." : "Evaluate pending resumes"}
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

      {!submissions.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
          No resume submissions are available for this job yet.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-slate-500">Candidate</TableHead>
                <TableHead className="text-slate-500">Current title</TableHead>
                <TableHead className="text-slate-500">Fit score</TableHead>
                <TableHead className="text-slate-500">Recommendation</TableHead>
                <TableHead className="text-slate-500">Confidence</TableHead>
                <TableHead className="text-slate-500">Top strengths</TableHead>
                <TableHead className="text-slate-500">Missing requirements</TableHead>
                <TableHead className="text-slate-500">Uploaded</TableHead>
                <TableHead className="text-right text-slate-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.id} className="hover:bg-slate-50">
                  <TableCell>
                    <div className="min-w-[220px]">
                      <div className="font-semibold text-slate-900">
                        {buildCandidateLabel(submission)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {submission.candidate.location || submission.candidate.email || "Profile awaiting review"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">{buildCurrentTitle(submission)}</TableCell>
                  <TableCell>
                    {submission.latestEvaluation ? (
                      <div className="font-semibold text-slate-900">
                        {submission.latestEvaluation.overallScore}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">
                        {submission.status === "FAILED" ? "Failed" : "Pending"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${recommendationClass(
                        submission.latestEvaluation?.recommendation
                      )}`}
                    >
                      {(submission.latestEvaluation?.recommendation ?? submission.status).replace(
                        /_/g,
                        " "
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-sm font-semibold ${confidenceClass(
                        submission.latestEvaluation?.confidence
                      )}`}
                    >
                      {submission.latestEvaluation?.confidence ?? "--"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[240px] text-sm text-slate-600">
                    {summarizeItems(
                      submission.latestEvaluation?.strengths ?? [],
                      "Awaiting evaluation"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px] text-sm text-slate-600">
                    {summarizeItems(
                      submission.latestEvaluation?.gaps ?? [],
                      "No major gaps recorded"
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500">{formatDate(submission.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSubmission(submission)}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        View evidence
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRerunEvaluation(submission.id)}
                        disabled={rerunningId === submission.id}
                        className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
                      >
                        {rerunningId === submission.id ? "Running..." : "Re-run evaluation"}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CandidateEvidenceModal
        open={Boolean(selectedSubmission)}
        onOpenChange={(open) => {
          if (!open) setSelectedSubmission(null);
        }}
        submission={selectedSubmission}
      />
    </div>
  );
}
