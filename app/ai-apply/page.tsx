"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const AI_APPLY_SELECTED_JOB_STORAGE_KEY = "hirexa_ai_apply_selected_job";

type StoredSelectedJob = {
  id?: string | null;
  jobUrl?: string | null;
};

function readStoredSelectedJob() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(AI_APPLY_SELECTED_JOB_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredSelectedJob;
    return {
      id: typeof parsed?.id === "string" ? parsed.id.trim() : "",
      jobUrl: typeof parsed?.jobUrl === "string" ? parsed.jobUrl.trim() : "",
    };
  } catch {
    return null;
  }
}

export default function AiApplyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const jobId = searchParams.get("jobId")?.trim() ?? "";
    const storedJob = readStoredSelectedJob();
    const matchedJobUrl =
      storedJob?.jobUrl && (!jobId || storedJob.id === jobId) ? storedJob.jobUrl : "";

    router.replace(
      matchedJobUrl
        ? `/job-tools/ai-assistant/apply?jobUrl=${encodeURIComponent(matchedJobUrl)}`
        : "/job-tools/generate"
    );
  }, [router, searchParams]);

  return <div className="min-h-screen bg-white" />;
}
