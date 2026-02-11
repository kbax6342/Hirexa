// /Hirexa/my-app/app/(no-nav)/job-tools/generate/page.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ClipboardIcon,
  CloudArrowUpIcon,
  LinkIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/solid";

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

type Tone = "professional" | "conversational" | "enthusiastic";
type TabKey = "coverLetter" | "updatedResume" | "preInterview" | "postInterview";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "coverLetter", label: "Cover Letter" },
  { key: "updatedResume", label: "Revised Resume" },
  { key: "preInterview", label: "Pre-Interview Email" },
  { key: "postInterview", label: "Post Interview Email" },
];

const focusOptions = [
  { key: "technical", label: "Technical Skills" },
  { key: "leadership", label: "Leadership Experience" },
  { key: "projects", label: "Project Achievements" },
] as const;

export default function JobToolsGeneratePage() {
  const [url, setUrl] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [pastedJobText, setPastedJobText] = useState("");

  const [tone, setTone] = useState<Tone>("professional");
  const [focus, setFocus] = useState<Record<(typeof focusOptions)[number]["key"], boolean>>({
    technical: true,
    leadership: false,
    projects: false,
  });

  const [instructions, setInstructions] = useState("");

  const [activeTab, setActiveTab] = useState<TabKey>("coverLetter");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSubmit = useMemo(() => {
    try {
      const u = new URL(url.trim());
      return ["http:", "https:"].includes(u.protocol);
    } catch {
      return false;
    }
  }, [url]);

  const hasFallbackText = pastedJobText.trim().length >= 150;

  function toggleFocus(k: (typeof focusOptions)[number]["key"]) {
    setFocus((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function resetAll() {
    setUrl("");
    setResumeFile(null);
    setTone("professional");
    setPastedJobText("");
    setFocus({ technical: true, leadership: false, projects: false });
    setInstructions("");
    setActiveTab("coverLetter");
    setError(null);
    setResult(null);
  }

  function getActiveDocText(r: Result | null, tab: TabKey) {
    if (!r) return "";
    if (tab === "coverLetter") return r.coverLetter || "";
    if (tab === "preInterview") return r.emails?.beforeInterview || "";
    if (tab === "postInterview") return r.emails?.afterInterview || "";

    // updatedResume: turn the structured resume updates into a readable “draft”
    const parts: string[] = [];
    if (r.resumeUpdates?.summaryRewrite) {
      parts.push("SUMMARY (Suggested Rewrite)\n" + r.resumeUpdates.summaryRewrite);
    }
    if (r.resumeUpdates?.skillsToAdd?.length) {
      parts.push("SKILLS TO ADD\n- " + r.resumeUpdates.skillsToAdd.join("\n- "));
    }
    if (r.resumeUpdates?.atsKeywords?.length) {
      parts.push("ATS KEYWORDS\n- " + r.resumeUpdates.atsKeywords.join("\n- "));
    }
    if (r.resumeUpdates?.bulletEdits?.length) {
      parts.push(
        "BULLET EDITS\n" +
          r.resumeUpdates.bulletEdits
            .map((b) => {
              return [
                `• ${b.section}`,
                `  Before: ${b.before}`,
                `  After:  ${b.after}`,
              ].join("\n");
            })
            .join("\n\n")
      );
    }
    return parts.join("\n\n").trim();
  }

  async function copyActive() {
    const text = getActiveDocText(result, activeTab);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  function downloadText(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function downloadActive() {
    const text = getActiveDocText(result, activeTab);
    if (!text) return;

    const name =
      activeTab === "coverLetter"
        ? "cover-letter.txt"
        : activeTab === "updatedResume"
        ? "resume-updates.txt"
        : activeTab === "preInterview"
        ? "pre-interview-email.txt"
        : "post-interview-email.txt";

    downloadText(name, text);
  }

  function downloadAll() {
    if (!result) return;
    downloadText("cover-letter.txt", getActiveDocText(result, "coverLetter"));
    downloadText("resume-updates.txt", getActiveDocText(result, "updatedResume"));
    downloadText("pre-interview-email.txt", getActiveDocText(result, "preInterview"));
    downloadText("post-interview-email.txt", getActiveDocText(result, "postInterview"));
  }

  async function onGenerate() {
    setError(null);
    setResult(null);

    if (!canSubmit && !hasFallbackText) {
      setError("Please paste a valid http(s) job posting link or provide at least 150 characters in the fallback text field.");
      return;
    }

    setLoading(true);
    try {
      const selectedFocus = Object.entries(focus)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const formData = new FormData();
      formData.set("url", url.trim());
      formData.set("resumeText", "");
      formData.set(
        "tone",
        tone === "professional" ? "professional" : tone === "conversational" ? "friendly" : "bold"
      );
      formData.set("focusAreas", JSON.stringify(selectedFocus));
      formData.set("instructions", instructions.trim());
      formData.set("pastedJobText", pastedJobText.trim());
      if (resumeFile) {
        formData.set("resumeFile", resumeFile);
      }

      const res = await fetch("/api/job-tools/generate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate");

      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const activeText = getActiveDocText(result, activeTab);
  const activeTitle =
    activeTab === "coverLetter"
      ? "AI-Generated Cover Letter"
      : activeTab === "updatedResume"
      ? "AI-Generated Resume Updates"
      : activeTab === "preInterview"
      ? "AI-Generated Pre-Interview Email"
      : "AI-Generated Post-Interview Email";

  return (
    <div className="min-h-screen ">
      {/* Top bar (simple, no nav) */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-sky-500 text-white">
              <SparklesIcon className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold text-slate-900">Hirexa AI</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-200" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">
            Generate Your Perfect Application
          </h1>
          <p className="mt-2 text-sm text-white">
            Paste a job URL, and Hirexa will create your cover letter, resume updates, and follow-up emails.
          </p>
        </div>

        {/* URL + Generate */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-sky-500">
                <LinkIcon className="h-5 w-5" />
              </div>
              <div className="w-full">
                <div className="text-xs font-semibold text-slate-700">Job Posting URL</div>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://company.com/careers/job/123"
                  className="mt-1 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={(!canSubmit && !hasFallbackText) || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-sm "
            >
              {loading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5" />}
              {loading ? "Generating" : "Generate"}
            </button>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Tip: Some sites block bots. If extraction fails, paste the job description in the fallback field below.
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Job Description Fallback (optional)</div>
          <div className="mt-1 text-xs text-slate-500">
            Paste the full job description if the URL blocks scraping. This text will be used directly.
          </div>
          <textarea
            value={pastedJobText}
            onChange={(e) => setPastedJobText(e.target.value)}
            placeholder="Paste the job description here..."
            className="mt-3 h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
          />
        </div>

        {/* Upload resume */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <CloudArrowUpIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Upload Your Current Resume</div>
              <div className="text-xs text-slate-500">PDF, DOCX, or TXT supported</div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" ? fileInputRef.current?.click() : null)}
            className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm">
              <CloudArrowUpIcon className="h-6 w-6" />
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-900">
              {resumeFile ? resumeFile.name : "Drag & drop your resume here"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {resumeFile ? "Upload included in next generate request" : "or click to browse files"}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setResumeFile(f);
              }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {tabs.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold",
                  active
                    ? "border-violet-200 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Document card + actions */}
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-slate-900">{activeTitle}</div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyActive}
                disabled={!activeText}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <ClipboardIcon className="h-4 w-4" />
                Copy
              </button>

              <button
                type="button"
                onClick={downloadActive}
                disabled={!activeText}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Download
              </button>

              <button
                type="button"
                onClick={onGenerate}
                disabled={(!canSubmit && !hasFallbackText) || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <ArrowPathIcon className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
                Regenerate
              </button>
            </div>
          </div>

          <div className="px-5 py-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <textarea
                readOnly
                value={
                  activeText ||
                  "Your generated document will appear here after processing the job URL."
                }
                className="h-56 w-full resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Controls grid */}
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {/* Tone & Style */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Tone & Style</div>
                <div className="mt-3 space-y-2">
                  <ToneRow
                    label="Professional"
                    checked={tone === "professional"}
                    onClick={() => setTone("professional")}
                  />
                  <ToneRow
                    label="Conversational"
                    checked={tone === "conversational"}
                    onClick={() => setTone("conversational")}
                  />
                  <ToneRow
                    label="Enthusiastic"
                    checked={tone === "enthusiastic"}
                    onClick={() => setTone("enthusiastic")}
                  />
                </div>
              </div>

              {/* Focus Areas */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Focus Areas</div>
                <div className="mt-3 space-y-2">
                  {focusOptions.map((o) => (
                    <CheckRow
                      key={o.key}
                      label={o.label}
                      checked={!!focus[o.key]}
                      onClick={() => toggleFocus(o.key)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Additional instructions */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700">
                  <SparklesIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Additional Instructions (optional)
                  </div>
                  <div className="text-xs text-slate-500">
                    Add specific details you&apos;d like to highlight or omit about your application.
                  </div>
                </div>
              </div>

              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Example: Emphasize customer service leadership and quantify results. Keep it to one page."
                className="mt-3 h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
              <div className="mt-2 text-xs text-slate-500">
                This information is used to personalize your application assets.
              </div>
            </div>

            {/* Bottom bar */}
            <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheckIcon className="h-4 w-4 text-violet-600" />
                Your data is processed securely and never shared.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetAll}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={!result}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  Download All Documents
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-200 py-6 text-xs text-slate-500 sm:flex-row">
          <div>© {new Date().getFullYear()} Hirexa AI. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <button className="hover:text-slate-700" type="button">Privacy Policy</button>
            <button className="hover:text-slate-700" type="button">Terms of Service</button>
            <button className="hover:text-slate-700" type="button">Contact</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToneRow({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm",
        checked
          ? "border-violet-200 bg-violet-50 text-violet-800"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded-full border",
            checked ? "border-violet-600 bg-sky-500" : "border-slate-300 bg-white",
          ].join(" ")}
        >
          <span className={["h-1.5 w-1.5 rounded-full", checked ? "bg-white" : "bg-transparent"].join(" ")} />
        </span>
        <span className="font-semibold">{label}</span>
      </div>
    </button>
  );
}

function CheckRow({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm",
        checked
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded border",
            checked ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-white",
          ].join(" ")}
        >
          <span className={["h-2 w-2", checked ? "bg-white" : "bg-transparent"].join(" ")} />
        </span>
        <span className="font-semibold">{label}</span>
      </div>
    </button>
  );
}
