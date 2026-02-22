"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardDocumentIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, ListBulletIcon } from "@heroicons/react/24/outline";
import SubmitPreviewPanel from "@/app/components/applications/SubmitPreviewPanel";

type AuditItem = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  reason: string;
  options?: Array<{ value: string; label: string }>;
};

type AuditResponse = {
  ok: boolean;
  status: string;
  jobTitle?: string | null; // ✅ ADD THIS
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
  auditItems?: AuditItem[];
  error?: string;
};

export default function AuditClient({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState<string>("IN_PREPARATION");
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<AuditResponse | null>(null);
  const [showRawVsSubmitted, setShowRawVsSubmitted] = useState(false);
  const [jobTitle, setJobTitle] = useState<string | null>(null);

  const loadAudit = useCallback(
    async (payloadAnswers?: Record<string, string>) => {
      const method = payloadAnswers ? "POST" : "GET";
      const res = await fetch(`/api/applications/${applicationId}/audit`, {
        method,
        cache: "no-store",
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify({ answers: payloadAnswers }) : undefined,
      });

      const data = (await res.json()) as AuditResponse;
      

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to load audit details");
      }

      setPreview(data);
      setStatus(String(data.status ?? "IN_PREPARATION"));
      setAuditItems(Array.isArray(data.auditItems) ? data.auditItems : []);
      setJobTitle(data.jobTitle ?? null);
    },
    [applicationId]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        await loadAudit();
        if (cancelled) return;
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load audit");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadAudit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAudit(answers).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Preview unavailable");
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [answers, loadAudit]);

  const requiredItems = useMemo(() => auditItems.filter((item) => item.required), [auditItems]);

  const groupedStates = useMemo(() => {
    const groups: Record<string, Array<AuditResponse["meta"]["fieldStates"][number]>> = {};
    for (const state of preview?.meta.fieldStates ?? []) {
      const prefix = state.path.split(".")[0] || "other";
      groups[prefix] = groups[prefix] ?? [];
      groups[prefix].push(state);
    }
    return groups;
  }, [preview?.meta.fieldStates]);

  const hasRawVsSubmitted = useMemo(
    () =>
      (preview?.meta.fieldStates ?? []).some(
        (state) => JSON.stringify(state.rawValue) !== JSON.stringify(state.submittedValue)
      ),
    [preview?.meta.fieldStates]
  );

  const canApply = requiredItems.every((item) => String(answers[item.name] ?? "").trim().length > 0);

  async function handleApplyNow() {
    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/applications/${applicationId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string; status?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to submit application");
      }

      setSuccess(true);
      setStatus(String(data.status ?? "SENT"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to submit application");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-600">Loading your application audit...</p>;
  }

  return (
    <section className="rounded-xl mt-9 border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Application audit</p>
      <h1 className="mt-2 text-2xl font-semibold text-gray-900">Review unresolved application fields</h1>
      {jobTitle ? (
        <p className="mt-1 text-lg font-medium text-blue-700">
          {jobTitle}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-gray-600">Status: {status}</p>

      {preview ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ListBulletIcon className="h-4 w-4" />
            Submitting {preview.meta.fieldStates.length} fields • {preview.meta.missing.length} missing
          </p>

          {preview.meta.missing.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
              {preview.meta.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}

          {hasRawVsSubmitted ? (
            <button
              type="button"
              onClick={() => setShowRawVsSubmitted((prev) => !prev)}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              {showRawVsSubmitted ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              {showRawVsSubmitted ? "Hide raw vs submitted" : "Show raw vs submitted"}
            </button>
          ) : null}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {Object.entries(groupedStates).map(([group, items]) => (
              <div key={group} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{group}</p>
                <div className="mt-2 space-y-2">
                  {items.map((item) => (
                    <div key={item.path} className="rounded bg-slate-50 p-2 text-xs">
                      <p className="font-medium text-slate-700">{item.path}</p>
                      <p className="text-slate-600">value: {JSON.stringify(item.value)}</p>
                      {showRawVsSubmitted ? (
                        <>
                          <p className="text-slate-500">raw: {JSON.stringify(item.rawValue)}</p>
                          <p className="text-slate-500">submitted: {JSON.stringify(item.submittedValue)}</p>
                        </>
                      ) : null}
                      {item.isMissing ? <p className="text-amber-700">missing</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Raw JSON</p>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(preview.payload, null, 2)}
            </pre>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(JSON.stringify(preview.payload, null, 2));
              }}
              className="mt-2 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              Copy JSON
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <ExclamationTriangleIcon className="h-4 w-4" />
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Application submitted successfully. Greenhouse will send the confirmation email.
        </p>
      ) : null}

      {auditItems.length === 0 ? (
        <p className="mt-5 text-sm text-gray-700">No additional answers are needed. You can apply now.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {auditItems.map((item) => (
            <div key={item.name} className="rounded-lg border border-gray-200 p-4">
              <label className="text-sm font-medium text-gray-900" htmlFor={item.name}>
                {item.label}
                {item.required ? <span className="ml-1 text-red-600">*</span> : null}
              </label>
              <p className="mt-1 text-xs text-gray-500">{item.reason}</p>

              {item.type === "select" ? (
                <select
                  id={item.name}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={answers[item.name] ?? ""}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [item.name]: event.target.value }))}
                >
                  <option value="">Select an option</option>
                  {item.options?.map((option) => (
                    <option key={`${item.name}-${option.value}`} value={option.value}>
                      {option.label || option.value}
                    </option>
                  ))}
                </select>
              ) : item.type === "textarea" ? (
                <textarea
                  id={item.name}
                  className="mt-2 min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={answers[item.name] ?? ""}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [item.name]: event.target.value }))}
                />
              ) : (
                <input
                  id={item.name}
                  type="text"
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={answers[item.name] ?? ""}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [item.name]: event.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <SubmitPreviewPanel applicationId={applicationId} answers={answers} />

      <button
        type="button"
        onClick={handleApplyNow}
        disabled={submitting || !canApply || success}
        className="mt-6 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Submitting..." : success ? "Submitted" : "Apply Now"}
      </button>
    </section>
  );
}
