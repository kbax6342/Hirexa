"use client";

import { useRef, useState } from "react";
import { ArrowUpTrayIcon, DocumentTextIcon } from "@heroicons/react/24/outline";

import RecruiterCard from "@/app/components/recruiter/RecruiterCard";
import { Button } from "@/app/components/ui/button";
import type { RecruiterCandidateRecord } from "@/app/components/recruiter/types";

export default function CandidateUploadCard({
  onUploaded,
}: {
  onUploaded?: (candidate: RecruiterCandidateRecord) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append("resume", selectedFile);
      }
      if (resumeText.trim()) {
        formData.append("resumeText", resumeText.trim());
      }

      const response = await fetch("/api/recruiter/candidates/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error ?? "Unable to upload candidate resume.");
      }

      setResumeText("");
      setSelectedFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setNotice(
        data?.warning
          ? `${data.warning}`
          : "Candidate saved and ready for recruiter review."
      );
      onUploaded?.(data.candidate as RecruiterCandidateRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload candidate resume.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <RecruiterCard className="rounded-2xl border-slate-200 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Import candidates</h2>
        <h1>This is somet text</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload PDF or DOCX resumes, or paste raw resume text when a file is not available.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-2 text-sky-600 ring-1 ring-slate-200">
              <ArrowUpTrayIcon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-900">
                Resume upload
              </div>
              <div className="mt-1 text-sm text-slate-500">
                PDFs are supported. DOCX works too when raw text extraction succeeds.
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="mt-3 block w-full text-sm text-slate-600"
              />
              {selectedFile ? (
                <div className="mt-2 text-xs font-medium text-slate-700">
                  Selected: {selectedFile.name}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <DocumentTextIcon className="h-4 w-4" />
            Paste resume text
          </span>
          <textarea
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            className="min-h-36 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"
            placeholder="Paste a candidate resume here as a fallback when a file is not available."
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {notice ? <p className="text-sm text-sky-600">{notice}</p> : null}

        <Button
          type="submit"
          disabled={loading || (!selectedFile && !resumeText.trim())}
          className="rounded-full !border-slate-200 !bg-white px-5 !text-slate-700 shadow-sm hover:!bg-slate-50"
        >
          {loading ? "Saving candidate..." : "Upload candidate"}
        </Button>
      </form>
    </RecruiterCard>
  );
}
