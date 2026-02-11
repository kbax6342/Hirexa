//app/questions/step2/step2Client.tsx
"use client";

import Link from "next/link";
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step2ClientProps = {
  profileId: string | null;
  resumeId: string | null;
};

type UploadProof = {
  savedTo?: {
    sessionUserId?: string | null;
    guestId?: string | null;
    profileId?: string | null;
  };
  resume: {
    id: string;
    profileId?: string | null;
    userProfileId?: string | null;
    fileName?: string;
    filename?: string;
    mimeType: string;
    sizeBytes?: number;
    createdAt?: string;
  };
};

export default function Step2Client({
  profileId,
  resumeId,
}: Step2ClientProps) {
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [proof, setProof] = useState<UploadProof | null>(null);

  useEffect(() => {
    console.log("✅ Step2Client mounted", { profileId, resumeId });
  }, [profileId, resumeId]);

  const allowed = useMemo(
    () => [".pdf", ".doc", ".docx", ".txt", ".rtf", ".html"],
    []
  );
  const accept = useMemo(() => allowed.join(","), [allowed]);

  function pickFile() {
    inputRef.current?.click();
  }

  function handleFile(f: File) {
    setFile(f);
    setProof(null);
    setSaveError(null);
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
      const fd = new FormData();
      fd.append("resume", file);

      const res = await fetch("/api/onboarding/resume", {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.resume?.id) {
        throw new Error(data?.error || "Upload failed");
      }

      setProof({ savedTo: data.savedTo, resume: data.resume });

      router.push(
        `/questions/step2Resume?resumeId=${encodeURIComponent(data.resume.id)}`
      );
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Something went wrong while saving your resume.";
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-[70vh] bg-white mt-[50]">
      <div className="mx-auto max-w-5xl px-6 py-14">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Upload your resume
          </h1>
          <p className="text-sm text-gray-600">
            Drag & drop a file or import it from your cloud storage. We’ll extract
            your work experience automatically.
          </p>
        </div>

        {/* Status */}
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
                Resume ID:{" "}
                <span className="font-mono">{proof.resume.id}</span> • Profile
                ID:{" "}
                <span className="font-mono">
                  {proof.savedTo?.profileId ?? proof.resume.profileId ?? proof.resume.userProfileId ?? "N/A"}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-600">
                File:{" "}
                <span className="font-semibold">
                  {proof.resume.fileName ?? proof.resume.filename ?? "Uploaded resume"}
                </span>{" "}
                {typeof proof.resume.sizeBytes === "number" ? (
                  <>• {(proof.resume.sizeBytes / 1024 / 1024).toFixed(2)} MB</>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              Choose a file, then click Next to save it.
            </div>
          )}
        </div>

        {/* Main grid */}
        <div className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          {/* Dropzone */}
          <div
            className={[
              "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-gray-50 to-white shadow-sm",
              dragOver
                ? "border-blue-500 ring-4 ring-blue-100"
                : "border-gray-200",
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
                    {file
                      ? "Click Next to save it."
                      : "Or choose a file from your device."}
                  </p>
                </div>
              </div>

              {/* File row */}
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                {file ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {file.name}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {(file.size / 1024 / 1024).toFixed(2)} MB •{" "}
                        {isSaving
                          ? "Saving…"
                          : proof
                          ? "Saved"
                          : saveError
                          ? "Not saved"
                          : "Ready"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setProof(null);
                        setSaveError(null);
                        if (inputRef.current)
                          inputRef.current.value = "";
                      }}
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={pickFile}
                    className="inline-flex w-full items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Choose file
                  </button>
                )}
              </div>

              <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={onInputChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Cloud imports (unchanged visually) */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-900">
              Import from cloud
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Connect a provider to pick a resume
            </div>

            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-xs text-gray-600">
              Uploading PDF usually preserves formatting best.
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-8 flex items-center justify-between">
          <Link
            href="/onboarding/job-interest"
            className="text-sm font-semibold underline underline-offset-4"
          >
            Skip for now
          </Link>

          <button
            type="button"
            onClick={uploadResumeAndContinue}
            disabled={!file || isSaving}
            className={[
              "rounded-full px-8 py-3 font-medium text-white",
              !file || isSaving
                ? "cursor-not-allowed bg-gray-400"
                : "bg-black",
            ].join(" ")}
          >
            {isSaving ? "Saving..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
