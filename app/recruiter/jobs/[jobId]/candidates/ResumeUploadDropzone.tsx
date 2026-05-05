"use client";

import { useRef, useState, startTransition } from "react";
import { ArrowUpTrayIcon, DocumentArrowUpIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import type { RecruiterResumeSnapshotRecord } from "@/app/recruiter/jobs/[jobId]/candidates/types";

type ResumeUploadDropzoneProps = {
  jobId: string;
  disabled?: boolean;
  onSnapshotChange: (snapshot: RecruiterResumeSnapshotRecord) => void;
};

export default function ResumeUploadDropzone({
  jobId,
  disabled = false,
  onSnapshotChange,
}: ResumeUploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      Array.from(fileList).forEach((file) => formData.append("resumes", file));

      const response = await fetch(`/api/recruiter/jobs/${jobId}/resumes`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            errors?: string[];
            snapshot?: RecruiterResumeSnapshotRecord;
            createdSubmissionIds?: string[];
          }
        | null;

      if (!response.ok || data?.ok === false || !data?.snapshot) {
        throw new Error(data?.error ?? "Unable to upload resumes.");
      }

      startTransition(() => {
        onSnapshotChange(data.snapshot as RecruiterResumeSnapshotRecord);
      });

      const uploadedCount = data.createdSubmissionIds?.length ?? fileList.length;
      const partialErrors = Array.isArray(data.errors) ? data.errors.filter(Boolean) : [];
      setSuccess(
        partialErrors.length
          ? `${uploadedCount} resume${uploadedCount === 1 ? "" : "s"} uploaded. Some files still need attention.`
          : `${uploadedCount} resume${uploadedCount === 1 ? "" : "s"} uploaded and parsed.`
      );
      if (partialErrors.length) {
        setError(partialErrors.join(" "));
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Unable to upload resumes."
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        if (!disabled) {
          void uploadFiles(event.dataTransfer.files);
        }
      }}
      className={cn(
        "rounded-3xl border border-dashed bg-white p-5 transition",
        dragActive ? "border-sky-400 bg-sky-50/60" : "border-slate-300",
        disabled ? "opacity-70" : "hover:border-sky-300 hover:bg-slate-50"
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
            <DocumentArrowUpIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Upload resumes for this job</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Add PDF or DOCX resumes. Hirexa will store the submission, extract job-related facts, redact obvious personal information for scoring, and queue each profile for recruiter review.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Supported types: PDF, DOCX. Protected or irrelevant personal information is excluded from scoring where possible.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            disabled={disabled || uploading}
            className="rounded-2xl bg-sky-500 text-white hover:bg-sky-600"
            onClick={() => fileInputRef.current?.click()}
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload resumes"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            className="hidden"
            onChange={(event) => void uploadFiles(event.target.files)}
          />
        </div>
      </div>

      {success ? <p className="mt-4 text-sm text-emerald-700">{success}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
