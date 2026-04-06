import type { Job } from "./types";

type JobDetailSummaryKind = "dashboard" | "public";

const STORAGE_KEYS: Record<JobDetailSummaryKind, string> = {
  dashboard: "hirexa-dashboard-job-detail-summary",
  public: "hirexa-public-job-detail-summary",
};

function isJobSummary(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Job>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.company === "string" &&
    typeof candidate.location === "string" &&
    typeof candidate.posted === "string"
  );
}

export function storeJobDetailSummary(kind: JobDetailSummaryKind, job: Job) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(job));
  } catch {
    // Ignore storage failures and fall back to server-side detail loading.
  }
}

export function readJobDetailSummary(kind: JobDetailSummaryKind, jobId: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEYS[kind]);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isJobSummary(parsed)) return null;
    if (parsed.id !== jobId) return null;

    return parsed;
  } catch {
    return null;
  }
}
