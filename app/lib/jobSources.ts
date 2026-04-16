export type DerivedJobSource = "greenhouse" | "adzuna_external" | "unknown";

const ATS_HOST_PATTERNS = [
  /(?:^|\.)greenhouse\.io$/i,
  /(?:^|\.)jobs\.lever\.co$/i,
  /(?:^|\.)lever\.co$/i,
  /(?:^|\.)ashbyhq\.com$/i,
  /(?:^|\.)smartrecruiters\.com$/i,
  /(?:^|\.)icims\.com$/i,
  /(?:^|\.)bamboohr\.com$/i,
  /(?:^|\.)jobvite\.com$/i,
  /(?:^|\.)myworkdayjobs\.com$/i,
  /(?:^|\.)workdayjobs\.com$/i,
  /(?:^|\.)myworkdaysite\.com$/i,
  /(?:^|\.)workable\.com$/i,
  /(?:^|\.)recruitee\.com$/i,
] as const;

const AGGREGATOR_HOST_FRAGMENTS = [
  "adzuna",
  "appcast.io",
  "indeed.com",
  "linkedin.com",
  "glassdoor.com",
  "monster.com",
  "ziprecruiter.com",
  "talent.com",
  "simplyhired.com",
  "jobrapido.com",
  "jobg8.com",
  "lensa.com",
  "talroo.com",
  "dice.com",
] as const;

const COMPANY_CAREERS_SEGMENTS = [
  "/careers",
  "/career",
  "/jobs",
  "/job",
  "/positions",
  "/position",
  "/openings",
  "/opportunities",
  "/join-us",
  "/work-with-us",
  "/job-detail",
  "/job-details",
  "/job/",
  "/jobs/",
] as const;

function safeParseUrl(rawUrl: string) {
  const normalized = normalizeJobUrl(rawUrl);
  if (!normalized) return null;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function toHttps(url: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function normalizeJobUrl(url: string): string {
  return toHttps(String(url ?? "").trim());
}

export function isGreenhouseUrl(url: string): boolean {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const host = normalizeHostname(parsed.hostname);
  const path = parsed.pathname.toLowerCase();

  if (host.endsWith("greenhouse.io")) return true;
  return host.includes("greenhouse") && path.includes("apply");
}

export function isAdzunaUrl(url: string): boolean {
  const parsed = safeParseUrl(url);
  return Boolean(parsed && normalizeHostname(parsed.hostname).includes("adzuna"));
}

export function isAppcastUrl(url: string): boolean {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const host = normalizeHostname(parsed.hostname);
  return host === "appcast.io" || host === "click.appcast.io" || host.endsWith(".appcast.io");
}

export function isAggregatorHandoffUrl(url: string): boolean {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const host = normalizeHostname(parsed.hostname);
  const path = normalizePathname(parsed.pathname).toLowerCase();
  const query = parsed.search.toLowerCase();

  if (isAdzunaUrl(url) || isAppcastUrl(url)) {
    return true;
  }

  const hasAggregatorHost = AGGREGATOR_HOST_FRAGMENTS.some(
    (fragment) => host === fragment || host.endsWith(`.${fragment}`),
  );

  if (!hasAggregatorHost) {
    return false;
  }

  if (
    /redirect|outbound|apply|external|handoff|track|tracking|click|land\/ad/i.test(
      `${path}${query}`,
    )
  ) {
    return true;
  }

  return /[?&](url|dest|destination|redirect|redirect_url|external)=/i.test(query);
}

export function isLikelyAtsUrl(url: string): boolean {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const host = normalizeHostname(parsed.hostname);
  return ATS_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export function isLikelyCompanyCareersUrl(url: string): boolean {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  if (isAggregatorHandoffUrl(url) || isLikelyAtsUrl(url)) {
    return false;
  }

  const host = normalizeHostname(parsed.hostname);
  const path = normalizePathname(parsed.pathname).toLowerCase();
  const pathnameWithHost = `${host}${path}`;

  if (/^(careers?|jobs?)\./i.test(host)) {
    return true;
  }

  if (COMPANY_CAREERS_SEGMENTS.some((segment) => pathnameWithHost.includes(segment))) {
    return true;
  }

  return ["job", "jobid", "job_id", "career", "careerid", "gh_jid"].some(
    (key) => parsed.searchParams.has(key),
  );
}

export function classifyJobUrlKind(url: string) {
  if (isAggregatorHandoffUrl(url)) return "aggregator_handoff" as const;
  if (isLikelyAtsUrl(url)) return "direct_ats" as const;
  if (isLikelyCompanyCareersUrl(url)) return "company_careers" as const;
  return "unknown" as const;
}

export function deriveSourceFromUrl(url: string): DerivedJobSource {
  if (isGreenhouseUrl(url)) return "greenhouse";
  const normalized = normalizeJobUrl(url);
  if (!normalized) return "unknown";
  return "adzuna_external";
}
