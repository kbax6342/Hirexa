import type { Job, JobSource } from "@/app/lib/jobs/types";
import { normalizeJobUrl } from "@/app/lib/jobSources";

export type ApplyProvider = "greenhouse" | "ashby";

type ProviderJobLike = {
  source?: string | JobSource | null;
  jobUrl?: string | null;
};

function normalizeSource(value: string | JobSource | null | undefined) {
  const source = String(value ?? "").trim().toLowerCase();
  return source.length > 0 ? source : "";
}

export function normalizeApplyProvider(value: unknown): ApplyProvider | null {
  const provider = String(value ?? "").trim().toLowerCase();
  if (provider === "greenhouse" || provider === "ashby") {
    return provider;
  }

  return null;
}

export function isGreenhouseUrl(jobUrl: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(String(jobUrl ?? ""));
  if (!normalizedUrl) return false;

  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    return host.endsWith("greenhouse.io") || (host.includes("greenhouse") && path.includes("apply"));
  } catch {
    return false;
  }
}

export function isAshbyUrl(jobUrl: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(String(jobUrl ?? ""));
  if (!normalizedUrl) return false;

  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.toLowerCase();
    return host.includes("ashbyhq.com") || host.includes("ashby");
  } catch {
    return false;
  }
}

export function detectApplyProviderFromUrl(
  jobUrl: string | null | undefined
): ApplyProvider | null {
  if (isGreenhouseUrl(jobUrl)) return "greenhouse";
  if (isAshbyUrl(jobUrl)) return "ashby";
  return null;
}

export function isGreenhouseJob(job: ProviderJobLike | null | undefined) {
  const source = normalizeSource(job?.source);
  return source === "greenhouse" || isGreenhouseUrl(job?.jobUrl);
}

export function isAshbyJob(job: ProviderJobLike | null | undefined) {
  const source = normalizeSource(job?.source);
  return source === "ashby" || isAshbyUrl(job?.jobUrl);
}

export function detectApplyProviderFromJob(
  job: ProviderJobLike | null | undefined
): ApplyProvider | null {
  if (!job) return null;
  if (isGreenhouseJob(job)) return "greenhouse";
  if (isAshbyJob(job)) return "ashby";
  return null;
}

export function getApplyProviderButtonLabel(provider: ApplyProvider | null) {
  switch (provider) {
    case "greenhouse":
      return "Greenhouse Auto Apply";
    case "ashby":
      return "Ashby Auto Apply";
    default:
      return "AI Assistant Apply";
  }
}

export function getApplyProviderLoadingLabel(provider: ApplyProvider | null) {
  switch (provider) {
    case "greenhouse":
      return "Starting Greenhouse apply...";
    case "ashby":
      return "Starting Ashby apply...";
    default:
      return "Opening...";
  }
}

export function buildApplyProviderPayload(job: Pick<Job, "id" | "title" | "company" | "location" | "jobUrl" | "source">) {
  const applyProvider = detectApplyProviderFromJob(job);

  return {
    sourceJobId: job.id,
    jobTitle: job.title,
    company: job.company,
    location: job.location,
    jobUrl: job.jobUrl ?? null,
    source: job.source,
    applyProvider,
  };
}
