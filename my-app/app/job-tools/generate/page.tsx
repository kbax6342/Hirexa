"use client";

import { useMemo, useState } from "react";

type Result = {
  job: {
    title?: string;
    company?: string;
    location?: string;
    summary?: string;
    keyRequirements?: string[];
  };
  coverLetter: string;
  resumeUpdates: {
    summaryRewrite?: string;
    skillsToAdd?: string[];
    bulletEdits?: Array<{ section: string; before: string; after: string }>;
    atsKeywords?: string[];
  };
  emails: {
    beforeInterview: string;
    afterInterview: string;
  };
};

export default function JobToolsGeneratePage() {
  const [url, setUrl] = useState("");
  const [resumeText, setResumeText] = useState(""); // optional, but strongly recommended
  const [tone, setTone] = useState<"professional" | "friendly" | "bold">("professional");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const canSubmit = useMemo(() => {
    try {
      const u = new URL(url.trim());
      return ["http:", "https:"].includes(u.protocol);
    } catch {
      return false;
    }
  }, [url]);

  async function onGenerate() {
    setError(null);
    setResult(null);

    if (!canSubmit) {
      setError("Please paste a valid http(s) job posting link.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/job-tools/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          resumeText: resumeText.trim() || null,
          tone,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate");

      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">Generate Application Pack</h1>
        <p className="mt-2 text-gray-600">
          Paste a job posting link. We’ll read it and generate a cover letter, resume updates, and interview emails.
        </p>

        <div className="mt-8 space-y-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700">Job posting URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://company.com/careers/job/123"
              className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-gray-900"
            />
            <p className="mt-2 text-xs text-gray-500">
              Tip: Some sites block bots. If a link fails, you can add a “paste job description” fallback later.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Your resume (optional but recommended)</label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your current resume text here…"
              className="mt-2 h-40 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-gray-900"
            />
            <p className="mt-2 text-xs text-gray-500">
              If you provide a resume, the “updated resume” output will be much more accurate.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Tone:</span>
            {(["professional", "friendly", "bold"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={`rounded-full border px-4 py-2 text-sm ${
                  tone === t ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={onGenerate}
            disabled={!canSubmit || loading}
            className="w-full rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>

        {result && (
          <div className="mt-10 space-y-8">
            <section className="rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Job Summary</h2>
              <div className="mt-3 text-sm text-gray-700 space-y-2">
                <div><strong>Title:</strong> {result.job.title ?? "—"}</div>
                <div><strong>Company:</strong> {result.job.company ?? "—"}</div>
                <div><strong>Location:</strong> {result.job.location ?? "—"}</div>
                {result.job.summary && <div><strong>Summary:</strong> {result.job.summary}</div>}
                {result.job.keyRequirements?.length ? (
                  <div>
                    <strong>Key requirements:</strong>
                    <ul className="mt-1 list-disc pl-5">
                      {result.job.keyRequirements.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Cover Letter</h2>
              <textarea
                readOnly
                value={result.coverLetter}
                className="mt-3 h-64 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
              />
            </section>

            <section className="rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Resume Updates</h2>

              {result.resumeUpdates.summaryRewrite && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-700">Suggested summary rewrite</div>
                  <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-wrap">
                    {result.resumeUpdates.summaryRewrite}
                  </div>
                </div>
              )}

              {result.resumeUpdates.skillsToAdd?.length ? (
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-700">Skills to add</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.resumeUpdates.skillsToAdd.map((s, i) => (
                      <span key={i} className="rounded-full border border-gray-300 px-3 py-1 text-sm">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.resumeUpdates.bulletEdits?.length ? (
                <div className="mt-6 space-y-4">
                  <div className="text-sm font-medium text-gray-700">Bullet edits</div>
                  {result.resumeUpdates.bulletEdits.map((b, i) => (
                    <div key={i} className="rounded-xl border border-gray-200 p-4">
                      <div className="text-xs font-semibold text-gray-500">{b.section}</div>
                      <div className="mt-2 text-sm">
                        <div className="text-gray-500">Before</div>
                        <div className="whitespace-pre-wrap">{b.before}</div>
                        <div className="mt-3 text-gray-500">After</div>
                        <div className="whitespace-pre-wrap font-medium">{b.after}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {result.resumeUpdates.atsKeywords?.length ? (
                <div className="mt-6">
                  <div className="text-sm font-medium text-gray-700">ATS keywords</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.resumeUpdates.atsKeywords.map((k, i) => (
                      <span key={i} className="rounded-full border border-gray-300 px-3 py-1 text-sm">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Emails</h2>

              <div className="mt-4">
                <div className="text-sm font-medium text-gray-700">Before interview</div>
                <textarea
                  readOnly
                  value={result.emails.beforeInterview}
                  className="mt-2 h-40 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
                />
              </div>

              <div className="mt-6">
                <div className="text-sm font-medium text-gray-700">After interview (thank-you)</div>
                <textarea
                  readOnly
                  value={result.emails.afterInterview}
                  className="mt-2 h-40 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
