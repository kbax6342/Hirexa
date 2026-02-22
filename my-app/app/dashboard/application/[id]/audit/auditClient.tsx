// my-app/app/dashboard/application/[id]/audit/auditClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Option = { value: string; label: string };

type AuditFieldState = {
  path: string;
  label?: string;
  placeholder?: string;
  type: string;
  required: boolean;
  options: Option[];
  value: unknown;
  isMissing: boolean;
  rawValue?: unknown;
  submittedValue?: unknown;
  countryFieldKind?: "country" | "countryCode" | null;
  isCountryField?: boolean;
};

type AuditResponse = {
  ok: boolean;
  status?: string;
  jobTitle?: string;
  company?: string;
  location?: string | null;

  meta?: {
    missing?: string[];
    fieldStates?: AuditFieldState[];
    actionSuspicious?: boolean;
    action?: string;
    method?: string;
  };

  warning?: string;
  error?: string;
};

function isTextValueLabel(label: string) {
  return /(^|\W)text_value(\W|$)/i.test(label.trim());
}

function toDisplayText(v: unknown) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((item) => String(item)).filter(Boolean).join(", ");
  return String(v);
}

function toInitialValue(field: AuditFieldState): string | string[] {
  if (field.type === "checkbox") {
    if (Array.isArray(field.value)) return field.value.map((v) => String(v)).filter(Boolean);
    if (typeof field.value === "string" && field.value.trim()) {
      return field.value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  }

  return toDisplayText(field.value);
}

function fieldLabel(field: AuditFieldState) {
  const label = (field.label ?? "").trim();
  const placeholder = (field.placeholder ?? "").trim();

  if (label && !isTextValueLabel(label)) return label;
  if (placeholder) return placeholder;
  return field.path;
}

function inputTypeFor(type: string) {
  if (["text", "email", "tel", "url", "number", "date"].includes(type)) return type;
  return "text";
}

export default function AuditClient({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | string[]>>({});
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyDebug, setApplyDebug] = useState<{
    reason?: string;
    hints?: string[];
    finalUrl?: string;
    errorSnippet?: string;
  } | null>(null);

  const loadAudit = useCallback(async () => {
    const res = await fetch(`/api/applications/${applicationId}/audit`, { cache: "no-store" });
    const payload = (await res.json()) as AuditResponse;

    if (!res.ok) {
      throw new Error(payload.error ?? "Unable to load audit");
    }

    setData(payload);
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

  const fieldStates = useMemo(
    () => (Array.isArray(data?.meta?.fieldStates) ? data!.meta!.fieldStates! : []),
    [data]
  );

  const missingCount = useMemo(() => fieldStates.filter((f) => Boolean(f.isMissing)).length, [fieldStates]);
  const actionSuspicious = Boolean(data?.meta?.actionSuspicious);
  const warning = data?.warning;

  const getCurrentValue = useCallback(
    (field: AuditFieldState) => {
      if (Object.prototype.hasOwnProperty.call(overrides, field.path)) {
        return overrides[field.path];
      }
      return toInitialValue(field);
    },
    [overrides]
  );

  // ✅ New helper (used by the snippet you requested)
  const handleChange = useCallback((path: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [path]: value }));
  }, []);

  const buildAnswersPayload = useCallback(() => {
    const next: Record<string, string | string[]> = {};

    for (const field of fieldStates) {
      const current = getCurrentValue(field);
      if (Array.isArray(current)) {
        next[field.path] = current.map((item) => String(item)).filter(Boolean);
      } else {
        next[field.path] = String(current ?? "").trim();
      }
    }

    return next;
  }, [fieldStates, getCurrentValue]);

  const handleApplyNow = async () => {
    try {
      setApplyLoading(true);
      setApplyMessage(null);
      setApplyDebug(null);

      const res = await fetch(`/api/applications/${applicationId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: buildAnswersPayload() }),
      });

      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        missingRequired?: string[];
        confirmation?: string;
        reason?: string;
        hints?: string[];
        finalUrl?: string;
        errorSnippet?: string;
      };

      if (!res.ok || !payload.ok) {
        const missing = Array.isArray(payload.missingRequired)
          ? ` Missing required: ${payload.missingRequired.join(", ")}`
          : "";
        setApplyDebug({
          reason: payload.reason,
          hints: Array.isArray(payload.hints) ? payload.hints : [],
          finalUrl: payload.finalUrl,
          errorSnippet: payload.errorSnippet,
        });
        throw new Error((payload.error ?? "Unable to submit application") + missing);
      }

      setApplyMessage(
        payload.confirmation
          ? `${payload.confirmation}. Confirmed: You applied. Check your email for Greenhouse confirmation.`
          : "Confirmed: You applied. Check your email for Greenhouse confirmation."
      );
      await loadAudit();
    } catch (e: unknown) {
      setApplyMessage(e instanceof Error ? e.message : "Failed to apply");
    } finally {
      setApplyLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-5 w-80 animate-pulse rounded bg-gray-100" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-4">
              <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
              <div className="mt-3 h-10 w-full animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <h1 className="text-lg font-semibold">Application Audit</h1>
        <p className="mt-2">{error}</p>
      </section>
    );
  }

  const title = data?.jobTitle ?? "Untitled role";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 text-black shadow-sm">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Application Audit</h1>
        <p className="text-lg font-medium text-gray-800">{title}</p>

        {warning ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {warning}
          </div>
        ) : null}

        {data?.ok === false && data?.error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {data.error}
          </div>
        ) : null}

        {data?.company || data?.location ? (
          <p className="text-sm text-gray-600">
            {[data?.company, data?.location].filter(Boolean).join(" • ")}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {data?.status ? (
            <span className="rounded-full bg-gray-100 px-2 py-1 font-semibold text-gray-700">
              Status: {data.status}
            </span>
          ) : null}

          <span
            className={[
              "rounded-full px-2 py-1 font-semibold",
              missingCount > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700",
            ].join(" ")}
          >
            Missing required: {missingCount}
          </span>

          {fieldStates.length ? (
            <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">
              Fields: {fieldStates.length}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {fieldStates.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No fields were parsed yet. Ensure /api/applications/:id/audit returns meta.fieldStates.
          </div>
        ) : null}

        {fieldStates.map((field) => {
          const label = fieldLabel(field);
          const type = field.type || "text";
          const required = Boolean(field.required);

          // ✅ The snippet you requested needs a simple "value" string
          const valueRaw = getCurrentValue(field);
          const value = Array.isArray(valueRaw) ? valueRaw.join(", ") : String(valueRaw ?? "");

          const asText = Array.isArray(valueRaw)
            ? valueRaw.join(", ")
            : typeof valueRaw === "string"
              ? valueRaw
              : toDisplayText(valueRaw);

          const isMissing = required && asText.trim().length === 0;

          return (
            <div
              key={field.path}
              className={[
                "rounded-lg border p-4",
                isMissing ? "border-red-300 bg-red-50/40" : "border-gray-200 bg-white",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {label} {required ? <span className="text-red-600">*</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    <span className="font-mono">{field.path}</span>
                    <span className="mx-2">•</span>
                    <span className="font-medium">{type}</span>
                    {field.countryFieldKind ? (
                      <>
                        <span className="mx-2">•</span>
                        <span className="font-medium text-indigo-600">{field.countryFieldKind}</span>
                      </>
                    ) : null}
                  </p>
                </div>

                {isMissing ? (
                  <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                    Required
                  </span>
                ) : null}
              </div>

              <div className="mt-3">
                {type === "textarea" ? (
                  <textarea
                    className="min-h-[96px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    value={value}
                    onChange={(e) => handleChange(field.path, e.target.value)}
                    placeholder={field.placeholder || "Enter value"}
                  />
                ) : type === "radio" ? (
                  <div className="space-y-2">
                    {(field.options ?? []).map((o) => {
                      const checked = value === o.value;
                      return (
                        <label
                          key={`${field.path}-${o.value}`}
                          className="flex items-center gap-2 text-sm text-gray-900"
                        >
                          <input
                            type="radio"
                            name={field.path}
                            checked={checked}
                            onChange={() => handleChange(field.path, o.value)}
                          />
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : type === "checkbox" ? (
                  <div className="space-y-2">
                    {(field.options ?? []).map((o) => {
                      const currentList = Array.isArray(valueRaw) ? valueRaw : [];
                      const checked = currentList.includes(o.value);
                      return (
                        <label
                          key={`${field.path}-${o.value}`}
                          className="flex items-center gap-2 text-sm text-gray-900"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setOverrides((prev) => {
                                const list = Array.isArray(getCurrentValue(field))
                                  ? [...(getCurrentValue(field) as string[])]
                                  : [];

                                if (e.target.checked) {
                                  if (!list.includes(o.value)) list.push(o.value);
                                } else {
                                  const idx = list.indexOf(o.value);
                                  if (idx >= 0) list.splice(idx, 1);
                                }

                                return { ...prev, [field.path]: list };
                              });
                            }}
                          />
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  // ✅ Requested snippet (select if options exist, else input)
                  <>
                    {field.options?.length ? (
                      <select
                        value={value}
                        onChange={(e) => handleChange(field.path, e.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 p-2"
                      >
                        <option value="">Select...</option>
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={inputTypeFor(type)}
                        value={value}
                        onChange={(e) => handleChange(field.path, e.target.value)}
                        placeholder={field.placeholder || field.label || "Enter value"}
                        className="mt-1 w-full rounded-md border border-gray-300 p-2"
                      />
                    )}
                  </>
                )}
              </div>

              <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-gray-700">Will submit</p>
                <p className="mt-1 break-words text-sm text-gray-900">
                  {asText.trim().length ? asText : <span className="text-gray-500">—</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleApplyNow}
          disabled={applyLoading || actionSuspicious || missingCount > 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {applyLoading ? "Applying..." : "Apply Now"}
        </button>
        {applyMessage ? <p className="text-sm text-gray-700">{applyMessage}</p> : null}
      </div>

      {actionSuspicious ? (
        <p className="mt-2 text-sm text-amber-800">
          Apply is disabled because we couldn&apos;t find the Greenhouse submit endpoint yet.
        </p>
      ) : null}

      {applyDebug ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {applyDebug.reason ? (
            <p>
              <span className="font-semibold">Reason:</span> {applyDebug.reason}
            </p>
          ) : null}

          {applyDebug.hints?.length ? (
            <div className="mt-2">
              <p className="font-semibold">Hints</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {applyDebug.hints.map((hint, idx) => (
                  <li key={`${hint}-${idx}`}>{hint}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {applyDebug.finalUrl ? (
            <p className="mt-2 break-all">
              <span className="font-semibold">Final URL:</span> {applyDebug.finalUrl}
            </p>
          ) : null}

          {applyDebug.errorSnippet ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold">Response snippet</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded border border-amber-200 bg-white p-2 text-xs text-amber-900">
                {applyDebug.errorSnippet}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
