import type { Job } from "@/app/lib/jobs/types";

const REMOTE_PATTERNS = [
  /\bremote\b/i,
  /\bwork\s+from\s+home\b/i,
  /\bwfh\b/i,
  /\bdistributed\b/i,
  /\banywhere\b/i,
  /\bvirtual\b/i,
  /\btelecommut(e|ing)\b/i,
  /\btelework\b/i,
];

const NON_REMOTE_PATTERNS = [
  /\bon[\s-]?site\b/i,
  /\bin[\s-]?person\b/i,
  /\bhybrid\b/i,
];

function buildSearchableText(job: Pick<Job, "title" | "location" | "description" | "searchText">) {
  return [job.title, job.location, job.description, job.searchText]
    .filter(Boolean)
    .join(" ");
}

export function isRemoteJob(
  job: Pick<Job, "title" | "location" | "description" | "searchText">
) {
  const searchableText = buildSearchableText(job);
  if (!searchableText.trim()) {
    return false;
  }

  const hasRemoteSignal = REMOTE_PATTERNS.some((pattern) => pattern.test(searchableText));
  if (!hasRemoteSignal) {
    return false;
  }

  const hasNonRemoteSignal = NON_REMOTE_PATTERNS.some((pattern) =>
    pattern.test(searchableText)
  );

  return !hasNonRemoteSignal;
}
