"use client";

import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  BookmarkIcon as BookmarkOutline,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolid } from "@heroicons/react/24/solid";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";

export type JobCardData = {
  id?: string;
  job_id?: string;
  uuid?: string;
  title: string;
  company: string;
  salary?: string;
  location: string;
  posted?: string;
  jobUrl?: string;
  url?: string;
  logoText?: string;
  logoUrl?: string;
  pill?: string;
};

type JobCardProps = {
  job: JobCardData;
  isSaved?: boolean;
  onSavedChange?: (saved: boolean) => void;
  onApply?: (job: JobCardData) => void;
};

type SaveJobResponse = {
  error?: string;
};

function normalizeSaveKey(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function resolvePrimaryJobId(job: JobCardData) {
  return normalizeSaveKey(job.id ?? job.job_id ?? job.uuid);
}

export function resolveSavedJobId(job: JobCardData) {
  const explicitId = resolvePrimaryJobId(job);
  if (explicitId) return explicitId;

  const urlId = normalizeSaveKey(job.jobUrl ?? job.url);
  if (urlId) return urlId;

  const fallback = [job.title, job.company, job.location]
    .map((value) => normalizeSaveKey(value)?.toLowerCase() ?? "")
    .filter(Boolean)
    .join("::");

  return fallback || null;
}

function formatPostedDate(value?: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function JobCard({
  job,
  isSaved = false,
  onSavedChange,
  onApply,
}: JobCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus } = useSession();
  const [saved, setSaved] = useState(isSaved);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSaved(isSaved);
  }, [isSaved]);

  const salaryText = job.salary ?? job.pill;
  const applyUrl = useMemo(
    () => normalizeSaveKey(job.jobUrl ?? job.url) ?? "",
    [job.jobUrl, job.url],
  );
  const applyLabel = "Apply Now";
  const postedLabel = formatPostedDate(job.posted);
  const jobId = resolvePrimaryJobId(job);
  const savedJobId = jobId ?? resolveSavedJobId(job);

  function handleAiAssistantApply() {
    if (onApply) {
      onApply(job);
      return;
    }

    if (!applyUrl) return;

    const encodedUrl = encodeURIComponent(applyUrl);
    router.push(`/job-tools/ai-assistant/apply?jobUrl=${encodedUrl}`);
  }

  function handleViewDetails() {
    sessionStorage.setItem("selectedJob", JSON.stringify(job));
    router.push("/jobs/details");
  }

  async function handleSaveToggle() {
    if (isSaving) return;

    if (authStatus === "loading") {
      return;
    }

    if (authStatus !== "authenticated") {
      const callbackUrl =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : pathname || "/jobs";
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    if (!savedJobId) {
      setSaveError("Unable to identify this job for saving.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/saved-jobs", {
        method: saved ? "DELETE" : "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(
          saved
            ? {
                jobId: savedJobId,
              }
            : {
                jobId: savedJobId,
                title: job.title,
                company: job.company,
                location: job.location,
                url: applyUrl,
              },
        ),
      });

      const payload = (await response.json().catch(() => ({}))) as SaveJobResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update saved job.");
      }

      const nextSaved = !saved;
      setSaved(nextSaved);
      onSavedChange?.(nextSaved);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to update saved job.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="
        relative
        h-full
        rounded-2xl bg-white p-6
        shadow-sm ring-1 ring-slate-200
        transition hover:shadow-md hover:ring-slate-300
        flex flex-col
      "
    >

      <button
        type="button"
        onClick={handleSaveToggle}
        disabled={isSaving}
        aria-pressed={saved}
        aria-label={saved ? `Unsave ${job.title}` : `Save ${job.title}`}
        className="absolute top-3 right-3 z-10 p-1 transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saved ? (
          <BookmarkSolid className="h-5 w-5 text-blue-600" />
        ) : (
          <BookmarkOutline className="h-5 w-5 text-slate-500" />
        )}
      </button>

      <div className="pr-14">
        <div>
          <button
            type="button"
            onClick={handleViewDetails}
            className="block w-full text-left text-[15px] font-semibold text-slate-900 hover:underline line-clamp-2"
            title={job.title}
          >
            {job.title}
          </button>
        </div>

        <div className="mt-2 text-sm text-slate-600 line-clamp-1">
          {job.company} • {job.location}
        </div>

        {salaryText ? (
          <div className="mt-3 inline-flex rounded-md bg-background/40 px-2.5 py-1 text-xs font-medium">
            {salaryText}
          </div>
        ) : (
          <div className="mt-3 h-6" />
        )}

        {postedLabel ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <svg
              className="h-4 w-4 text-sky-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>

            <span className="line-clamp-1">Posted on: {postedLabel}</span>
          </div>
        ) : (
          <div className="mt-3 h-4" />
        )}

        <AdzunaAttribution className="mt-3" />
      </div>

      <div className="mt-auto pt-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAiAssistantApply}
            disabled={!applyUrl && !onApply}
            className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              <span>{applyLabel}</span>
              <ArrowRightIcon className="h-4 w-4" />
            </span>
          </button>

          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Apply externally for ${job.title}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 p-3 text-slate-700 hover:bg-slate-100"
            >
              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
            </a>
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center rounded-md border border-slate-200 p-3 text-slate-400"
            >
              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
            </span>
          )}
        </div>

        {saveError ? (
          <p className="mt-3 text-xs text-rose-600">{saveError}</p>
        ) : saved ? (
          <p className="mt-3 text-xs text-sky-700">Saved to your jobs list.</p>
        ) : (
          <div className="mt-3 h-4" />
        )}
      </div>
    </div>
  );
}
