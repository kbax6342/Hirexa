"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AuditFieldState = {
  path: string;          // field name in form (e.g. "first_name")
  value: unknown;        // computed value to submit
  isMissing: boolean;    // required but missing
  rawValue?: unknown;
  submittedValue?: unknown;
};

type AuditItem = {
  name: string;
  label: string;
  type: string; // text/email/tel/select/textarea/file/radio/checkbox
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  reason?: string;
};

type AuditResponse = {
  ok: boolean;
  status?: string;
  jobTitle?: string;
  company?: string;
  location?: string | null;

  payload?: {
    action?: string;
    method?: string;
    fields?: Record<string, unknown>;
    fileFields?: Array<{ name: string; fileName: string; mimeType: string; sizeBytes: number }>;
  };

  meta?: {
    missing?: string[];
    fieldStates?: AuditFieldState[];
  };

  auditItems?: AuditItem[];
  error?: string;
};

function toStr(v: unknown) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(", ");
  return String(v);
}

export default function AuditClient({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<AuditResponse | null>(null);

  // local edits (overrides). You can wire these to a save/apply endpoint later.
  const [overrides, setOverrides] = useState<Record<string, string>>({});

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

  const fieldStates = Array.isArray(data?.meta?.fieldStates) ? data!.meta!.fieldStates! : [];
  const auditItems = Array.isArray(data?.auditItems) ? data!.auditItems! : [];
  const fileFields = Array.isArray(data?.payload?.fileFields) ? data!.payload!.fileFields! : [];

  const byName = useMemo(() => {
    const map = new Map<string, AuditItem>();
    for (const item of auditItems) map.set(item.name, item);
    return map;
  }, [auditItems]);

  const missingCount = fieldStates.filter((f) => f?.isMissing).length;

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

      {/* Resume / files preview */}
      {fileFields.length > 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Files</p>
          <div className="mt-2 space-y-2">
            {fileFields.map((f) => (
              <div key={f.name} className="flex flex-col text-sm">
                <span className="font-medium text-gray-800">{f.name}</span>
                <span className="text-gray-600">
                  {f.fileName} • {f.mimeType} • {Math.round((f.sizeBytes ?? 0) / 1024)} KB
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Full form fields (single column) */}
      <div className="mt-6 space-y-4">
        {fieldStates.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No fields were parsed yet. Ensure /api/applications/:id/audit returns meta.fieldStates.
          </div>
        ) : null}

        {fieldStates.map((fs) => {
          const item = byName.get(fs.path);
          const label = item?.label ?? fs.path;
          const type = item?.type ?? "text";
          const required = Boolean(item?.required);

          const computed = toStr(fs.value);
          const shownValue = overrides[fs.path] ?? computed;
          const isMissing = required && shownValue.trim().length === 0;

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
                    value={shownValue}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [fs.path]: e.target.value }))
                    }
                    placeholder="Enter value"
                  />
                ) : type === "select" && item?.options ? (
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    value={shownValue}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [fs.path]: e.target.value }))
                    }
                  >
                    <option value="">Select…</option>
                    {item.options.map((o) => (
                      <option key={`${o.value}-${o.label}`} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : type === "file" ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    File fields are pulled from your database (ResumeFile) and will be attached on
                    submit.
                  </div>
                ) : (
                  <input
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    value={shownValue}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [fs.path]: e.target.value }))
                    }
                    placeholder="Enter value"
                  />
                )}
              </div>

              <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-gray-700">Will submit</p>
                <p className="mt-1 break-words text-sm text-gray-900">
                  {shownValue.trim().length ? shownValue : <span className="text-gray-500">—</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}