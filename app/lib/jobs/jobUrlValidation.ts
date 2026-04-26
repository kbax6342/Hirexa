import {
  isAdzunaUrl,
  isSearchResultsUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

const STATIC_EXTENSIONS =
  /\.(?:js|css|json|png|jpg|jpeg|svg|gif|woff2?|ico|map)(?:$|\?)/i;

const TRACKING_HOST_PATTERNS = [
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "adservice.google.com",
  "google-analytics.com",
  "googletagmanager.com",
];

const AGGREGATOR_HOST_PATTERNS = [
  "adzuna.com",
  "indeed.com",
  "linkedin.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "talent.com",
  "jooble.org",
  "careerjet.com",
];

const KNOWN_ATS_HOST_PATTERNS = [
  "myworkdayjobs.com",
  "workdayjobs.com",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "workable.com",
  "icims.com",
  "jobvite.com",
  "bamboohr.com",
  "dayforcehcm.com",
  "successfactors.com",
  "taleo.net",
  "adp.com",
  "paylocity.com",
  "recruitee.com",
  "rippling.com",
];

const INVALID_PATH_PATTERNS = [
  /\/search(?:\/|$|\?)/i,
  /\/jobs\?q=/i,
  /\/results?(?:\/|$|\?)/i,
  /\/category(?:\/|$|\?)/i,
];

const COMPANY_JOB_PATH_PATTERNS = [
  /\/careers?(?:\/|$)/i,
  /\/jobs?(?:\/|$)/i,
  /\/job\/?/i,
  /\/apply(?:\/|$)/i,
  /\/positions?(?:\/|$)/i,
  /\/openings?(?:\/|$)/i,
];

function hostMatches(hostname: string, pattern: string) {
  return hostname === pattern || hostname.endsWith(`.${pattern}`);
}

export function isValidResolvedJobUrl(url: string): boolean {
  const normalizedUrl = normalizeJobUrl(String(url ?? ""));
  if (!normalizedUrl) return false;
  if (STATIC_EXTENSIONS.test(normalizedUrl)) return false;
  if (isAdzunaUrl(normalizedUrl)) return false;

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = decodeURIComponent(parsed.pathname || "/");
  const fullPath = `${pathname}${parsed.search}`;

  if (isSearchResultsUrl(normalizedUrl)) {
    return false;
  }

  if (TRACKING_HOST_PATTERNS.some((pattern) => hostMatches(hostname, pattern))) {
    return false;
  }

  if (INVALID_PATH_PATTERNS.some((pattern) => pattern.test(fullPath))) {
    return false;
  }

  if (AGGREGATOR_HOST_PATTERNS.some((pattern) => hostMatches(hostname, pattern))) {
    return false;
  }

  if (KNOWN_ATS_HOST_PATTERNS.some((pattern) => hostMatches(hostname, pattern))) {
    return true;
  }

  return COMPANY_JOB_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}
