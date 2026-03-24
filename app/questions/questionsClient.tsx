"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  authorizedUS: string;
  sponsorship: string;
  felony: string;
  startDate: string;
  screening: string;
  relocate: string;
  gender: string;
  pronouns: string;
  ethnicity: string;
  disability: string;
  veteran: string;
};

const AUTHORIZED_OPTIONS = [
  "Yes, I am authorized to work in the United States",
  "No, I am not authorized to work in the United States",
];

const SPONSORSHIP_OPTIONS = [
  "No, I do not require sponsorship",
  "Yes, I will require sponsorship",
];

const FELONY_OPTIONS = ["No", "Yes", "Prefer not to say"];

const START_DATE_OPTIONS = [
  "Immediately",
  "Within 2 weeks",
  "Within 1 month",
  "More than 1 month",
];

const SCREENING_OPTIONS = ["Yes", "No"];

const RELOCATE_OPTIONS = ["Yes", "No", "Open to discussion"];

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const PRONOUN_OPTIONS = ["She / Her", "He / Him", "They / Them", "Prefer not to say"];

const ETHNICITY_OPTIONS = [
  "Hispanic or Latino",
  "White",
  "Black or African American",
  "Asian",
  "Native American or Alaska Native",
  "Native Hawaiian or Other Pacific Islander",
  "Two or more races",
  "Prefer not to say",
];

const DISABILITY_OPTIONS = [
  "No, I do not have a disability",
  "Yes, I have a disability",
  "Prefer not to say",
];

const VETERAN_OPTIONS = [
  "I am not a veteran",
  "I am a veteran",
  "Prefer not to say",
];

const inputBase =
  "h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 " +
  "shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15";

const labelBase = "text-xs font-semibold text-slate-700";

export default function QuestionsClient() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    authorizedUS: "",
    sponsorship: "",
    felony: "",
    startDate: "Immediately",
    screening: "",
    relocate: "No",
    gender: "Prefer not to say",
    pronouns: "Prefer not to say",
    ethnicity: "Prefer not to say",
    disability: "Prefer not to say",
    veteran: "Prefer not to say",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof FormState, value: string) => {
    setError(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const requiredOk = useMemo(() => {
    return Boolean(
      form.authorizedUS.trim() &&
        form.sponsorship.trim() &&
        form.felony.trim()
    );
  }, [form.authorizedUS, form.sponsorship, form.felony]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const res = await fetch("/api/onboarding/key-questions", {
          cache: "no-store",
        });
        const data = await res.json();

        if (data?.completed) {
          router.replace("/dashboard");
          return;
        }

        if (data?.nextPath && data.nextPath !== "/questions") {
          router.replace(data.nextPath);
          return;
        }

        if (!cancelled && data?.data) {
          setForm((prev) => ({ ...prev, ...data.data }));
        }
      } catch {
        // Intentionally silent to preserve existing behavior.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSave() {
    setError(null);

    if (!requiredOk) {
      setError("Please answer the required questions before continuing.");
      return;
    }

    if (saving) {
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/onboarding/key-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save");
      }

      router.replace(data?.nextPath || "/dashboard");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push("/questions");
      return;
    }

    router.back();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await handleSave();
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-600">
        Loading...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="space-y-5">
        <Select
          label="Are you authorized to work in the United States?"
          value={form.authorizedUS}
          onChange={(value) => handleChange("authorizedUS", value)}
          options={AUTHORIZED_OPTIONS}
        />
        <Select
          label="Will you now or in the future require sponsorship to work in the United States?"
          value={form.sponsorship}
          onChange={(value) => handleChange("sponsorship", value)}
          options={SPONSORSHIP_OPTIONS}
        />
        <Select
          label="Have you ever been convicted of a felony?"
          value={form.felony}
          onChange={(value) => handleChange("felony", value)}
          options={FELONY_OPTIONS}
        />
        <Select
          label="When can you start a new job?"
          value={form.startDate}
          onChange={(value) => handleChange("startDate", value)}
          options={START_DATE_OPTIONS}
        />
        <Select
          label="Are you willing to complete pre-employment screening?"
          value={form.screening}
          onChange={(value) => handleChange("screening", value)}
          options={SCREENING_OPTIONS}
        />
        <Select
          label="Are you willing to relocate for a job?"
          value={form.relocate}
          onChange={(value) => handleChange("relocate", value)}
          options={RELOCATE_OPTIONS}
        />
        <Select
          label="What gender do you identify as?"
          value={form.gender}
          onChange={(value) => handleChange("gender", value)}
          options={GENDER_OPTIONS}
        />
        <Select
          label="What are your desired pronouns?"
          value={form.pronouns}
          onChange={(value) => handleChange("pronouns", value)}
          options={PRONOUN_OPTIONS}
        />
        <Select
          label="Which race or ethnicity best describes you?"
          value={form.ethnicity}
          onChange={(value) => handleChange("ethnicity", value)}
          options={ETHNICITY_OPTIONS}
        />
        <Select
          label="Do you have a disability?"
          value={form.disability}
          onChange={(value) => handleChange("disability", value)}
          options={DISABILITY_OPTIONS}
        />
        <Select
          label="Are you a veteran?"
          value={form.veteran}
          onChange={(value) => handleChange("veteran", value)}
          options={VETERAN_OPTIONS}
        />
      </div>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Back
        </button>

        <div className="sm:ml-auto">
          <button
            type="submit"
            disabled={saving}
            className={[
              "inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-semibold text-white shadow-sm transition",
              saving
                ? "cursor-not-allowed bg-sky-400 opacity-60"
                : "cursor-pointer bg-sky-600 hover:bg-sky-700",
            ].join(" ")}
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </form>
  );
}

type SelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
};

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <div>
      <label className={labelBase}>
        {label} <span className="text-rose-500">*</span>
      </label>
      <div className="mt-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputBase}
        >
          <option value="">Select...</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
