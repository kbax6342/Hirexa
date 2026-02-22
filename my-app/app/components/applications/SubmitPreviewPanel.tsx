"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, DocumentDuplicateIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

type PreviewResponse = {
  ok: boolean;
  payload: {
    action: string;
    method: string;
    fields: Record<string, unknown>;
    fileFields: Array<{ name: string; fileName: string; mimeType: string; sizeBytes: number }>;
  };
  meta: {
    missing: string[];
    fieldStates: Array<{
      path: string;
      value: unknown;
      isMissing: boolean;
      rawValue?: unknown;
      submittedValue?: unknown;
    }>;
  };
  error?: string;
};

const previewCache = new Map<string, PreviewResponse>();

export default function SubmitPreviewPanel({ applicationId, answers }: { applicationId: string; answers: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const answersHash = useMemo(() => JSON.stringify(answers), [answers]);
  const cacheKey = `${applicationId}:${answersHash}`;

  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (previewCache.has(cacheKey)) {
          setPreview(previewCache.get(cacheKey) ?? null);
          setError(null);
          return;
        }

        setLoading(true);
        setError(null);

        const res = await fetch(`/api/applications/${applicationId}/audit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });

        const data = (await res.json()) as PreviewResponse;
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Preview unavailable");
        }

        if (cancelled) return;
        previewCache.set(cacheKey, data);
        setPreview(data);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Preview unavailable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [applicationId, answers, cacheKey, expanded]);

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">What will be submitted</p>
          <p className="text-xs text-slate-600">Preview the exact payload before clicking Apply Now.</p>
        </div>
        {expanded ? <ChevronUpIcon className="h-5 w-5 text-slate-600" /> : <ChevronDownIcon className="h-5 w-5 text-slate-600" />}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3">
          {loading ? <p className="text-sm text-slate-600">Loading preview...</p> : null}
          {error ? (
            <p className="flex items-center gap-2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">
              <ExclamationTriangleIcon className="h-4 w-4" />
              Preview unavailable.
            </p>
          ) : null}
          {preview ? (
            <>
              <p className="text-sm text-slate-700">
                {preview.meta.fieldStates.length} fields • {preview.meta.missing.length} missing
              </p>
              <pre className="max-h-56 overflow-auto rounded-md bg-white p-3 text-xs text-slate-800">
                {JSON.stringify(preview.payload, null, 2)}
              </pre>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(JSON.stringify(preview.payload, null, 2));
                }}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
                Copy JSON
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
