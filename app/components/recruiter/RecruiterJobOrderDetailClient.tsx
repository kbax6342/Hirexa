"use client";

import { useState } from "react";
import Link from "next/link";
import { SparklesIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import MatchResultsPanel from "@/app/components/recruiter/MatchResultsPanel";
import StagePipelineBoard from "@/app/components/recruiter/StagePipelineBoard";
import type {
  RecruiterJobOrderRecord,
  RecruiterMatchRecord,
  RecruiterSubmissionRecord,
} from "@/app/components/recruiter/types";

export default function RecruiterJobOrderDetailClient({
  jobOrder,
  initialMatches,
  initialSubmissions,
}: {
  jobOrder: RecruiterJobOrderRecord;
  initialMatches: RecruiterMatchRecord[];
  initialSubmissions: RecruiterSubmissionRecord[];
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRunMatch() {
    setLoadingMatch(true);
    setError(null);

    try {
      const response = await fetch("/api/recruiter/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobOrderId: jobOrder.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error ?? "Unable to run recruiter matching.");
      }

      setMatches(data.matches as RecruiterMatchRecord[]);
      setSubmissions(data.submissions as RecruiterSubmissionRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run recruiter matching.");
    } finally {
      setLoadingMatch(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
            Job Order Detail
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {jobOrder.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {jobOrder.companyName}
            {jobOrder.location ? ` · ${jobOrder.location}` : ""}
            {jobOrder.employmentType ? ` · ${jobOrder.employmentType}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleRunMatch()}
            disabled={loadingMatch}
            className="rounded-2xl bg-sky-500 text-white hover:bg-sky-600"
          >
            <SparklesIcon className="h-4 w-4" />
            {loadingMatch ? "Running match..." : "Run AI match"}
          </Button>
          <Link
            href="/agency/job-orders"
            className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to job orders
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="rounded-3xl border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Role summary</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-slate-900">Required skills</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(jobOrder.requiredSkills ?? []).length ? (
                  jobOrder.requiredSkills.map((skill) => (
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
                {(jobOrder.preferredSkills ?? []).length ? (
                  jobOrder.preferredSkills.map((skill) => (
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
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {jobOrder.description}
          </div>
          {jobOrder.requiredYearsExperience != null ? (
            <div className="mt-4 text-sm text-slate-600">
              Target experience:{" "}
              <span className="font-semibold text-slate-900">
                {jobOrder.requiredYearsExperience}+ years
              </span>
            </div>
          ) : null}
        </Card>

        <Card className="rounded-3xl border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Workflow snapshot</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Ranked matches
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{matches.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Active submissions
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {submissions.length}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Outreach ready
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {matches.filter((match) => match.score >= 70).length}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Use the ranked list below to review best-fit reasons, pressure test red flags, and launch outreach.
          </p>
        </Card>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div>
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Ranked candidates</h2>
        <MatchResultsPanel
          jobOrderId={jobOrder.id}
          matches={matches}
          submissions={submissions}
          loading={loadingMatch}
        />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Stage pipeline</h2>
        <StagePipelineBoard
          initialSubmissions={submissions}
          onSubmissionChange={(updatedSubmission) =>
            setSubmissions((prev) =>
              prev.map((submission) =>
                submission.id === updatedSubmission.id ? updatedSubmission : submission
              )
            )
          }
        />
      </div>
    </div>
  );
}
