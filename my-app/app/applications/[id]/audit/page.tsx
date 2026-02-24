"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";

type AuditResponse = {
  ok: boolean;
  status: string;
  job: { id: string; source: string; jobUrl?: string; title?: string; company?: string; location?: string };
  payload: {
    fields: Record<string, unknown>;
    missing: string[];
    fieldStates: Array<{ path: string; value: unknown; isMissing: boolean }>;
  };
};

export default function ApplicationAuditPage() {
  const params = useParams<{ id: string }>();
  const applicationId = params.id;
  const [data, setData] = useState<AuditResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  async function loadAudit() {
    const res = await fetch(`/api/job-applications/${applicationId}/audit`, { cache: "no-store" });
    const payload = (await res.json()) as AuditResponse;
    setData(payload);
    setOverrides(payload.payload.fields ?? {});
  }

  useEffect(() => {
    if (!applicationId) return;
    loadAudit();
  }, [applicationId]);

  const missing = useMemo(() => data?.payload?.missing ?? [], [data]);

  async function save() {
    setSaving(true);
    await fetch(`/api/job-applications/${applicationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auditOverrides: overrides }),
    });
    await loadAudit();
    setSaving(false);
  }

  async function applyNow() {
    setApplying(true);
    await fetch(`/api/job-applications/${applicationId}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overrides }),
    });
    await loadAudit();
    setApplying(false);
  }

  const isGreenhouse = (data?.job?.source ?? "").includes("greenhouse");

  return (
    <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
      <section className="rounded border bg-white p-4">
        <h1 className="text-lg font-semibold">{data?.job?.title ?? "Application Audit"}</h1>
        <p className="text-sm text-gray-600">{data?.job?.company} • {data?.job?.location}</p>

        <div className="mt-3 inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs">
          {data?.status === "APPLYING" ? <ArrowPathIcon className="h-4 w-4" /> : null}
          {data?.status === "SUBMITTED" ? <CheckCircleIcon className="h-4 w-4" /> : null}
          {data?.status === "NEEDS_VERIFICATION" ? <ShieldExclamationIcon className="h-4 w-4" /> : null}
          <span>{data?.status ?? ""}</span>
        </div>

        {missing.length > 0 ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            <div className="flex items-center gap-1 font-medium">
              <ExclamationTriangleIcon className="h-4 w-4" />
              Fields that need attention
            </div>
            <ul className="ml-4 mt-1 list-disc">
              {missing.map((field) => <li key={field}>{field}</li>)}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {Object.entries(overrides).map(([key, value]) => (
            <label key={key} className="block">
              <span className="text-xs text-gray-600">{key}</span>
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={String(value ?? "")}
                onChange={(event) => setOverrides((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={save} className="rounded border px-3 py-1" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button
            onClick={applyNow}
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:bg-gray-300"
            disabled={applying || missing.length > 0}
          >
            {applying ? "Applying..." : "Apply Now"}
          </button>
        </div>
      </section>

      <section className="rounded border bg-white p-2">
        {isGreenhouse && data?.job?.jobUrl ? (
          <>
            <p className="mb-2 text-xs text-gray-600">If the form asks for verification, complete it here.</p>
            <iframe src={data.job.jobUrl} className="h-[75vh] w-full rounded border" />
          </>
        ) : (
          <div className="p-4 text-sm text-gray-600">Adzuna/external ATS application is handled by Playwright when you click Apply Now.</div>
        )}
      </section>
    </div>
  );
}
