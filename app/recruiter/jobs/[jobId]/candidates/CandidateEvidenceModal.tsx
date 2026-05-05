"use client";

import {
  BriefcaseIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/app/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import type { ResumeSubmissionRecord } from "@/app/recruiter/jobs/[jobId]/candidates/types";

type CandidateEvidenceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: ResumeSubmissionRecord | null;
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatActionLabel(action: string) {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildCandidateLabel(submission: ResumeSubmissionRecord) {
  return (
    submission.candidate.name ||
    submission.candidate.email ||
    submission.parsedProfile?.candidateSummary ||
    "Candidate evidence"
  );
}

function recommendationTone(recommendation: string | null | undefined) {
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

export default function CandidateEvidenceModal({
  open,
  onOpenChange,
  submission,
}: CandidateEvidenceModalProps) {
  const evaluation = submission?.latestEvaluation ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto rounded-3xl border-slate-200 bg-white p-0">
        <div className="p-6">
          <DialogHeader className="border-b border-slate-200 pb-5">
            <DialogTitle className="text-2xl font-semibold text-slate-900">
              {submission ? buildCandidateLabel(submission) : "Candidate evidence"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-slate-600">
              Review the resume-grounded evidence, criteria breakdown, missing information, and audit trail before taking any action.
            </DialogDescription>
          </DialogHeader>

          {!submission ? null : !evaluation ? (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              This resume has been uploaded, but an evaluation has not been completed yet.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={recommendationTone(evaluation.recommendation)}>
                  {evaluation.recommendation.replace(/_/g, " ")}
                </Badge>
                <span className="text-sm text-slate-600">
                  Fit score <span className="font-semibold text-slate-900">{evaluation.overallScore}</span>
                </span>
                <span className="text-sm text-slate-600">
                  Confidence <span className="font-semibold text-slate-900">{evaluation.confidence}</span>
                </span>
                {evaluation.modelName ? (
                  <span className="text-xs text-slate-500">Model: {evaluation.modelName}</span>
                ) : null}
              </div>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2 text-slate-900">
                    <BriefcaseIcon className="h-5 w-5 text-sky-600" />
                    <h3 className="text-lg font-semibold">Summary</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{evaluation.summary}</p>
                  {submission.parsedProfile?.candidateSummary ? (
                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      Parsed profile summary: {submission.parsedProfile.candidateSummary}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                  <div className="flex items-center gap-2 text-amber-900">
                    <ShieldExclamationIcon className="h-5 w-5" />
                    <h3 className="text-lg font-semibold">Human Review Required</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-amber-900">
                    {evaluation.humanReviewNote ||
                      "This evaluation is a recruiter-assist signal only and cannot make a final hiring decision."}
                  </p>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-slate-900">
                  <ClipboardDocumentListIcon className="h-5 w-5 text-sky-600" />
                  <h3 className="text-lg font-semibold">Criteria Breakdown</h3>
                </div>
                <div className="mt-4 grid gap-3">
                  {evaluation.criteria.map((criterion) => (
                    <div
                      key={criterion.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {criterion.label}
                        </div>
                        <div className="text-sm text-slate-600">
                          Score {criterion.score} / {Math.abs(criterion.weight)}
                        </div>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{criterion.rationale}</p>
                      {criterion.evidence.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {criterion.evidence.map((item) => (
                            <span
                              key={`${criterion.id}-${item}`}
                              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <h3 className="text-lg font-semibold text-slate-900">Strengths</h3>
                  <div className="mt-3 space-y-2">
                    {evaluation.strengths.length ? (
                      evaluation.strengths.map((strength) => (
                        <p key={strength} className="text-sm leading-6 text-slate-600">
                          {strength}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No strengths were captured.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <h3 className="text-lg font-semibold text-slate-900">Missing Information</h3>
                  <div className="mt-3 space-y-2">
                    {evaluation.missingInformation.length ? (
                      evaluation.missingInformation.map((item) => (
                        <p key={item} className="text-sm leading-6 text-slate-600">
                          {item}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        No major missing-information flags were recorded.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <h3 className="text-lg font-semibold text-slate-900">Resume Evidence Snippets</h3>
                  <div className="mt-3 space-y-2">
                    {evaluation.criteria.flatMap((criterion) => criterion.evidence).length ? (
                      evaluation.criteria
                        .flatMap((criterion) => criterion.evidence)
                        .slice(0, 10)
                        .map((item, index) => (
                          <p key={`${item}-${index}`} className="text-sm leading-6 text-slate-600">
                            {item}
                          </p>
                        ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        Specific evidence snippets were limited in this evaluation.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Suggested Interview Questions
                  </h3>
                  <div className="mt-3 space-y-2">
                    {evaluation.interviewQuestions.length ? (
                      evaluation.interviewQuestions.map((question) => (
                        <p key={question} className="text-sm leading-6 text-slate-600">
                          {question}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        No interview questions were suggested.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-slate-900">
                  <ExclamationTriangleIcon className="h-5 w-5 text-sky-600" />
                  <h3 className="text-lg font-semibold">Audit Log Summary</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {submission.auditLogs.length ? (
                    submission.auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">
                            {formatActionLabel(log.action)}
                          </div>
                          <div className="text-xs text-slate-500">{formatDate(log.createdAt)}</div>
                        </div>
                        {Object.keys(log.metadata ?? {}).length ? (
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No audit events were available.</p>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
