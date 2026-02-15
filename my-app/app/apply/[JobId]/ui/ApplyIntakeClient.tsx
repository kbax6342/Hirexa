"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplyField, ApplyFieldKey } from "@/app/lib/apply/fields";
import { saveDraftIntake } from "../actions";
import {
  BoltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";

export default function ApplyIntakeClient({
  jobId,
  draftId,
  jobUrl,
  fields,
  missingRequiredKeys,
  prefill,
}: {
  jobId: string;
  draftId: string;
  jobUrl?: string | null;
  fields: ApplyField[];
  missingRequiredKeys: ApplyFieldKey[];
  prefill: Record<string, any>;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const visibleFields = useMemo(() => {
    if (showAll) return fields;
    // Only show missing required (clean “minimal friction” flow)
    return fields.filter((f) => missingRequiredKeys.includes(f.key));
  }, [showAll, fields, missingRequiredKeys]);

  const nothingMissing = missingRequiredKeys.length === 0;

  async function onSubmit(formData: FormData) {
    setSaving(true);
    try {
      const res = await saveDraftIntake(formData);
      if (res?.ok) router.push(`/apply/${jobId}/review`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BoltIcon className="h-5 w-5 text-sky-600" />
              <h1 className="text-xl font-semibold text-slate-900">Auto Apply setup</h1>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              We pulled what we could from your profile. Fill in what’s missing, then review and submit.
            </p>
            {jobUrl ? (
              <p className="mt-2 text-xs text-slate-500 break-all">Job link: {jobUrl}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200"
          >
            {showAll ? "Show only missing" : "Edit all"}
          </button>
        </div>

        {nothingMissing && !showAll ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircleIcon className="h-5 w-5 text-emerald-700 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-emerald-900">All required info found</div>
              <div className="text-sm text-emerald-800">
                You can continue to review & submit.
              </div>
              <button
                type="button"
                onClick={() => router.push(`/apply/${jobId}/review`)}
                className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <form action={onSubmit} className="mt-6 space-y-4">
            <input type="hidden" name="draftId" value={draftId} />
            <input type="hidden" name="jobId" value={jobId} />

            {visibleFields.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-700 mt-0.5" />
                <div className="text-sm text-amber-900">
                  Nothing to edit here — go to review.
                </div>
              </div>
            ) : null}

            {visibleFields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-sm font-semibold text-slate-900">
                  {f.label}
                  {f.required ? <span className="text-rose-600"> *</span> : null}
                </label>
                <input
                  name={f.key}
                  defaultValue={String(prefill[f.key] ?? "")}
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                />
              </div>
            ))}

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => router.push("/questions")}
                className="text-sm font-semibold text-slate-700 hover:text-slate-900"
              >
                ← Back
              </button>

              <button
                disabled={saving}
                className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                type="submit"
              >
                {saving ? "Saving…" : "Save & review"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
