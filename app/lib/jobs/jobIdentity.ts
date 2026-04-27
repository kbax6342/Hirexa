import { extractAtsJobIdentityFromUrl } from "@/app/lib/apply/atsUrlIdentity";
import { normalizeAdzunaProviderId } from "@/app/lib/jobs/adzunaProviderId";
import { normalizeJobUrl } from "@/app/lib/jobSources";

export type JobIdentitySnapshot = {
  source: string;
  sourceJobId: string;
  rawSourceJobId?: string | null;
  title: string;
  company: string;
  location?: string | null;
  jobUrl?: string | null;
  resolvedApplyUrl?: string | null;
  applyProvider?: string | null;
  capturedAt: string;
};

export type JobIdentityMismatch = {
  field: string;
  expected: string | null;
  actual: string | null;
  severity: "block" | "warn";
};

type JobIdentityInput = {
  source?: unknown;
  sourceJobId?: unknown;
  rawSourceJobId?: unknown;
  id?: unknown;
  title?: unknown;
  jobTitle?: unknown;
  company?: unknown;
  location?: unknown;
  jobUrl?: unknown;
  resolvedApplyUrl?: unknown;
  applyProvider?: unknown;
  capturedAt?: unknown;
};

function asText(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeSourceJobId(value: string) {
  const trimmed = asText(value);
  const withoutPrefix = trimmed.replace(/^[a-z][a-z0-9_-]*:/i, "");
  return normalizeAdzunaProviderId(withoutPrefix) || withoutPrefix;
}

export function normalizeJobTitle(value: string) {
  return asText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[|()[\]{}]/g, "")
    .trim();
}

export function normalizeCompanyName(value: string) {
  return asText(value)
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLocation(value: string) {
  return asText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\busa\b/g, "united states")
    .trim();
}

export function buildJobIdentitySnapshot(job: JobIdentityInput): JobIdentitySnapshot {
  const rawSourceJobId = asText(job.rawSourceJobId) || asText(job.sourceJobId) || asText(job.id);
  const sourceJobId = normalizeSourceJobId(asText(job.sourceJobId) || asText(job.id) || rawSourceJobId);
  const jobUrl = normalizeJobUrl(asText(job.jobUrl)) || null;
  const resolvedApplyUrl = normalizeJobUrl(asText(job.resolvedApplyUrl)) || null;

  return {
    source: asText(job.source).toLowerCase(),
    sourceJobId,
    rawSourceJobId: rawSourceJobId || null,
    title: asText(job.title) || asText(job.jobTitle),
    company: asText(job.company),
    location: asText(job.location) || null,
    jobUrl,
    resolvedApplyUrl,
    applyProvider: asText(job.applyProvider).toLowerCase() || null,
    capturedAt: asText(job.capturedAt) || new Date().toISOString(),
  };
}

function pushMismatch(
  mismatches: JobIdentityMismatch[],
  field: string,
  expected: string | null | undefined,
  actual: string | null | undefined,
  severity: "block" | "warn",
) {
  mismatches.push({
    field,
    expected: expected || null,
    actual: actual || null,
    severity,
  });
}

function compareUrlTokens(
  mismatches: JobIdentityMismatch[],
  expectedUrl: string | null | undefined,
  actualUrl: string | null | undefined,
) {
  const expectedIdentity = extractAtsJobIdentityFromUrl(expectedUrl);
  const actualIdentity = extractAtsJobIdentityFromUrl(actualUrl);
  if (
    expectedIdentity.provider !== "unknown" &&
    expectedIdentity.provider === actualIdentity.provider &&
    expectedIdentity.token &&
    actualIdentity.token &&
    expectedIdentity.token !== actualIdentity.token
  ) {
    pushMismatch(
      mismatches,
      "resolvedApplyUrl",
      expectedIdentity.token,
      actualIdentity.token,
      "block",
    );
  }
}

export function compareJobIdentitySnapshots(
  expected: JobIdentitySnapshot | null | undefined,
  actual: JobIdentitySnapshot | null | undefined,
) {
  const mismatches: JobIdentityMismatch[] = [];

  if (!expected || !actual) {
    return { matches: true, mismatches };
  }

  if (expected.source && actual.source && expected.source !== actual.source) {
    pushMismatch(mismatches, "source", expected.source, actual.source, "block");
  }

  if (
    expected.sourceJobId &&
    actual.sourceJobId &&
    normalizeSourceJobId(expected.sourceJobId) !== normalizeSourceJobId(actual.sourceJobId)
  ) {
    pushMismatch(
      mismatches,
      "sourceJobId",
      expected.sourceJobId,
      actual.sourceJobId,
      "block",
    );
  }

  const expectedCompany = normalizeCompanyName(expected.company);
  const actualCompany = normalizeCompanyName(actual.company);
  if (expectedCompany && actualCompany && expectedCompany !== actualCompany) {
    pushMismatch(mismatches, "company", expected.company, actual.company, "block");
  }

  const expectedTitle = normalizeJobTitle(expected.title);
  const actualTitle = normalizeJobTitle(actual.title);
  if (
    expectedTitle &&
    actualTitle &&
    expectedTitle !== actualTitle &&
    !expectedTitle.includes(actualTitle) &&
    !actualTitle.includes(expectedTitle)
  ) {
    pushMismatch(mismatches, "title", expected.title, actual.title, "block");
  }

  const expectedLocation = normalizeLocation(expected.location ?? "");
  const actualLocation = normalizeLocation(actual.location ?? "");
  if (expectedLocation && actualLocation && expectedLocation !== actualLocation) {
    pushMismatch(mismatches, "location", expected.location, actual.location, "warn");
  }

  compareUrlTokens(mismatches, expected.resolvedApplyUrl ?? expected.jobUrl, actual.resolvedApplyUrl ?? actual.jobUrl);
  compareUrlTokens(mismatches, expected.jobUrl, actual.jobUrl);

  return {
    matches: !mismatches.some((mismatch) => mismatch.severity === "block"),
    mismatches,
  };
}
