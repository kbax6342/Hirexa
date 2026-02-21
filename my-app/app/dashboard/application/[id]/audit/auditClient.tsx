"use client";

import { useEffect, useMemo, useState } from "react";

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
  prefill: Record<string, string>;
  auditItems: AuditItem[];
};

export default function AuditClient({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState<string>("IN_PREPARATION");
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadAudit() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/applications/${applicationId}/audit`, { cache: "no-store" });
        const data = (await res.json()) as Partial<AuditResponse> & { error?: string };

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load audit details");
        }

        if (cancelled) return;

        setAuditItems(Array.isArray(data.auditItems) ? data.auditItems : []);
        setStatus(String(data.status ?? "IN_PREPARATION"));
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load audit");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAudit();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const requiredItems = useMemo(() => auditItems.filter((item) => item.required), [auditItems]);

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
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Application audit</p>
      <h1 className="mt-2 text-2xl font-semibold text-gray-900">Review unresolved application fields</h1>
      <p className="mt-2 text-sm text-gray-600">Status: {status}</p>

      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

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
