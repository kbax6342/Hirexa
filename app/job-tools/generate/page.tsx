// /Hirexa/my-app/app/(no-nav)/job-tools/generate/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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

const textEncoder = new TextEncoder();

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
  const searchParams = useSearchParams();
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

  useEffect(() => {
    const prefillUrl = searchParams.get("jobUrl")?.trim();
    if (!prefillUrl) return;
    if (!url) setUrl(prefillUrl);
  }, [searchParams, url]);

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

  function downloadBlob(filename: string, blob: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function getDocumentFileMeta(tab: TabKey): { filename: string; title: string } {
    if (tab === "coverLetter") return { filename: "cover-letter.pdf", title: "Cover Letter" };
    if (tab === "updatedResume") return { filename: "revised-resume.pdf", title: "Revised Resume" };
    if (tab === "preInterview") return { filename: "pre-interview-email.pdf", title: "Pre-Interview Email" };
    return { filename: "post-interview-email.pdf", title: "Post-Interview Email" };
  }

  function normalizePdfText(value: string) {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  }

  function wrapTextToLines(text: string, maxChars = 95) {
    const normalized = normalizePdfText(text);
    const finalLines: string[] = [];

    for (const rawLine of normalized.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line) {
        finalLines.push("");
        continue;
      }

      let current = "";
      const words = line.split(/\s+/).filter(Boolean);
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxChars) {
          current = next;
          continue;
        }

        if (current) finalLines.push(current);

        if (word.length <= maxChars) {
          current = word;
          continue;
        }

        let sliceStart = 0;
        while (sliceStart < word.length) {
          const chunk = word.slice(sliceStart, sliceStart + maxChars);
          if (chunk.length === maxChars) {
            finalLines.push(chunk);
          } else {
            current = chunk;
          }
          sliceStart += maxChars;
        }
      }

      if (current) finalLines.push(current);
    }

    return finalLines;
  }

  function escapePdfLiteral(text: string) {
    return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function createPdfBytes(text: string, title: string): Uint8Array {
    const allLines = wrapTextToLines(text || " ");
    const linesPerPage = 50;
    const pages: string[][] = [];

    for (let i = 0; i < allLines.length; i += linesPerPage) {
      pages.push(allLines.slice(i, i + linesPerPage));
    }
    if (!pages.length) pages.push([""]);

    const objectBodies: string[] = [];

    objectBodies.push("<< /Type /Catalog /Pages 2 0 R >>");

    const pageCount = pages.length;
    const firstPageObject = 4;
    const kids = Array.from({ length: pageCount }, (_, i) => `${firstPageObject + i * 2} 0 R`).join(" ");
    objectBodies.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);

    objectBodies.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

    for (let i = 0; i < pageCount; i++) {
      const pageObjectId = firstPageObject + i * 2;
      const contentObjectId = pageObjectId + 1;
      objectBodies.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`
      );

      const lines = pages[i];
      const textParts = lines.map((line, lineIndex) => {
        const escaped = escapePdfLiteral(line);
        if (lineIndex === 0) {
          return `50 742 Td (${escaped}) Tj`;
        }
        return `T* (${escaped}) Tj`;
      });

      const safeTitle = escapePdfLiteral(normalizePdfText(title));
      const stream = `BT\n/F1 12 Tf\n14 TL\n50 764 Td\n(${safeTitle}) Tj\nT*\nT*\n${textParts.join("\n")}\nET`;
      objectBodies.push(`<< /Length ${textEncoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    }

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let i = 0; i < objectBodies.length; i++) {
      offsets.push(textEncoder.encode(pdf).length);
      pdf += `${i + 1} 0 obj\n${objectBodies[i]}\nendobj\n`;
    }

    const xrefOffset = textEncoder.encode(pdf).length;
    pdf += `xref\n0 ${objectBodies.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i < offsets.length; i++) {
      pdf += `${offsets[i].toString().padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return textEncoder.encode(pdf);
  }

  function crc32(bytes: Uint8Array) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) {
        const mask = -(crc & 1);
        crc = (crc >>> 1) ^ (0xedb88320 & mask);
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function buildZip(files: Array<{ filename: string; bytes: Uint8Array }>): Blob {
    const localEntries: Uint8Array[] = [];
    const centralEntries: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = textEncoder.encode(file.filename);
      const crc = crc32(file.bytes);

      const localHeader = new Uint8Array(30 + nameBytes.length + file.bytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 0, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, file.bytes.length, true);
      localView.setUint32(22, file.bytes.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      localHeader.set(file.bytes, 30 + nameBytes.length);
      localEntries.push(localHeader);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 0, true);
      centralView.setUint16(14, 0, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, file.bytes.length, true);
      centralView.setUint32(24, file.bytes.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralEntries.push(centralHeader);

      offset += localHeader.length;
    }

    const centralSize = centralEntries.reduce((sum, entry) => sum + entry.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return new Blob([...localEntries, ...centralEntries, endRecord], { type: "application/zip" });
  }

  async function downloadActive() {
    const text = getActiveDocText(result, activeTab);
    if (!text) return;

    const { filename, title } = getDocumentFileMeta(activeTab);
    const bytes = createPdfBytes(text, title);
    downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
  }

  function downloadAll() {
    if (!result) return;

    const allTabs: TabKey[] = ["coverLetter", "updatedResume", "preInterview", "postInterview"];
    const files = allTabs.map((tab) => {
      const text = getActiveDocText(result, tab);
      const meta = getDocumentFileMeta(tab);
      return {
        filename: meta.filename,
        bytes: createPdfBytes(text, meta.title),
      };
    });

    const zipBlob = buildZip(files);
    downloadBlob("application-documents.zip", zipBlob);
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
                    ? "border-sky-200 bg-sky-50 text-sky-600"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-sky-600",
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
                <ShieldCheckIcon className="h-4 w-4 text-sky-600" />
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
          ? "border-violet-200 bg-violet-50 text-sky-600"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded-full border",
            checked ? "border-sky-600 bg-sky-500" : "border-slate-300 bg-white",
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
