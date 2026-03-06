"use client";

import { useState } from "react";

type Pack = {
  id: string;
  jobTitle: string | null;
  company: string | null;
  jobUrl: string | null;
  status: string;
  resumeText: string | null;
  notes: string | null;
  optimizedResume: string | null;
  coverLetter: string | null;
  interviewPrep: string | null;
};

export default function PackEditor({ initialPack }: { initialPack: Pack }) {
  const [pack, setPack] = useState(initialPack);
  const [resumeText, setResumeText] = useState(initialPack.resumeText ?? "");
  const [notes, setNotes] = useState(initialPack.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generatePack() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/packs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, resumeText, notes }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to generate pack");

      setPack(json.pack as Pack);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate pack");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Your Job Hunter Pack</h1>
        <p className="mt-2 text-sm text-slate-600">
          {pack.jobTitle ? `${pack.jobTitle}` : "Target Job"}
          {pack.company ? ` at ${pack.company}` : ""}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Status: {pack.status}</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <label className="text-sm font-semibold text-slate-900">Paste your resume</label>
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          rows={10}
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm"
          placeholder="Paste your current resume text here..."
        />

        <label className="mt-4 block text-sm font-semibold text-slate-900">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm"
          placeholder="Anything specific to emphasize?"
        />

        <button
          type="button"
          onClick={generatePack}
          disabled={loading}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate my Pack"}
        </button>

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        {pack.jobUrl && (
          <a
            href={pack.jobUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-3 inline-flex items-center justify-center rounded-lg border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Apply externally ↗
          </a>
        )}
      </section>

      <section className="grid gap-4">
        <OutputCard title="Optimized Resume" text={pack.optimizedResume} />
        <OutputCard title="Cover Letter" text={pack.coverLetter} />
        <OutputCard title="Interview Prep" text={pack.interviewPrep} />
      </section>
    </div>
  );
}

function OutputCard({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {text?.trim() ? text : "Generate your pack to see this section."}
      </div>
    </div>
  );
}
