import type { Page } from "playwright-core";
import type { JobSearchFallbackCandidate } from "@/app/lib/apply/jobSearchFallback";
import { detectPageSignals, waitForDomAndSettle } from "@/app/lib/apply/playwrightSignals";
import { validateAutomationStartUrl } from "@/app/lib/apply/urlValidation";
import { normalizeLocationLabel } from "@/app/lib/locationOptions";
import {
  isLikelyAtsUrl,
  isLikelyCompanyCareersUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

export const REAL_POSTING_NOT_FOUND_CODE = "REAL_POSTING_NOT_FOUND" as const;

const ECOSIA_SEARCH_URL = "https://www.ecosia.org/search";
const ECOSIA_MAX_RESULT_VISITS = 6;

const AGGREGATOR_SOURCE_PATTERNS = [
  "adzuna",
  "indeed",
  "ziprecruiter",
  "glassdoor",
  "monster",
  "simplyhired",
  "talent.com",
  "appcast",
  "aggregator",
  "external",
] as const;

type ScoredEcosiaCandidate = {
  url: string;
  title: string;
  snippet?: string;
  domain: string;
  score: number;
  reason: string;
  rejected: boolean;
  rejectionReason?: string;
};

export type JobSourceRoutingCandidateInput = {
  label: string;
  url?: string | null;
};

export type JobSourceRejectedCandidate = {
  label: string;
  url: string;
  reason: NonNullable<ReturnType<typeof validateAutomationStartUrl>["reason"]>;
};

export type JobSourceRoutingDecision = {
  selectedUrl?: string;
  selectedFrom?: string;
  aggregatorSourceDetected: boolean;
  requiresEcosiaSearch: boolean;
  rejectedCandidates: JobSourceRejectedCandidate[];
};

type EcosiaResolutionSuccess = {
  ok: true;
  query: string;
  resolvedUrl: string;
  chosenCandidateUrl: string;
  candidates: JobSearchFallbackCandidate[];
  attemptedCandidateCount: number;
  visitedUrls: string[];
};

type EcosiaResolutionFailure = {
  ok: false;
  query: string;
  failureCode: typeof REAL_POSTING_NOT_FOUND_CODE | "VERIFICATION_REQUIRED";
  message: string;
  finalUrl: string;
  candidates: JobSearchFallbackCandidate[];
  attemptedCandidateCount: number;
  visitedUrls: string[];
  verificationSignals?: string[];
};

export type EcosiaResolutionResult =
  | EcosiaResolutionSuccess
  | EcosiaResolutionFailure;

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSource(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function parseHostname(value: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(String(value ?? ""));
  if (!normalizedUrl) return "";

  try {
    return new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function tokenize(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 2);
}

function scoreTokenOverlap(tokens: string[], corpus: string) {
  if (tokens.length === 0) return 0;

  const corpusTokens = new Set(tokenize(corpus));
  const hitCount = tokens.filter((token) => corpusTokens.has(token)).length;
  return hitCount / tokens.length;
}

function looksLikeJobPath(url: string) {
  return /\/(job|jobs|position|positions|opening|openings|career|careers|apply)/i.test(
    url,
  );
}

function looksLikeJobDetailContent(args: { title: string; pageText: string }) {
  const corpus = `${args.title}\n${args.pageText}`.toLowerCase();
  return [
    /job description/,
    /responsibilit/,
    /qualifications?/,
    /requirements?/,
    /about the role/,
    /apply now/,
    /requisition/,
    /job id/,
  ].some((pattern) => pattern.test(corpus));
}

function sanitizeQueryValue(value: string) {
  return value.replace(/["]+/g, "").trim();
}

function toFallbackCandidate(
  candidate: ScoredEcosiaCandidate,
): JobSearchFallbackCandidate {
  const confidence = Math.max(
    0,
    Math.min(0.99, Number((candidate.score / 120).toFixed(3))),
  );

  return {
    url: candidate.url,
    title: candidate.title,
    domain: candidate.domain,
    confidence,
    reason: candidate.reason,
    rejected: candidate.rejected,
    rejectionReason: candidate.rejectionReason,
  };
}

function scoreEcosiaCandidate(args: {
  url: string;
  title: string;
  snippet?: string;
  titleTokens: string[];
  companyTokens: string[];
  locationTokens: string[];
}) {
  const normalizedUrl = normalizeJobUrl(args.url);
  const validation = validateAutomationStartUrl(normalizedUrl, {
    rejectAggregator: true,
    rejectSearchEngine: true,
  });
  const domain = parseHostname(normalizedUrl);

  if (!validation.isValid && validation.reason) {
    return {
      url: normalizedUrl,
      title: args.title,
      snippet: args.snippet,
      domain,
      score: 0,
      reason: `rejected:${validation.reason}`,
      rejected: true,
      rejectionReason: validation.reason,
    } satisfies ScoredEcosiaCandidate;
  }

  const corpus = [args.title, args.snippet, normalizedUrl].filter(Boolean).join(" ");
  const titleOverlap = scoreTokenOverlap(args.titleTokens, corpus);
  const companyOverlap = scoreTokenOverlap(args.companyTokens, corpus);
  const locationOverlap = scoreTokenOverlap(args.locationTokens, corpus);
  const atsBonus = isLikelyAtsUrl(normalizedUrl) ? 48 : 0;
  const careersBonus = isLikelyCompanyCareersUrl(normalizedUrl) ? 34 : 0;
  const jobPathBonus = looksLikeJobPath(normalizedUrl) ? 16 : 0;

  const score =
    titleOverlap * 30 +
    companyOverlap * 34 +
    locationOverlap * 12 +
    atsBonus +
    careersBonus +
    jobPathBonus;

  const weakMatch =
    titleOverlap < 0.2 &&
    companyOverlap < 0.2 &&
    !isLikelyAtsUrl(normalizedUrl) &&
    !isLikelyCompanyCareersUrl(normalizedUrl);

  const reasons = [
    `title_overlap:${titleOverlap.toFixed(2)}`,
    `company_overlap:${companyOverlap.toFixed(2)}`,
    `location_overlap:${locationOverlap.toFixed(2)}`,
    atsBonus > 0 ? "ats_bonus" : "",
    careersBonus > 0 ? "careers_bonus" : "",
    jobPathBonus > 0 ? "job_path_bonus" : "",
  ]
    .filter(Boolean)
    .join("; ");

  return {
    url: normalizedUrl,
    title: args.title,
    snippet: args.snippet,
    domain,
    score: Number(score.toFixed(2)),
    reason: reasons || "candidate_scored",
    rejected: weakMatch,
    rejectionReason: weakMatch ? "weak_match" : undefined,
  } satisfies ScoredEcosiaCandidate;
}

async function extractEcosiaCandidates(page: Page) {
  const extracted = await page
    .evaluate(() => {
      const seen = new Set<string>();
      const candidates: Array<{
        url: string;
        title: string;
        snippet?: string;
      }> = [];

      const anchors = Array.from(
        document.querySelectorAll("main a[href], a[href]"),
      );

      for (const anchor of anchors) {
        if (!(anchor instanceof HTMLAnchorElement)) continue;

        const href = anchor.getAttribute("href") ?? "";
        const text = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!href || !text) continue;

        let absoluteUrl = "";
        try {
          absoluteUrl = new URL(href, window.location.href).toString();
        } catch {
          continue;
        }

        if (!/^https?:\/\//i.test(absoluteUrl)) continue;
        if (absoluteUrl.includes("ecosia.org")) continue;
        if (seen.has(absoluteUrl)) continue;

        const container =
          anchor.closest("article, .result, [data-test*='result'], li") ??
          anchor.parentElement;
        const snippetNode = container?.querySelector(
          "p, .result-snippet, [data-test*='snippet']",
        );
        const snippet = snippetNode?.textContent?.replace(/\s+/g, " ").trim();

        candidates.push({
          url: absoluteUrl,
          title: text,
          snippet: snippet || undefined,
        });
        seen.add(absoluteUrl);

        if (candidates.length >= 24) {
          break;
        }
      }

      return candidates;
    })
    .catch(
      () =>
        [] as Array<{
          url: string;
          title: string;
          snippet?: string;
        }>,
    );

  return extracted;
}

export function isAggregatorSourceProvider(sourceProvider: string | null | undefined) {
  const normalized = normalizeSource(sourceProvider);
  if (!normalized) return false;

  return AGGREGATOR_SOURCE_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

export function buildEcosiaSearchQuery(args: {
  jobTitle?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  const normalizedLocation = normalizeLocationLabel(normalizeText(args.location));
  const parts = [
    normalizeText(args.jobTitle),
    normalizeText(args.company),
    normalizeText(normalizedLocation),
  ].filter(Boolean);

  return parts.map((part) => `"${sanitizeQueryValue(part)}"`).join(" ");
}

export function selectInitialAutomationTarget(args: {
  sourceProvider?: string | null;
  candidates: JobSourceRoutingCandidateInput[];
}) {
  const rejectedCandidates: JobSourceRejectedCandidate[] = [];
  let selectedUrl: string | undefined;
  let selectedFrom: string | undefined;
  let aggregatorSourceDetected = isAggregatorSourceProvider(args.sourceProvider);

  for (const candidate of args.candidates) {
    const normalizedUrl = normalizeJobUrl(String(candidate.url ?? ""));
    if (!normalizedUrl) continue;

    const validation = validateAutomationStartUrl(normalizedUrl, {
      rejectAggregator: true,
      rejectSearchEngine: true,
    });

    if (validation.isValid) {
      selectedUrl = normalizedUrl;
      selectedFrom = candidate.label;
      break;
    }

    if (validation.reason) {
      rejectedCandidates.push({
        label: candidate.label,
        url: normalizedUrl,
        reason: validation.reason,
      });
    }

    if (validation.isAggregator) {
      aggregatorSourceDetected = true;
    }
  }

  return {
    selectedUrl,
    selectedFrom,
    aggregatorSourceDetected,
    requiresEcosiaSearch: !selectedUrl,
    rejectedCandidates,
  } satisfies JobSourceRoutingDecision;
}

export async function resolveRealPostingViaEcosia(args: {
  page: Page;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  maxCandidateVisits?: number;
}): Promise<EcosiaResolutionResult> {
  const query = buildEcosiaSearchQuery({
    jobTitle: args.title,
    company: args.company,
    location: args.location,
  });
  const visitedUrls: string[] = [];

  if (!query || !normalizeText(args.title) || !normalizeText(args.company)) {
    return {
      ok: false,
      query,
      failureCode: REAL_POSTING_NOT_FOUND_CODE,
      message: "Real posting not found.",
      finalUrl: args.page.url(),
      candidates: [],
      attemptedCandidateCount: 0,
      visitedUrls,
    };
  }

  await args.page
    .goto(`${ECOSIA_SEARCH_URL}?q=${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded",
    })
    .catch(() => null);
  await waitForDomAndSettle(args.page);
  visitedUrls.push(args.page.url());

  const ecosiaSignals = await detectPageSignals(args.page);
  if (ecosiaSignals.verificationSignals.length > 0) {
    return {
      ok: false,
      query,
      failureCode: "VERIFICATION_REQUIRED",
      message: "Application paused because the employer site asked for verification.",
      finalUrl: args.page.url(),
      candidates: [],
      attemptedCandidateCount: 0,
      visitedUrls,
      verificationSignals: ecosiaSignals.verificationSignals,
    };
  }

  const rawCandidates = await extractEcosiaCandidates(args.page);
  const titleTokens = tokenize(args.title);
  const companyTokens = tokenize(args.company);
  const locationTokens = tokenize(normalizeLocationLabel(normalizeText(args.location)));

  const scoredCandidates = rawCandidates
    .map((candidate) =>
      scoreEcosiaCandidate({
        ...candidate,
        titleTokens,
        companyTokens,
        locationTokens,
      }),
    )
    .sort((left, right) => {
      if (left.rejected !== right.rejected) {
        return left.rejected ? 1 : -1;
      }

      return right.score - left.score;
    });
  const fallbackCandidates = scoredCandidates.map(toFallbackCandidate);
  const candidateVisitLimit = Math.max(
    1,
    Math.min(args.maxCandidateVisits ?? ECOSIA_MAX_RESULT_VISITS, ECOSIA_MAX_RESULT_VISITS),
  );
  const candidatesToVisit = scoredCandidates
    .filter((candidate) => candidate.rejected !== true)
    .slice(0, candidateVisitLimit);

  for (const candidate of candidatesToVisit) {
    const response = await args.page
      .goto(candidate.url, { waitUntil: "domcontentloaded" })
      .catch(() => null);
    await waitForDomAndSettle(args.page);

    const finalUrl = normalizeJobUrl(args.page.url());
    visitedUrls.push(finalUrl);

    const destinationSignals = await detectPageSignals(args.page);
    if (destinationSignals.verificationSignals.length > 0) {
      return {
        ok: false,
        query,
        failureCode: "VERIFICATION_REQUIRED",
        message: "Application paused because the employer site asked for verification.",
        finalUrl,
        candidates: fallbackCandidates,
        attemptedCandidateCount: visitedUrls.length,
        visitedUrls,
        verificationSignals: destinationSignals.verificationSignals,
      };
    }

    const destinationValidation = validateAutomationStartUrl(finalUrl, {
      rejectAggregator: true,
      rejectSearchEngine: true,
    });
    if (!destinationValidation.isValid) {
      continue;
    }

    const contentType =
      response?.headers()?.["content-type"] ??
      response?.headers()?.["Content-Type"] ??
      "";
    const looksLikeHtmlResponse =
      !contentType ||
      /text\/html|application\/xhtml\+xml/i.test(contentType);
    if (!looksLikeHtmlResponse) {
      continue;
    }

    const destinationTitle = await args.page.title().catch(() => "");
    const likelyDestination =
      isLikelyAtsUrl(finalUrl) ||
      isLikelyCompanyCareersUrl(finalUrl) ||
      looksLikeJobDetailContent({
        title: destinationTitle,
        pageText: destinationSignals.pageText,
      });
    if (!likelyDestination) {
      continue;
    }

    return {
      ok: true,
      query,
      resolvedUrl: finalUrl,
      chosenCandidateUrl: candidate.url,
      candidates: fallbackCandidates,
      attemptedCandidateCount: visitedUrls.length,
      visitedUrls,
    };
  }

  return {
    ok: false,
    query,
    failureCode: REAL_POSTING_NOT_FOUND_CODE,
    message: "Real posting not found.",
    finalUrl: args.page.url(),
    candidates: fallbackCandidates,
    attemptedCandidateCount: visitedUrls.length,
    visitedUrls,
  };
}
