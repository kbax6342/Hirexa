"use client";

import { useMemo, useState } from "react";
import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

import RecruiterCard from "@/app/components/recruiter/RecruiterCard";
import type { RecruiterProfileRecord } from "@/app/components/recruiter/types";
import { Button } from "@/app/components/ui/button";

type RecruiterProfileCardProps = {
  initialProfile: RecruiterProfileRecord;
  initialCompletion: number;
  initialChecklist: string[];
};

type ProfileFormState = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  workEmail: string;
  phone: string;
  linkedinUrl: string;
  agencyName: string;
  agencyWebsite: string;
  city: string;
  state: string;
  companyDescription: string;
  hiringIndustries: string;
  recruitingSpecialties: string;
  hiringRoles: string;
  seniorityLevels: string;
  employmentTypes: string;
  workModes: string;
  hiringLocations: string;
  calendarUrl: string;
  intakeEmail: string;
  resumeSubmissionEmail: string;
  outreachTone: string;
  autoFollowUp: boolean;
};

function joinList(values: string[] | null | undefined) {
  return (values ?? []).join(", ");
}

function buildFormState(profile: RecruiterProfileRecord): ProfileFormState {
  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    jobTitle: profile.jobTitle ?? "",
    workEmail: profile.workEmail ?? "",
    phone: profile.phone ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    agencyName: profile.agencyName ?? "",
    agencyWebsite: profile.agencyWebsite ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    companyDescription: profile.companyDescription ?? "",
    hiringIndustries: joinList(profile.hiringIndustries),
    recruitingSpecialties: joinList(profile.recruitingSpecialties),
    hiringRoles: joinList(profile.hiringRoles),
    seniorityLevels: joinList(profile.seniorityLevels),
    employmentTypes: joinList(profile.employmentTypes),
    workModes: joinList(profile.workModes),
    hiringLocations: joinList(profile.hiringLocations),
    calendarUrl: profile.calendarUrl ?? "",
    intakeEmail: profile.intakeEmail ?? "",
    resumeSubmissionEmail: profile.resumeSubmissionEmail ?? "",
    outreachTone: profile.outreachTone ?? "professional",
    autoFollowUp: profile.autoFollowUp,
  };
}

function displayValue(value: string | null | undefined, fallback = "Not set yet") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function ChipList({
  values,
  emptyLabel = "Not added yet",
}: {
  values: string[];
  emptyLabel?: string;
}) {
  if (!values.length) {
    return <span className="text-sm text-slate-400">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm text-slate-700">{displayValue(value)}</div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-24 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400"
        />
      )}
    </label>
  );
}

