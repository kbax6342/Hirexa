"use client";

import Link from "next/link";
import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  onFileSelected?: (file: File) => void;
  onPickGoogleDrive?: () => void;
  onPickDropbox?: () => void;
};

type UploadProof = {
  savedTo: {
    sessionUserId: string | null;
    guestId: string | null;
    profileId: string;
  };
  resume: {
    id: string;
    profileId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  };
};

export default function ResumeUploadPanel({
  onFileSelected,
  onPickGoogleDrive,
  onPickDropbox,
}: Props) {
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // upload states
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [proof, setProof] = useState<UploadProof | null>(null);

  const allowed = useMemo(() => [".pdf", ".doc", ".docx", ".txt", ".rtf", ".html"], []);
  const accept = useMemo(() => allowed.join(","), [allowed]);

  function pickFile() {
    inputRef.current?.click();
  }

  function handleFile(f: File) {
    setFile(f);
    setProof(null);
    setSaveError(null);
    onFileSelected?.(f);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function uploadResumeAndContinue() {
    if (!file) {
      setSaveError("Please choose a resume file first.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setProof(null);

    try {
      // ✅ you should see this in DevTools console
      console.log("Uploading resume -> POST /api/onboarding/resume", {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      const fd = new FormData();
      fd.append("resume", file);

      const res = await fetch("/api/onboarding/resume", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Upload failed");
      }

      setProof({
        savedTo: data.savedTo,
        resume: data.resume,
      });

      
      // ✅ Navigate ONLY after saved
      router.push(`/questions/step2Resume?resumeId=${data.resume.id}`);

    } catch (e: any) {
      setSaveError(e?.message ?? "Something went wrong while saving your resume.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-[70vh] bg-white">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Upload your resume</h1>
          <p className="text-sm text-gray-600">
            Drag & drop a file or import it from your cloud storage. We’ll extract your work experience automatically.
          </p>
        </div>

        {/* ✅ status / proof */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
          {isSaving ? (
            <div className="text-sm text-gray-700">Saving resume…</div>
          ) : saveError ? (
            <div className="text-sm text-red-700">
              <div className="font-semibold">Not saved</div>
              <div className="mt-1">{saveError}</div>
            </div>
          ) : proof ? (
            <div className="text-sm text-emerald-700">
              <div className="font-semibold">Saved ✅</div>
              <div className="mt-1 text-xs text-gray-600">
                Resume ID: <span className="font-mono">{proof.resume.id}</span> • Profile ID:{" "}
                <span className="font-mono">{proof.savedTo.profileId}</span>
              </div>
              <div className="mt-1 text-xs text-gray-600">
                File: <span className="font-semibold">{proof.resume.fileName}</span> •{" "}
                {(proof.resume.sizeBytes / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">Choose a file, then click Next to save it.</div>
          )}
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          {/* Dropzone card */}
          <div
            className={[
              "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-gray-50 to-white shadow-sm",
              dragOver ? "border-blue-500 ring-4 ring-blue-100" : "border-gray-200",
            ].join(" ")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Resume
                    <span className="h-1 w-1 rounded-full bg-blue-300" />
                    PDF / DOCX
                  </div>

                  <h2 className="mt-3 text-lg font-semibold text-gray-900">
                    {file ? "File ready to upload" : "Drop your file here"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {file ? "Click Next to save it." : "Or choose a file from your device."}
                  </p>
                </div>

                <div className="hidden md:block">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6 text-blue-700"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="M7 10l5-5 5 5" />
                      <path d="M12 5v14" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* File row */}
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                {file ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{file.name}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {(file.size / 1024 / 1024).toFixed(2)} MB •{" "}
                        {isSaving ? "Saving…" : proof ? "Saved" : saveError ? "Not saved" : "Ready"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setProof(null);
                        setSaveError(null);
                        if (inputRef.current) inputRef.current.value = "";
                      }}
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-gray-700">
                      <span className="font-semibold">Tip:</span> Drag a file into this card.
                    </div>
                    <button
                      type="button"
                      onClick={pickFile}
                      className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Choose file
                    </button>
                  </div>
                )}
              </div>

              <input ref={inputRef} type="file" accept={accept} onChange={onInputChange} className="hidden" />

              {/* Allowed types */}
              <div className="mt-4 flex flex-wrap gap-2">
                {["PDF", "DOCX", "DOC", "TXT", "RTF", "HTML"].map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-xs text-gray-500">
                We only use your resume to extract fields for your application. You can delete it anytime.
              </p>
            </div>

            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-100 blur-3xl" />
          </div>

          {/* Cloud imports */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Import from cloud</div>
                <div className="mt-1 text-xs text-gray-600">Connect a provider to pick a resume</div>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700">Optional</span>
            </div>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={onPickGoogleDrive}
                className="group flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M7.71 3.5h8.58l4.29 7.43-4.29 7.43H7.71L3.42 10.93 7.71 3.5zm.86 1.5L5.15 10.93l3.42 5.93h6.86l3.42-5.93L15.43 5H8.57z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Google Drive</div>
                    <div className="text-xs text-gray-600">Pick a file from Drive</div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-blue-700 group-hover:underline">Connect</span>
              </button>

              <button
                type="button"
                onClick={onPickDropbox}
                className="group flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M6 3l6 4-6 4-6-4 6-4zm12 0l6 4-6 4-6-4 6-4zM6 13l6 4-6 4-6-4 6-4zm12 0l6 4-6 4-6-4 6-4z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Dropbox</div>
                    <div className="text-xs text-gray-600">Import from Dropbox</div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-indigo-700 group-hover:underline">Connect</span>
              </button>
            </div>

            <div className="mt-6 rounded-xl bg-gray-50 p-4">
              <div className="text-xs font-semibold text-gray-900">Pro tip</div>
              <div className="mt-1 text-xs text-gray-600">
                Uploading PDF usually preserves formatting best. If results look odd, try exporting your resume as PDF.
              </div>
            </div>
          </div>
        </div>

        {/* Skip button */}
        <div className="flex justify-center mb-4 mt-4 text-blue-600">
          <Link
            href={"/onboarding/job-interest"}
            className="text-sm font-semibold underline underline-offset-4"
            onClick={() => console.log("Skip for now clicked")}
          >
            Skip for now
          </Link>
        </div>

        {/* bottom actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">Max file size: 10MB • Private by default</div>

          <button
            type="button"
            onClick={uploadResumeAndContinue}
            disabled={!file || isSaving}
            className={[
              "px-8 py-3 rounded-full font-medium text-white",
              !file || isSaving ? "bg-gray-400 cursor-not-allowed" : "bg-black",
            ].join(" ")}
          >
            {isSaving ? "Saving..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
