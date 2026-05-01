"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  DocumentArrowUpIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  JOB_PRIORITIES_ROUTE,
  PRIMARY_ONBOARDING_FLOW_ROUTES,
  RESUME_IMPORT_ROUTE,
  WORK_STORY_ROUTE,
  getNextPrimaryOnboardingRoute,
  getPreviousPrimaryOnboardingRoute,
} from "@/app/lib/onboarding-flow";

const ONBOARDING_RESUME_SKIPPED_COOKIE = "onboarding_resume_skipped";
const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;

type ResumeUploadResponse = {
  ok?: boolean;
  error?: string;
  resume?: {
    id: string;
    fileName?: string | null;
    filename?: string | null;
  } | null;
};

function setResumeSkippedCookie() {
  document.cookie = `${ONBOARDING_RESUME_SKIPPED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

function getFileExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length < 2) return "";
  return `.${parts.at(-1) ?? ""}`;
}

export default function ResumeImportStep() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{
    resumeId: string;
    fileName: string;
  } | null>(null);

  const accept = useMemo(() => SUPPORTED_EXTENSIONS.join(","), []);
  const currentStep = PRIMARY_ONBOARDING_FLOW_ROUTES.indexOf(RESUME_IMPORT_ROUTE) + 1;
  const progressPercent = useMemo(
    () =>
      Math.max(
        8,
        Math.round((currentStep / PRIMARY_ONBOARDING_FLOW_ROUTES.length) * 100)
      ),
    [currentStep]
  );

  function handleBack() {
    router.push(
      getPreviousPrimaryOnboardingRoute(RESUME_IMPORT_ROUTE) ?? JOB_PRIORITIES_ROUTE
    );
  }

  function handleSkip() {
    setResumeSkippedCookie();
    router.push(
      getNextPrimaryOnboardingRoute(RESUME_IMPORT_ROUTE) ?? WORK_STORY_ROUTE
    );
  }

  function openFilePicker() {
    setSaveError(null);
    inputRef.current?.click();
  }

  async function uploadResume(file: File) {
    const extension = getFileExtension(file.name);

    if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
      setSaveError("Please upload a PDF, DOCX, or TXT file.");
      return;
    }

    setSelectedFileName(file.name);
    setSaving(true);
    setSaveError(null);

    try {
      const formData = new FormData();
      formData.append("resume", file, file.name);

      const response = await fetch("/api/onboarding/resume", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = (await response.json().catch(() => null)) as
        | ResumeUploadResponse
        | null;

      if (!response.ok || !data?.resume?.id) {
        throw new Error(
          data?.error ?? "We couldn't process your resume right now."
        );
      }

      setUploadSuccess({
        resumeId: data.resume.id,
        fileName: data.resume.fileName ?? data.resume.filename ?? file.name,
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "We couldn't process your resume right now."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    event.target.value = "";

    if (!nextFile) {
      return;
    }

    void uploadResume(nextFile);
  }

  function handleKeepGoing() {
    router.push(
      getNextPrimaryOnboardingRoute(RESUME_IMPORT_ROUTE) ?? WORK_STORY_ROUTE
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:justify-center lg:py-12">
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Your Resume</span>
            <span>{progressPercent}% complete</span>
          </div>
          <div
            className="mt-3 h-2 rounded-full bg-slate-200/90"
            aria-label="Onboarding progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressPercent}
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 shadow-[0_8px_24px_-12px_rgba(37,99,235,0.9)] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl pt-8 lg:mt-8 lg:pt-0">

          <section className="rounded-[32px] border border-slate-200/80 bg-white p-5 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)] sm:p-8">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex w-fit items-center gap-2 self-start rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>

            {uploadSuccess ? (
              <div className="mt-6" aria-live="polite">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-[0_16px_36px_-24px_rgba(16,185,129,0.8)]">
                  <CheckCircleIcon className="h-8 w-8" />
                </div>
                <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Nice &mdash; I found your background.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                  I&apos;ll use this to improve your profile, job matches, and
                  application drafts.
                </p>
                <div className="mt-6 rounded-[24px] border border-emerald-100 bg-emerald-50/70 px-4 py-4 text-sm text-emerald-900">
                  <div className="font-medium">Saved resume</div>
                  <div className="mt-1 text-emerald-700">
                    {uploadSuccess.fileName}
                  </div>
                </div>
                <div className="pt-8">
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleKeepGoing}
                    className="h-[52px] w-full rounded-2xl bg-[#145efc] text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6]"
                  >
                    Keep Going
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Want me to do the heavy lifting?
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                  Upload your resume and I&apos;ll pull in your experience,
                  skills, and job history automatically.
                </p>

                <div className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.4)] sm:p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                    <DocumentArrowUpIcon className="h-6 w-6" />
                  </div>
                  <div className="mt-4">
                    <h2 className="text-lg font-semibold text-slate-950">
                      Let Hirexa pull this together for you
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      One upload gives me a head start on your profile, matches,
                      and application drafts.
                    </p>
                  </div>

                  <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    onChange={handleFileChange}
                    className="hidden"
                    aria-label="Upload your resume"
                  />

                  {selectedFileName ? (
                    <div
                      className={cn(
                        "mt-5 rounded-[20px] border px-4 py-3 text-sm",
                        saving
                          ? "border-sky-100 bg-sky-50 text-sky-800"
                          : "border-slate-200 bg-white text-slate-700"
                      )}
                    >
                      <div className="font-medium">
                        {saving ? "Reading your resume..." : "Selected file"}
                      </div>
                      <div className="mt-1">{selectedFileName}</div>
                    </div>
                  ) : null}

                  {saveError ? (
                    <div
                      className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                      role="alert"
                    >
                      {saveError}
                    </div>
                  ) : null}

                  <div className="pt-6">
                    <Button
                      type="button"
                      size="lg"
                      disabled={saving}
                      onClick={openFilePicker}
                      className="h-[52px] w-full rounded-2xl bg-[#145efc] text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6]"
                    >
                      {saving ? "Uploading..." : "Upload resume"}
                    </Button>
                    <p className="mt-3 text-center text-xs font-medium tracking-[0.02em] text-slate-500">
                      PDF, DOCX, or TXT supported
                    </p>
                  </div>
                </div>

                <div className="pt-5">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={saving}
                    onClick={handleSkip}
                    className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white text-base font-medium text-slate-700 hover:bg-slate-50"
                  >
                    I&apos;ll answer a few questions instead
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
