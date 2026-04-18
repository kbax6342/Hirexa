"use client";

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/app/components/ui/card";
import type {
  RecruiterStageEventRecord,
  RecruiterSubmissionRecord,
} from "@/app/components/recruiter/types";
import {
  RECRUITER_STAGE_BADGE_CLASSES,
  RECRUITER_STAGE_LABELS,
  RECRUITER_STAGE_OPTIONS,
  normalizeRecruiterStage,
} from "@/app/lib/recruiter/constants";

function buildCandidateName(submission: RecruiterSubmissionRecord) {
  const parts = [submission.candidate.firstName, submission.candidate.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return submission.candidate.email || "Unnamed candidate";
}

function formatEventDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function StagePipelineBoard({
  initialSubmissions,
  onSubmissionChange,
}: {
  initialSubmissions: RecruiterSubmissionRecord[];
  onSubmissionChange?: (submission: RecruiterSubmissionRecord) => void;
}) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map(
      RECRUITER_STAGE_OPTIONS.map((stage) => [stage, [] as RecruiterSubmissionRecord[]])
    );
    for (const submission of submissions) {
      const stage = normalizeRecruiterStage(submission.stage);
      map.get(stage)?.push(submission);
    }
    return map;
  }, [submissions]);

  const recentEvents = useMemo(() => {
    const events: Array<RecruiterStageEventRecord & { candidateName: string }> = [];
    for (const submission of submissions) {
      for (const event of submission.stageEvents ?? []) {
        events.push({
          ...event,
          candidateName: buildCandidateName(submission),
        });
      }
    }
    return events
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      )
      .slice(0, 8);
  }, [submissions]);

  useEffect(() => {
    setSubmissions(initialSubmissions);
  }, [initialSubmissions]);

  async function handleStageChange(submissionId: string, stage: string) {
    setSavingId(submissionId);
    setError(null);

    try {
      const response = await fetch(`/api/recruiter/submissions/${submissionId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error ?? "Unable to update stage.");
      }

      const updated = data.submission as RecruiterSubmissionRecord;
      setSubmissions((prev) =>
        prev.map((submission) =>
          submission.id === submissionId ? updated : submission
        )
      );
      onSubmissionChange?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update stage.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {RECRUITER_STAGE_OPTIONS.map((stage) => (
          <Card key={stage} className="rounded-3xl border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">
                {RECRUITER_STAGE_LABELS[stage]}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${RECRUITER_STAGE_BADGE_CLASSES[stage]}`}
              >
                {grouped.get(stage)?.length ?? 0}
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {(grouped.get(stage) ?? []).length ? (
                grouped.get(stage)?.map((submission) => (
                  <div
                    key={submission.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {buildCandidateName(submission)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {submission.candidate.headline || submission.candidate.email || "Candidate profile"}
                    </div>
                    <select
                      value={normalizeRecruiterStage(submission.stage)}
                      onChange={(event) =>
                        void handleStageChange(submission.id, event.target.value)
                      }
                      disabled={savingId === submission.id}
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400"
                    >
                      {RECRUITER_STAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {RECRUITER_STAGE_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                  No candidates in this stage yet.
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Card className="rounded-3xl border-slate-200 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Recent stage updates</h3>
        <div className="mt-4 space-y-3">
          {recentEvents.length ? (
            recentEvents.map((event) => {
              const toStage = normalizeRecruiterStage(event.toStage);
              return (
                <div
                  key={event.id}
                  className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{event.candidateName}</span>
                    <span className="text-slate-400">moved to</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${RECRUITER_STAGE_BADGE_CLASSES[toStage]}`}
                    >
                      {RECRUITER_STAGE_LABELS[toStage]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{formatEventDate(event.createdAt)}</div>
                  {event.note ? <div className="text-sm text-slate-600">{event.note}</div> : null}
                </div>
              );
            })
          ) : (
            <div className="text-sm text-slate-500">
              Stage history will appear here after candidates start moving through the pipeline.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
