"use client";

import { useState } from "react";
import Link from "next/link";
import { Footer } from "../components/footer";

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

export default function QuestionsClient() {
  const [form, setForm] = useState<FormState>({
    authorizedUS: "",
    sponsorship: "",
    felony: "",
    startDate: "As soon as possible",
    screening: "",
    relocate: "No",
    gender: "Prefer not to say",
    pronouns: "Prefer not to say",
    ethnicity: "Prefer not to say",
    disability: "Prefer not to say",
    veteran: "Prefer not to say",
  });

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* CONTENT */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 pb-12 pt-[100]">
          {/* STEPS */}
         

          {/* TITLE */}
          <h1 className="text-2xl font-semibold mb-2">Key questions</h1>
          <p className="text-sm text-gray-600 mb-8">
            These are the questions that will help us best auto-fill your
            applications.
          </p>

          {/* FORM */}
          <div className="space-y-6">
            <Select
              label="Are you authorized to work in the United States?"
              value={form.authorizedUS}
              onChange={(v) => handleChange("authorizedUS", v)}
            />

            <Select
              label="Will you now or in the future require sponsorship to work in the United States?"
              value={form.sponsorship}
              onChange={(v) => handleChange("sponsorship", v)}
            />

            <Select
              label="Have you ever been convicted of a felony?"
              value={form.felony}
              onChange={(v) => handleChange("felony", v)}
            />

            <Select
              label="When can you start a new job?"
              value={form.startDate}
              onChange={(v) => handleChange("startDate", v)}
              options={["As soon as possible", "2 weeks", "1 month"]}
            />

            <Select
              label="Are you willing to conduct any sort of pre-employment screening that is required?"
              value={form.screening}
              onChange={(v) => handleChange("screening", v)}
            />

            <Select
              label="Are you willing to relocate for a job?"
              value={form.relocate}
              onChange={(v) => handleChange("relocate", v)}
              options={["Yes", "No"]}
            />

            <Select
              label="What gender do you identify as?"
              value={form.gender}
              onChange={(v) => handleChange("gender", v)}
            />

            <Select
              label="What are your desired pronouns?"
              value={form.pronouns}
              onChange={(v) => handleChange("pronouns", v)}
            />

            <Select
              label="Which race or ethnicity best describes you?"
              value={form.ethnicity}
              onChange={(v) => handleChange("ethnicity", v)}
            />

            <Select
              label="Do you have a disability?"
              value={form.disability}
              onChange={(v) => handleChange("disability", v)}
            />

            <Select
              label="Are you a veteran?"
              value={form.veteran}
              onChange={(v) => handleChange("veteran", v)}
            />
          </div>
        </div>
      </main>

    

      {/* NEXT BUTTON */}
      <div className="fixed bottom-6 right-6">
        <Link
          href="/questions/step2"
          className="bg-blue-600 text-white px-6 py-3 rounded-full font-medium shadow-lg"
        >
          Next
        </Link>
      </div>
    </div>
  );
}

/* ---------- Reusable Select Component ---------- */

type SelectProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: string[];
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
        className="w-full border rounded-md px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select</option>
        {(options ?? ["Yes", "No", "Prefer not to say"]).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
