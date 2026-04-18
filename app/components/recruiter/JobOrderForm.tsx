"use client";

import { useEffect, useMemo, useState } from "react";

import RecruiterCard from "@/app/components/recruiter/RecruiterCard";
import { Button } from "@/app/components/ui/button";
import type { RecruiterJobOrderRecord } from "@/app/components/recruiter/types";

type FormState = {
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
  salaryMin: string;
  salaryMax: string;
  description: string;
  requiredSkills: string;
  preferredSkills: string;
  requiredYearsExperience: string;
  status: string;
};

function buildInitialState(jobOrder?: RecruiterJobOrderRecord | null): FormState {
  return {
    title: jobOrder?.title ?? "",
    companyName: jobOrder?.companyName ?? "",
    location: jobOrder?.location ?? "",
    employmentType: jobOrder?.employmentType ?? "Full-time",
    salaryMin: jobOrder?.salaryMin != null ? String(jobOrder.salaryMin) : "",
    salaryMax: jobOrder?.salaryMax != null ? String(jobOrder.salaryMax) : "",
    description: jobOrder?.description ?? "",
    requiredSkills: (jobOrder?.requiredSkills ?? []).join(", "),
    preferredSkills: (jobOrder?.preferredSkills ?? []).join(", "),
    requiredYearsExperience:
      jobOrder?.requiredYearsExperience != null
        ? String(jobOrder.requiredYearsExperience)
        : "",
    status: jobOrder?.status ?? "OPEN",
  };
}

export default function JobOrderForm({
  initialJobOrder,
  onSaved,
  onCancel,
}: {
  initialJobOrder?: RecruiterJobOrderRecord | null;
  onSaved?: (jobOrder: RecruiterJobOrderRecord) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(initialJobOrder));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildInitialState(initialJobOrder));
  }, [initialJobOrder]);

  const isEditing = Boolean(initialJobOrder?.id);
  const title = useMemo(
    () => (isEditing ? "Edit job order" : "Add a job order"),
    [isEditing]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        isEditing ? `/api/recruiter/job-orders/${initialJobOrder?.id}` : "/api/recruiter/job-orders",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error ?? "Unable to save job order.");
      }

      setForm(buildInitialState(null));
      onSaved?.(data.jobOrder as RecruiterJobOrderRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save job order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecruiterCard className="rounded-2xl border-slate-200 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Keep the intake clean and structured so matching stays consistent.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Title</span>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="Senior Recruiter"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Company</span>
            <input
              value={form.companyName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, companyName: event.target.value }))
              }
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="Acme Staffing Client"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Location</span>
            <input
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="Chicago, IL"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Employment Type</span>
            <input
              value={form.employmentType}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, employmentType: event.target.value }))
              }
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="Full-time"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Salary Min</span>
            <input
              value={form.salaryMin}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, salaryMin: event.target.value }))
              }
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="85000"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Salary Max</span>
            <input
              value={form.salaryMax}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, salaryMax: event.target.value }))
              }
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="110000"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Years Required</span>
            <input
              value={form.requiredYearsExperience}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  requiredYearsExperience: event.target.value,
                }))
              }
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="3"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"
            >
              <option value="OPEN">OPEN</option>
              <option value="ON_HOLD">ON_HOLD</option>
              <option value="FILLED">FILLED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Description</span>
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
            className="min-h-32 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
            placeholder="Paste the client-facing job order notes or job description here."
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Required Skills</span>
            <textarea
              value={form.requiredSkills}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, requiredSkills: event.target.value }))
              }
              className="min-h-24 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="Boolean search, ATS, recruiting"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Preferred Skills</span>
            <textarea
              value={form.preferredSkills}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, preferredSkills: event.target.value }))
              }
              className="min-h-24 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
              placeholder="Account management, client delivery"
            />
          </label>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={saving}
            className="rounded-full !border-slate-200 !bg-white px-5 !text-slate-700 shadow-sm hover:!bg-slate-50"
          >
            {saving ? "Saving..." : isEditing ? "Save job order" : "Create job order"}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full !border-slate-200 !bg-white !text-slate-700 shadow-sm hover:!bg-slate-50"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </RecruiterCard>
  );
}
