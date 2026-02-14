"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Footer } from "../components/footer";

/* ================= TYPES ================= */

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

/* ================= OPTIONS (ATS + EEO SAFE) ================= */

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

/* ================= COMPONENT ================= */

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
    setForm((p) => ({ ...p, [field]: value }));
  };

  const requiredOk = useMemo(() => {
    return (
      form.authorizedUS.trim() &&
      form.sponsorship.trim() &&
      form.felony.trim()
    );
  }, [form.authorizedUS, form.sponsorship, form.felony]);

  /* ===== CHECK COMPLETION ===== */
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const res = await fetch("/api/onboarding/key-questions");
        const data = await res.json();

        if (data?.completed) {
          router.replace("/questions/step2");
          return;
        }

        if (!cancelled && data?.data) {
          setForm((p) => ({ ...p, ...data.data }));
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /* ===== ACTIONS ===== */

  async function handleNext() {
    setError(null);

    if (!requiredOk) {
      setError("Please answer the required questions before continuing.");
      return;
    }

    if (saving) return;
    setSaving(true);

    try {
      const res = await fetch("/api/onboarding/key-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save");

      router.push("/dashboard");
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex text-black flex-col">
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 pt-24 pb-36">
          <h1 className="text-2xl font-semibold mb-2">Key questions</h1>
          <p className="text-sm text-gray-600 mb-8">
            These answers help us auto-fill your job applications accurately.
          </p>

          {error && (
            <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <Select label="Are you authorized to work in the United States?" value={form.authorizedUS} onChange={(v) => handleChange("authorizedUS", v)} options={AUTHORIZED_OPTIONS} />
            <Select label="Will you now or in the future require sponsorship to work in the United States?" value={form.sponsorship} onChange={(v) => handleChange("sponsorship", v)} options={SPONSORSHIP_OPTIONS} />
            <Select label="Have you ever been convicted of a felony?" value={form.felony} onChange={(v) => handleChange("felony", v)} options={FELONY_OPTIONS} />
            <Select label="When can you start a new job?" value={form.startDate} onChange={(v) => handleChange("startDate", v)} options={START_DATE_OPTIONS} />
            <Select label="Are you willing to complete pre-employment screening?" value={form.screening} onChange={(v) => handleChange("screening", v)} options={SCREENING_OPTIONS} />
            <Select label="Are you willing to relocate for a job?" value={form.relocate} onChange={(v) => handleChange("relocate", v)} options={RELOCATE_OPTIONS} />
            <Select label="What gender do you identify as?" value={form.gender} onChange={(v) => handleChange("gender", v)} options={GENDER_OPTIONS} />
            <Select label="What are your desired pronouns?" value={form.pronouns} onChange={(v) => handleChange("pronouns", v)} options={PRONOUN_OPTIONS} />
            <Select label="Which race or ethnicity best describes you?" value={form.ethnicity} onChange={(v) => handleChange("ethnicity", v)} options={ETHNICITY_OPTIONS} />
            <Select label="Do you have a disability?" value={form.disability} onChange={(v) => handleChange("disability", v)} options={DISABILITY_OPTIONS} />
            <Select label="Are you a veteran?" value={form.veteran} onChange={(v) => handleChange("veteran", v)} options={VETERAN_OPTIONS} />
          </div>
        </div>
      </main>

    

      {/* STICKY NAV */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="rounded-full border px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Back
          </button>

          <button
            onClick={handleNext}
            disabled={saving}
            className="rounded-full bg-blue-600 px-7 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= SELECT ================= */

type SelectProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
};

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">
        {label} <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-md px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
