"use client";

import Link from "next/link";

import { Card } from "@/app/components/ui/card";
import BestFitReasonsCard from "@/app/components/recruiter/BestFitReasonsCard";
import RedFlagsCard from "@/app/components/recruiter/RedFlagsCard";
import type {
  RecruiterMatchRecord,
  RecruiterSubmissionRecord,
} from "@/app/components/recruiter/types";
import {
  RECRUITER_STAGE_BADGE_CLASSES,
  RECRUITER_STAGE_LABELS,
  normalizeRecruiterStage,
} from "@/app/lib/recruiter/constants";

function buildCandidateName(match: RecruiterMatchRecord) {
  const parts = [match.candidate.firstName, match.candidate.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return match.candidate.email || "Unnamed candidate";
}

export default function MatchResultsPanel({
  jobOrderId,
  matches,
  submissions,
  loading = false,
}: {
  jobOrderId: string;
  matches: RecruiterMatchRecord[];
  submissions: RecruiterSubmissionRecord[];
  loading?: boolean;
}) {
  const submissionsByCandidateId = new Map(
    submissions.map((submission) => [submission.candidateId, submission])
  );

  return (
    <div className="space-y-4">
      {loading ? (
        <Card className="rounded-3xl border-slate-200 p-6 text-sm text-slate-500 shadow-sm">
          Running AI match...
        </Card>
      ) : null}

      {!loading && !matches.length ? (
        <Card className="rounded-3xl border-dashed border-slate-300 p-6 text-sm text-slate-500 shadow-sm">
          Run AI matching to see ranked candidates, best-fit reasons, and red flags for this job order.
        </Card>
      ) : null}

      {matches.map((match) => {
        const submission = submissionsByCandidateId.get(match.candidateId);
        const stage = normalizeRecruiterStage(submission?.stage);
        return (
          <Card key={`${jobOrderId}-${match.candidateId}`} className="rounded-3xl border-slate-200 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {buildCandidateName(match)}
                  </h3>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                    Score {match.score}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${RECRUITER_STAGE_BADGE_CLASSES[stage]}`}
                  >
                    {RECRUITER_STAGE_LABELS[stage]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {match.candidate.headline || match.candidate.email || "Candidate profile"}
                </p>
                <p className="mt-2 text-sm text-slate-700">{match.summary}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/recruiter/outreach?jobOrderId=${encodeURIComponent(jobOrderId)}&candidateId=${encodeURIComponent(match.candidateId)}&stage=${encodeURIComponent(stage)}`}
                  className="inline-flex items-center rounded-2xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
                >
                  Generate outreach
                </Link>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <BestFitReasonsCard reasons={match.bestFitReasons} />
              <RedFlagsCard
                redFlags={match.redFlags}
                missingQualifications={match.missingQualifications}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
