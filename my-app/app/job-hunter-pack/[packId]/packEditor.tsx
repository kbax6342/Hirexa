"use client";

import { useState } from "react";
import type { JobHunterPack } from "@prisma/client";

type Props = {
  pack: JobHunterPack;
};

export function PackEditor({ pack }: Props) {
  const [resumeText, setResumeText] = useState(pack.resumeText ?? "");
  const [notes, setNotes] = useState(pack.notes ?? "");
  const [status, setStatus] = useState(pack.status);
  const [optimizedResume, setOptimizedResume] = useState(pack.optimizedResume ?? "");
  const [coverLetter, setCoverLetter] = useState(pack.coverLetter ?? "");
  const [interviewPrep, setInterviewPrep] = useState(pack.interviewPrep ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generatePack() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/packs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, resumeText, notes }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Unable to generate pack");
      }

      setStatus(data.pack.status);
      setOptimizedResume(data.pack.optimizedResume ?? "");
      setCoverLetter(data.pack.coverLetter ?? "");
      setInterviewPrep(data.pack.interviewPrep ?? "");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border/60 bg-card/40 p-6">
        <h1 className="text-2xl font-bold text-foreground">Your Job Hunter Pack</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {pack.jobTitle ? `${pack.jobTitle}${pack.company ? ` • ${pack.company}` : ""}` : "General application pack"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Status: {status}</p>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/60 bg-background/30 p-6">
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Paste your resume</label>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="min-h-52 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Paste your resume text here..."
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Anything specific to emphasize for this role..."
          />
        </div>

        <button
          type="button"
          onClick={generatePack}
          disabled={loading}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Generating..." : "Generate my Pack"}
        </button>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        {pack.jobUrl && (
          <a href={pack.jobUrl} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary hover:underline">
            Apply externally ↗
          </a>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <OutputCard title="Optimized Resume" content={optimizedResume} />
        <OutputCard title="Cover Letter" content={coverLetter} />
        <OutputCard title="Interview Prep" content={interviewPrep} />
      </section>
    </div>
  );
}

function OutputCard({ title, content }: { title: string; content?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{content || "Generate your pack to see this section."}</p>
    </div>
  );
}
