"use client";

import { useCallback, useEffect, useState } from "react";

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
  };

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

  const loadAudit = useCallback(async () => {
    const res = await fetch(`/api/applications/${applicationId}/audit`, { cache: "no-store" });
    const payload = (await res.json()) as AuditResponse;

    if (!res.ok || !payload.ok) {
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

  const fieldStates = Array.isArray(data?.meta?.fieldStates) ? data.meta!.fieldStates! : [];

  const missingCount = fieldStates.filter((f) => f.isMissing).length;

  const getCurrentValue = (field: AuditFieldState) => {
    if (Object.prototype.hasOwnProperty.call(overrides, field.path)) {
      return overrides[field.path];
    }
    return toInitialValue(field);
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
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Application Audit</h1>
        <p className="text-lg font-medium text-gray-800">{title}</p>

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

        {fieldStates.map((fs) => {
          const label = fieldLabel(fs);
          const type = fs.type || "text";
          const required = Boolean(fs.required);
          const current = getCurrentValue(fs);

          const asText = Array.isArray(current)
            ? current.join(", ")
            : typeof current === "string"
              ? current
              : toDisplayText(current);

          const isMissing = required && asText.trim().length === 0;

          return (
            <div
              key={fs.path}
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
                    <span className="font-mono">{fs.path}</span>
                    <span className="mx-2">•</span>
                    <span className="font-medium">{type}</span>
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
                    value={typeof current === "string" ? current : asText}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [fs.path]: e.target.value }))
                    }
                    placeholder={fs.placeholder || "Enter value"}
                  />
                ) : type === "select" ? (
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    value={typeof current === "string" ? current : ""}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [fs.path]: e.target.value }))
                    }
                  >
                    <option value="">Select…</option>
                    {(fs.options ?? []).map((o) => (
                      <option key={`${o.value}-${o.label}`} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : type === "radio" ? (
                  <div className="space-y-2">
                    {(fs.options ?? []).map((o) => {
                      const checked = (typeof current === "string" ? current : "") === o.value;
                      return (
                        <label key={`${fs.path}-${o.value}`} className="flex items-center gap-2 text-sm text-gray-900">
                          <input
                            type="radio"
                            name={fs.path}
                            checked={checked}
                            onChange={() =>
                              setOverrides((prev) => ({ ...prev, [fs.path]: o.value }))
                            }
                          />
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : type === "checkbox" ? (
                  <div className="space-y-2">
                    {(fs.options ?? []).map((o) => {
                      const currentList = Array.isArray(current) ? current : [];
                      const checked = currentList.includes(o.value);
                      return (
                        <label key={`${fs.path}-${o.value}`} className="flex items-center gap-2 text-sm text-gray-900">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setOverrides((prev) => {
                                const list = Array.isArray(getCurrentValue(fs))
                                  ? [...(getCurrentValue(fs) as string[])]
                                  : [];

                                if (e.target.checked) {
                                  if (!list.includes(o.value)) list.push(o.value);
                                } else {
                                  const idx = list.indexOf(o.value);
                                  if (idx >= 0) list.splice(idx, 1);
                                }

                                return { ...prev, [fs.path]: list };
                              });
                            }}
                          />
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type={inputTypeFor(type)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    value={typeof current === "string" ? current : asText}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [fs.path]: e.target.value }))
                    }
                    placeholder={fs.placeholder || "Enter value"}
                  />
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
    </section>
  );
}
