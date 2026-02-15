"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalSubmitApplication } from "../actions";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";

export default function SubmitClient({
  jobId,
  draftId,
  items,
}: {
  jobId: string;
  draftId: string;
  items: readonly (readonly [string, string | null])[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    try {
      const res = await finalSubmitApplication({ draftId });
      if (res?.ok) router.push(`/apply/${jobId}/done`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-indigo-50 p-3 ring-1 ring-indigo-100">
            <ShieldCheckIcon className="h-6 w-6 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Review your application</h1>
            <p className="mt-1 text-sm text-slate-600">
              Confirm everything looks right, then submit.
            </p>
          </div>
        </div>

        <div className="mt-6 divide-y rounded-2xl border">
          {items.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 p-4">
              <div className="text-sm font-semibold text-slate-900">{label}</div>
              <div className="text-sm text-slate-700 text-right break-all">
                {value ? value : <span className="text-rose-600">Missing</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => router.push(`/apply/${jobId}`)}
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
            type="button"
          >
            ← Edit info
          </button>

          <button
            disabled={submitting}
            onClick={onSubmit}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            type="button"
          >
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Tip: The “submit” step should enqueue your apply job (recommended) instead of running a browser automation in this request.
        </p>
      </div>
    </div>
  );
}
