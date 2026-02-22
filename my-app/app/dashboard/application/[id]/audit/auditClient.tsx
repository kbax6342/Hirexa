"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Option = { value: string; label: string };
type Field = { name: string; type: string; label: string; required: boolean; options?: Option[] };
type AnswerValue = string | string[];
type AnswersMap = Record<string, AnswerValue>;

type AuditResponse = {
  ok: boolean;
  status: string;
  form: { action: string; method: string; hidden: Record<string, string>; fields: Field[] };
  prefill: Record<string, string>;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  missingRequired: string[];
  resume: { fileName: string; mimeType: string } | null;
  error?: string;
};

function normalize(value: AnswerValue | undefined, fieldType: string): AnswerValue {
  if (fieldType === "checkbox") {
    if (Array.isArray(value)) return value;
    const text = String(value ?? "").trim();
    return text ? text.split(",").map((item) => item.trim()).filter(Boolean) : [];
  }
  if (Array.isArray(value)) return value[0] ?? "";
  return String(value ?? "");
}

function displayValue(value: AnswerValue | undefined) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

export default function AuditClient({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState("IN_PREPARATION");
  const [data, setData] = useState<AuditResponse | null>(null);
  const [answers, setAnswers] = useState<AnswersMap>({});

  const loadAudit = useCallback(async () => {
    const res = await fetch(`/api/applications/${applicationId}/audit`, { cache: "no-store" });
    const payload = (await res.json()) as AuditResponse;
    if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Unable to load audit");
    setData(payload);
    setAnswers(payload.answers ?? {});
    setStatus(payload.status);
  }, [applicationId]);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadAudit();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load audit");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAudit]);

  const computedFinal = useMemo(() => {
    const merged: AnswersMap = {};
    for (const field of data?.form.fields ?? []) {
      const answer = normalize(answers[field.name], field.type);
      const prefill = normalize(data?.prefill[field.name], field.type);
      merged[field.name] = Array.isArray(answer)
        ? answer.length > 0
          ? answer
          : (prefill as string[])
        : answer || (prefill as string) || "";
    }
    return merged;
  }, [answers, data?.form.fields, data?.prefill]);

  const missingRequired = useMemo(() => {
    const missing: string[] = [];
    for (const field of data?.form.fields ?? []) {
      const value = computedFinal[field.name];
      if (!field.required) continue;
      if (field.type === "file") {
        if (!data?.resume) missing.push(field.name);
      } else if (Array.isArray(value)) {
        if (value.length === 0) missing.push(field.name);
      } else if (!String(value ?? "").trim()) {
        missing.push(field.name);
      }
    }
    return missing;
  }, [computedFinal, data?.form.fields, data?.resume]);

  const canApply = missingRequired.length === 0 && !success;

  async function saveAnswers() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/applications/${applicationId}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = (await res.json()) as AuditResponse;
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Unable to save answers");
      setData(payload);
      setStatus(payload.status);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to save answers");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyNow() {
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch(`/api/applications/${applicationId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = (await res.json()) as { ok?: boolean; status?: string; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Unable to submit");
      setStatus(payload.status ?? "SENT");
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const updateValue = (name: string, value: AnswerValue) => setAnswers((prev) => ({ ...prev, [name]: value }));

  if (loading) return <p className="text-sm text-gray-600">Loading application audit…</p>;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">Application Audit</h1>
      <p className="mt-1 text-sm text-gray-600">Status: {status}</p>
      {error ? <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="mt-4 rounded bg-green-50 p-3 text-sm text-green-700">Submitted successfully.</p> : null}

      <div className="mt-6 space-y-4">
        {data?.form.fields.map((field) => {
          const missing = missingRequired.includes(field.name);
          const fieldId = `field-${field.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
          const finalValue = computedFinal[field.name];
          const baseInputClass = `mt-2 w-full rounded border px-3 py-2 text-sm ${missing ? "border-red-400" : "border-gray-300"}`;

          return (
            <div key={field.name} className={`rounded-lg border p-4 ${missing ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}>
              <label htmlFor={fieldId} className="block text-sm font-medium text-gray-900">
                {field.label || field.name} {field.required ? <span className="text-red-600">*</span> : null}
              </label>
              <p className="font-mono text-xs text-gray-500">{field.name}</p>

              {field.type === "textarea" ? (
                <textarea
                  id={fieldId}
                  className={`${baseInputClass} min-h-24`}
                  value={String(normalize(answers[field.name], field.type))}
                  onChange={(e) => updateValue(field.name, e.target.value)}
                />
              ) : field.type === "select" ? (
                <select
                  id={fieldId}
                  className={baseInputClass}
                  value={String(normalize(answers[field.name], field.type))}
                  onChange={(e) => updateValue(field.name, e.target.value)}
                >
                  <option value="">Select an option</option>
                  {field.options?.map((option) => (
                    <option key={`${field.name}-${option.value}`} value={option.value}>
                      {option.label || option.value}
                    </option>
                  ))}
                </select>
              ) : field.type === "radio" ? (
                <div className={`mt-2 space-y-2 rounded border p-3 ${missing ? "border-red-400" : "border-gray-300"}`}>
                  {field.options?.map((option) => (
                    <label key={`${field.name}-${option.value}`} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name={field.name}
                        value={option.value}
                        checked={String(normalize(answers[field.name], field.type)) === option.value}
                        onChange={(e) => updateValue(field.name, e.target.value)}
                      />
                      {option.label || option.value}
                    </label>
                  ))}
                </div>
              ) : field.type === "checkbox" ? (
                <div className={`mt-2 space-y-2 rounded border p-3 ${missing ? "border-red-400" : "border-gray-300"}`}>
                  {field.options?.map((option) => {
                    const current = normalize(answers[field.name], field.type) as string[];
                    return (
                      <label key={`${field.name}-${option.value}`} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          value={option.value}
                          checked={current.includes(option.value)}
                          onChange={(e) =>
                            updateValue(
                              field.name,
                              e.target.checked
                                ? [...new Set([...current, option.value])]
                                : current.filter((item) => item !== option.value)
                            )
                          }
                        />
                        {option.label || option.value}
                      </label>
                    );
                  })}
                </div>
              ) : field.type === "file" ? (
                <div className={`mt-2 rounded border border-dashed p-3 text-sm ${missing ? "border-red-400" : "border-gray-300"}`}>
                  {data.resume ? `Resume detected: ${data.resume.fileName} (PDF)` : "No resume PDF detected in profile."}
                </div>
              ) : (
                <input
                  id={fieldId}
                  type={field.type || "text"}
                  className={baseInputClass}
                  value={String(normalize(answers[field.name], field.type))}
                  onChange={(e) => updateValue(field.name, e.target.value)}
                />
              )}

              <p className="mt-2 text-xs text-gray-600">Value to submit: {displayValue(finalValue) || "(empty)"}</p>
              {missing ? <p className="mt-1 text-xs text-red-600">Required field is missing.</p> : null}
            </div>
          );
        })}
      </div>

      <details className="mt-6 rounded-lg border border-gray-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-800">Hidden fields</summary>
        <div className="mt-3 space-y-2">
          {Object.entries(data?.form.hidden ?? {}).map(([name, value]) => (
            <div key={name} className="rounded bg-gray-50 p-2 text-xs">
              <p className="font-mono text-gray-700">{name}</p>
              <p className="text-gray-600">{value}</p>
            </div>
          ))}
        </div>
      </details>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={saveAnswers}
          disabled={saving || submitting}
          className="rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save answers"}
        </button>
        <button
          type="button"
          onClick={handleApplyNow}
          disabled={submitting || !canApply}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Submitting..." : success ? "Submitted" : "Apply Now"}
        </button>
      </div>
    </section>
  );
}
