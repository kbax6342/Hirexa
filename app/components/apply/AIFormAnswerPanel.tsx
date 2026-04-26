"use client";

import { useMemo, useState } from "react";
import { Check, Edit3, Save, SkipForward, Sparkles } from "lucide-react";
import type {
  FormFieldDescriptor,
  GeneratedFormAnswer,
  GenerateFormAnswersResult,
} from "@/app/lib/apply/formIntelligence/types";

type AIFormAnswerPanelProps = {
  fields: FormFieldDescriptor[];
  answers?: GeneratedFormAnswer[];
  blockedFields?: GenerateFormAnswersResult["blockedFields"];
  loading?: boolean;
  onGenerate?: () => void;
  onUseAnswers?: (answers: GeneratedFormAnswer[]) => void;
  onSaveAnswer?: (answer: GeneratedFormAnswer) => void;
  onSkipField?: (fieldId: string) => void;
  onContinueAutoApply?: () => void;
};

export function AIFormAnswerPanel({
  fields,
  answers = [],
  blockedFields = [],
  loading = false,
  onGenerate,
  onUseAnswers,
  onSaveAnswer,
  onSkipField,
  onContinueAutoApply,
}: AIFormAnswerPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const answerRows = useMemo(
    () =>
      answers.map((answer) => ({
        ...answer,
        draftValue: drafts[answer.fieldId] ?? String(answer.value ?? ""),
      })),
    [answers, drafts],
  );

  const safeAnswers = answerRows.filter(
    (answer) => answer.safeToAutofill && !answer.requiresUserReview,
  );

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">AI Form Answer Engine</h3>
          <p className="text-slate-600">
            {fields.length} fields detected, {safeAnswers.length} safe answers,{" "}
            {blockedFields.length} need review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-800 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            Generate answers
          </button>
          <button
            type="button"
            onClick={() => onUseAnswers?.(answers)}
            disabled={safeAnswers.length === 0 || loading}
            className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 font-medium text-white disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            Use these answers
          </button>
        </div>
      </div>

      {answerRows.length > 0 ? (
        <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {answerRows.map((answer) => (
            <div key={answer.fieldId} className="space-y-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-950">{answer.label}</p>
                  <p className="text-xs text-slate-500">
                    {answer.confidence} confidence · {answer.sourceBasis.join(", ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSaveAnswer?.({ ...answer, value: drafts[answer.fieldId] ?? answer.value })}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700"
                    title="Save answer for future"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSkipField?.(answer.fieldId)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700"
                    title="Skip field"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Edit3 className="mt-2 h-4 w-4 shrink-0 text-slate-400" />
                <textarea
                  value={answer.draftValue}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [answer.fieldId]: event.target.value,
                    }))
                  }
                  className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>
              <p className="text-xs text-slate-500">{answer.reason}</p>
            </div>
          ))}
        </div>
      ) : null}

      {blockedFields.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="font-medium text-amber-950">Review required</p>
          <div className="mt-2 space-y-2">
            {blockedFields.map((field) => (
              <div key={field.fieldId} className="text-amber-900">
                <span className="font-medium">{field.label}</span>
                <span className="text-amber-800"> · {field.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onContinueAutoApply}
          disabled={blockedFields.length > 0 || loading}
          className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-800 disabled:opacity-60"
        >
          Continue Auto Apply
        </button>
      </div>
    </section>
  );
}