export default function RecruiterProfileCard({
  initialProfile,
  initialCompletion,
  initialChecklist,
}: RecruiterProfileCardProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [completion, setCompletion] = useState(initialCompletion);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [form, setForm] = useState(() => buildFormState(initialProfile));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headerSummary = useMemo(() => {
    const title = displayValue(profile.jobTitle, "Add your recruiter title");
    const agency = displayValue(profile.agencyName, "Add your agency name");
    return `${title} • ${agency}`;
  }, [profile.agencyName, profile.jobTitle]);

  function resetForm() {
    setForm(buildFormState(profile));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/recruiter/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            completion?: number;
            checklist?: string[];
            profile?: RecruiterProfileRecord;
          }
        | null;

      if (!response.ok || data?.ok === false || !data?.profile) {
        throw new Error(data?.error ?? "Unable to save recruiter profile.");
      }

      setProfile(data.profile);
      setCompletion(data.completion ?? 0);
      setChecklist(data.checklist ?? []);
      setForm(buildFormState(data.profile));
      setEditing(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save recruiter profile."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecruiterCard className="rounded-2xl border-slate-200 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 ring-1 ring-sky-100">
            <BuildingOffice2Icon className="h-4 w-4" />
            Recruiter Profile
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            Complete your recruiter profile
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Keep your recruiter identity, intake details, and hiring focus aligned so Hirexa can support matching and outreach with less cleanup.
          </p>
          <p className="mt-3 text-sm font-medium text-slate-700">{headerSummary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-full bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
            {completion}% complete
          </div>
          {editing ? (
            <>
              <Button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                {saving ? "Saving..." : "Save profile"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  resetForm();
                  setEditing(false);
                  setError(null);
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(true)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <PencilSquareIcon className="h-4 w-4" />
              Edit profile
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-sky-600 transition-all"
          style={{ width: `${completion}%` }}
        />
      </div>

      {completion < 100 ? (
        <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-800">
            <ClipboardDocumentListIcon className="h-5 w-5" />
            Complete your recruiter profile
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {checklist.map((item) => (
              <span
                key={item}
                className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-100"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <InputField
              label="First name"
              value={form.firstName}
              onChange={(value) => setForm((prev) => ({ ...prev, firstName: value }))}
              placeholder="Nina"
            />
            <InputField
              label="Last name"
              value={form.lastName}
              onChange={(value) => setForm((prev) => ({ ...prev, lastName: value }))}
              placeholder="Brooks"
            />
            <InputField
              label="Job title"
              value={form.jobTitle}
              onChange={(value) => setForm((prev) => ({ ...prev, jobTitle: value }))}
              placeholder="Senior Technical Recruiter"
            />
            <InputField
              label="Work email"
              value={form.workEmail}
              onChange={(value) => setForm((prev) => ({ ...prev, workEmail: value }))}
              placeholder="nina@agency.com"
            />
            <InputField
              label="Phone"
              value={form.phone}
              onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))}
              placeholder="(312) 555-0118"
            />
            <InputField
              label="LinkedIn URL"
              value={form.linkedinUrl}
              onChange={(value) => setForm((prev) => ({ ...prev, linkedinUrl: value }))}
              placeholder="https://www.linkedin.com/in/your-name"
            />
            <InputField
              label="Agency name"
              value={form.agencyName}
              onChange={(value) => setForm((prev) => ({ ...prev, agencyName: value }))}
              placeholder="North Star Talent"
            />
            <InputField
              label="Agency website"
              value={form.agencyWebsite}
              onChange={(value) => setForm((prev) => ({ ...prev, agencyWebsite: value }))}
              placeholder="https://northstartalent.com"
            />
            <InputField
              label="Calendar URL"
              value={form.calendarUrl}
              onChange={(value) => setForm((prev) => ({ ...prev, calendarUrl: value }))}
              placeholder="https://calendly.com/your-link"
            />
            <InputField
              label="City"
              value={form.city}
              onChange={(value) => setForm((prev) => ({ ...prev, city: value }))}
              placeholder="Chicago"
            />
            <InputField
              label="State"
              value={form.state}
              onChange={(value) => setForm((prev) => ({ ...prev, state: value }))}
              placeholder="IL"
            />
            <InputField
              label="Outreach tone"
              value={form.outreachTone}
              onChange={(value) => setForm((prev) => ({ ...prev, outreachTone: value }))}
              placeholder="Professional"
            />
            <InputField
              label="Intake email"
              value={form.intakeEmail}
              onChange={(value) => setForm((prev) => ({ ...prev, intakeEmail: value }))}
              placeholder="intake@agency.com"
            />
            <InputField
              label="Resume submission email"
              value={form.resumeSubmissionEmail}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, resumeSubmissionEmail: value }))
              }
              placeholder="resumes@agency.com"
            />
          </div>

          <InputField
            label="Company description"
            value={form.companyDescription}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, companyDescription: value }))
            }
            placeholder="Describe the types of teams, clients, and placements your agency supports."
            multiline
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <InputField
              label="Hiring industries"
              value={form.hiringIndustries}
              onChange={(value) => setForm((prev) => ({ ...prev, hiringIndustries: value }))}
              placeholder="Healthcare, SaaS, Fintech"
            />
            <InputField
              label="Recruiting specialties"
              value={form.recruitingSpecialties}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, recruitingSpecialties: value }))
              }
              placeholder="Technical recruiting, executive search"
            />
            <InputField
              label="Hiring roles"
              value={form.hiringRoles}
              onChange={(value) => setForm((prev) => ({ ...prev, hiringRoles: value }))}
              placeholder="Software Engineer, Product Manager"
            />
            <InputField
              label="Seniority levels"
              value={form.seniorityLevels}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, seniorityLevels: value }))
              }
              placeholder="Mid-level, Senior, Director"
            />
            <InputField
              label="Employment types"
              value={form.employmentTypes}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, employmentTypes: value }))
              }
              placeholder="Full-time, Contract"
            />
            <InputField
              label="Work modes"
              value={form.workModes}
              onChange={(value) => setForm((prev) => ({ ...prev, workModes: value }))}
              placeholder="Remote, Hybrid, On-site"
            />
            <InputField
              label="Hiring locations"
              value={form.hiringLocations}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, hiringLocations: value }))
              }
              placeholder="Chicago, Remote, New York"
            />
          </div>

          <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-800">Auto follow-up</div>
              <div className="mt-1 text-xs text-slate-500">
                Keep recruiter follow-up preferences ready for outreach flows.
              </div>
            </div>
            <input
              type="checkbox"
              checked={form.autoFollowUp}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, autoFollowUp: event.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
          </label>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="First name" value={profile.firstName} />
            <Field label="Last name" value={profile.lastName} />
            <Field label="Job title" value={profile.jobTitle} />
            <Field label="Work email" value={profile.workEmail} />
            <Field label="Phone" value={profile.phone} />
            <Field label="LinkedIn" value={profile.linkedinUrl} />
            <Field label="Agency website" value={profile.agencyWebsite} />
            <Field
              label="Location"
              value={[profile.city, profile.state].filter(Boolean).join(", ")}
            />
            <Field label="Calendar URL" value={profile.calendarUrl} />
            <Field label="Intake email" value={profile.intakeEmail} />
            <Field
              label="Resume submission email"
              value={profile.resumeSubmissionEmail}
            />
            <Field label="Outreach tone" value={profile.outreachTone} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Company description</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {displayValue(
                profile.companyDescription,
                "Add a short overview of your agency, clients, and hiring focus."
              )}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Hiring industries</div>
              <div className="mt-3">
                <ChipList values={profile.hiringIndustries} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                Recruiting specialties
              </div>
              <div className="mt-3">
                <ChipList values={profile.recruitingSpecialties} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Hiring roles</div>
              <div className="mt-3">
                <ChipList values={profile.hiringRoles} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Seniority levels</div>
              <div className="mt-3">
                <ChipList values={profile.seniorityLevels} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Employment types</div>
              <div className="mt-3">
                <ChipList values={profile.employmentTypes} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Work modes</div>
              <div className="mt-3">
                <ChipList values={profile.workModes} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2 xl:col-span-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Hiring locations</div>
                <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700">
                  <CheckCircleIcon className="h-4 w-4" />
                  {profile.autoFollowUp ? "Auto follow-up on" : "Auto follow-up off"}
                </div>
              </div>
              <div className="mt-3">
                <ChipList values={profile.hiringLocations} />
              </div>
            </div>
          </div>
        </div>
      )}
    </RecruiterCard>
  );
}
