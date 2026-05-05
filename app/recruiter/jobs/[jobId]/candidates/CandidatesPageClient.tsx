"use client";

import Link from "next/link";
import { useState, startTransition } from "react";
import {
  BriefcaseIcon,
  ShieldExclamationIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import CandidateRankingTable from "@/app/recruiter/jobs/[jobId]/candidates/CandidateRankingTable";
import ResumeUploadDropzone from "@/app/recruiter/jobs/[jobId]/candidates/ResumeUploadDropzone";
import type { RecruiterResumeSnapshotRecord } from "@/app/recruiter/jobs/[jobId]/candidates/types";
import { RESUME_HUMAN_REVIEW_COPY } from "@/app/lib/resumes/resumeScoringRubric";

type CandidatesPageClientProps = {
  snapshot: RecruiterResumeSnapshotRecord;
};

export default function CandidatesPageClient({ snapshot: initialSnapshot }: CandidatesPageClientProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluatedCount = snapshot.submissions.filter((submission) => submission.latestEvaluation).length;
  const topReviewCount = snapshot.submissions.filter(
    (submission) =>
      submission.latestEvaluation?.recommendation === "STRONG_REVIEW" ||
      submission.latestEvaluation?.recommendation === "REVIEW"
  ).length;

  async function handleRunAllEvaluations() {
    setRunningAll(true);
    setError(null);

    try {
      const response = await fetch(`/api/recruiter/jobs/${snapshot.job.jobOrderId}/candidates`, {
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
        throw new Error(data?.error ?? "Unable to evaluate resumes.");
      }

      startTransition(() => {
        setSnapshot(data.snapshot as RecruiterResumeSnapshotRecord);
      });
    } catch (evaluationError) {
      setError(
        evaluationError instanceof Error
          ? evaluationError.message
          : "Unable to evaluate resumes."
      );
    } finally {
      setRunningAll(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
            Resume Fit Evaluator
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {snapshot.job.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {snapshot.job.companyName}
            {snapshot.job.location ? ` · ${snapshot.job.location}` : ""}
            {snapshot.job.experienceLevel ? ` · ${snapshot.job.experienceLevel}` : ""}
          </p>
        </div>

        <Link
          href={`/agency/job-orders/${snapshot.job.jobOrderId}`}
          className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to job order
        </Link>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-100 p-2 text-amber-700">
            <ShieldExclamationIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-amber-950">Human review required</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">{RESUME_HUMAN_REVIEW_COPY}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900">
            <BriefcaseIcon className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-semibold">Job summary</h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">{snapshot.job.jobDescription}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-slate-900">Required skills</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {snapshot.job.requiredSkills.length ? (
                  snapshot.job.requiredSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-400">No required skills listed.</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900">Preferred skills</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {snapshot.job.preferredSkills.length ? (
                  snapshot.job.preferredSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-400">No preferred skills listed.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Resume submissions
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {snapshot.submissions.length}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Evaluated
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{evaluatedCount}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <UsersIcon className="h-4 w-4" />
              Ready for deeper review
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{topReviewCount}</div>
          </div>
        </div>
      </div>

      <ResumeUploadDropzone
        jobId={snapshot.job.jobOrderId}
        disabled={runningAll}
        onSnapshotChange={(nextSnapshot) => {
          startTransition(() => {
            setSnapshot(nextSnapshot);
          });
        }}
      />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <CandidateRankingTable
        jobId={snapshot.job.jobOrderId}
        snapshot={snapshot}
        runningAll={runningAll}
        onRunAllEvaluations={handleRunAllEvaluations}
        onSnapshotChange={(nextSnapshot) => {
          startTransition(() => {
            setSnapshot(nextSnapshot);
          });
        }}
      />
    </div>
  );
}
