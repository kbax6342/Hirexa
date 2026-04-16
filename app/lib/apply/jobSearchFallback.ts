import type { Page } from "playwright-core";
import type { PageSignals } from "@/app/lib/apply/playwrightSignals";
import {
  dedupeJobSearchResults,
  normalizeHostname,
  scoreTokenSimilarity,
  searchJobPages,
  tokenizeSimilarityInput,
  type JobSearchResult,
} from "@/app/lib/apply/jobSearchProvider";
import {
  isAggregatorHandoffUrl,
  isLikelyAtsUrl,
  isLikelyCompanyCareersUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

export const JOB_SEARCH_FALLBACK_MAX_QUERY_COUNT = 4;
export const JOB_SEARCH_FALLBACK_MAX_RESULTS = 10;
export const JOB_SEARCH_FALLBACK_MAX_CANDIDATE_VISITS = 3;

export type JobSearchFallbackCandidate = {
  url: string;
  title?: string;
  provider?: string;
  domain: string;
  confidence: number;
  reason: string;
  rejected?: boolean;
  rejectionReason?: string;
  pageTitle?: string;
  visibleApplyCta?: boolean;
  visibleApplyText?: string;
  looksLikeJobDetail?: boolean;
  popupOccurred?: boolean;
  downstreamProgressConfirmed?: boolean;
  finalUrl?: string;
};

export type JobSearchFallbackDiscovery = {
  queries: string[];
  candidates: JobSearchFallbackCandidate[];
  error?: string;
};

export type JobSearchFallbackPageInspection = {
  pageTitle?: string;
  visibleApplyCta: boolean;
  visibleApplyTexts: string[];
  looksLikeJobDetail: boolean;
  applicationFlowSignals: string[];
  genericPageSignals: string[];
  rejectionReason?: string;
};

type NormalizedFallbackInput = {
  title: string;
  company: string;
  location: string;
  currentUrl: string;
  source: string;
  titleTokens: string[];
  companyTokens: string[];
  companyCoreTokens: string[];
  locationTokens: string[];
};

type ScoredFallbackCandidate = JobSearchFallbackCandidate & {
  searchSource?: string;
  titleSimilarity: number;
  companySimilarity: number;
  locationSimilarity: number;
};

const COMPANY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "gmbh",
  "ag",
  "sa",
  "holdings",
]);

const APPLY_TEXT_PATTERNS = [
  "apply now",
  "start application",
  "continue application",
  "continue to application",
  "submit application",
  "apply",
  "continue",
  "next",
  "easy apply",
  "upload resume",
  "upload cv",
];

const LOW_VALUE_HOST_FRAGMENTS = [
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "wikipedia.org",
  "reddit.com",
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeCompanyName(value: string | null | undefined) {
  return tokenizeSimilarityInput(value)
    .filter((token) => !COMPANY_SUFFIXES.has(token))
    .join(" ");
}

function sanitizeQueryTerm(value: string) {
  return value.replace(/["]+/g, "").trim();
}

function buildNormalizedInput(args: {
  title: string;
  company: string;
  location?: string | null;
  currentUrl?: string | null;
  source?: string | null;
}): NormalizedFallbackInput {
  const title = normalizeText(args.title);
  const company = normalizeText(args.company);
  const location = normalizeText(args.location);
  const currentUrl = normalizeJobUrl(args.currentUrl ?? "");
  const source = normalizeText(args.source).toLowerCase();
  const titleTokens = tokenizeSimilarityInput(title);
  const companyTokens = tokenizeSimilarityInput(company);
  const companyCoreTokens = tokenizeSimilarityInput(normalizeCompanyName(company));
  const locationTokens = tokenizeSimilarityInput(location);

  return {
    title,
    company,
    location,
    currentUrl,
    source,
    titleTokens,
    companyTokens,
    companyCoreTokens: companyCoreTokens.length > 0 ? companyCoreTokens : companyTokens,
    locationTokens,
  };
}

function buildFallbackQueries(input: NormalizedFallbackInput) {
  const quotedTitle = `"${sanitizeQueryTerm(input.title)}"`;
  const quotedCompany = `"${sanitizeQueryTerm(input.company)}"`;
  const locationPart = input.location ? ` ${sanitizeQueryTerm(input.location)}` : "";
  const atsPrimary =
    "site:greenhouse.io OR site:jobs.lever.co OR site:ashbyhq.com OR site:smartrecruiters.com";
  const atsSecondary =
    "site:myworkdayjobs.com OR site:workdayjobs.com OR site:icims.com OR site:bamboohr.com OR site:jobvite.com";

  return dedupeStrings([
    `${quotedTitle} ${quotedCompany}${locationPart}`,
    `${quotedTitle} ${quotedCompany}${locationPart} apply`,
    `${quotedCompany} ${quotedTitle} careers`,
    `${quotedTitle} ${quotedCompany} ${atsPrimary}`,
    `${quotedTitle} ${quotedCompany} ${atsSecondary}`,
  ]).slice(0, JOB_SEARCH_FALLBACK_MAX_QUERY_COUNT);
}

function detectCandidateProvider(url: string) {
  const host = normalizeHostname(url);

  if (host.endsWith("greenhouse.io")) return "greenhouse";
  if (host.endsWith("jobs.lever.co") || host.endsWith("lever.co")) return "lever";
  if (host.endsWith("ashbyhq.com")) return "ashby";
  if (
    host.endsWith("myworkdayjobs.com") ||
    host.endsWith("workdayjobs.com") ||
    host.endsWith("myworkdaysite.com")
  ) {
    return "workday";
  }
  if (host.endsWith("smartrecruiters.com")) return "smartrecruiters";
  if (host.endsWith("icims.com")) return "icims";
  if (host.endsWith("bamboohr.com")) return "bamboohr";
  if (host.endsWith("jobvite.com")) return "jobvite";
  if (host.endsWith("workable.com")) return "workable";
  if (host.endsWith("recruitee.com")) return "recruitee";
  if (isLikelyCompanyCareersUrl(url)) return "company_careers";
  return undefined;
}

function companyHostBonus(companyCoreTokens: string[], url: string) {
  if (companyCoreTokens.length === 0) return 0;

  try {
    const parsed = new URL(normalizeJobUrl(url));
    const hostTokens = tokenizeSimilarityInput(
      `${parsed.hostname.replace(/\./g, " ")} ${decodeURIComponent(parsed.pathname)}`,
    );
    return Math.min(0.16, scoreTokenSimilarity(companyCoreTokens, hostTokens) * 0.22);
  } catch {
    return 0;
  }
}

function readUrlText(url: string) {
  try {
    const parsed = new URL(normalizeJobUrl(url));
    return `${parsed.hostname} ${decodeURIComponent(parsed.pathname)}`;
  } catch {
    return url;
  }
}

function looksLikeGenericPage(result: JobSearchResult, url: string) {
  const corpus = `${result.title} ${result.snippet ?? ""} ${readUrlText(url)}`.toLowerCase();

  if (
    /search results|jobs in |jobs near |browse jobs|related jobs|similar jobs|salary/i.test(
      corpus,
    )
  ) {
    return true;
  }

  try {
    const parsed = new URL(normalizeJobUrl(url));
    return /\/(search|browse|careers\/search|jobs\/search|jobs$|careers$)/i.test(
      parsed.pathname,
    );
  } catch {
    return false;
  }
}

function hasLowValueHost(url: string) {
  const host = normalizeHostname(url);
  return LOW_VALUE_HOST_FRAGMENTS.some(
    (fragment) => host === fragment || host.endsWith(`.${fragment}`),
  );
}

function scoreFallbackCandidate(
  input: NormalizedFallbackInput,
  result: JobSearchResult,
): ScoredFallbackCandidate {
  const candidateUrl = normalizeJobUrl(result.url);
  const domain = normalizeHostname(candidateUrl);
  const provider = detectCandidateProvider(candidateUrl);
  const corpus = [
    result.title,
    result.snippet,
    readUrlText(candidateUrl),
  ]
    .filter(Boolean)
    .join(" ");
  const titleSimilarity = scoreTokenSimilarity(input.titleTokens, corpus);
  const companySimilarity = Math.max(
    scoreTokenSimilarity(input.companyTokens, corpus),
    scoreTokenSimilarity(input.companyCoreTokens, corpus),
  );
  const locationSimilarity =
    input.locationTokens.length > 0
      ? scoreTokenSimilarity(input.locationTokens, corpus)
      : 0;
  const exactTitleBonus =
    result.title.toLowerCase().includes(input.title.toLowerCase()) ||
    input.title.toLowerCase().includes(result.title.toLowerCase())
      ? 0.1
      : 0;
  const preferredHostBonus =
    provider && provider !== "company_careers"
      ? 0.18
      : provider === "company_careers"
        ? 0.12
        : 0;
  const hostCompanyBonus = companyHostBonus(input.companyCoreTokens, candidateUrl);
  const jobDetailBonus =
    /\/(job|jobs|position|positions|opening|openings|career|careers|apply)/i.test(
      candidateUrl,
    )
      ? 0.08
      : 0;

  let penalty = 0;
  let rejectionReason: string | undefined;
  const reasonParts: string[] = [];

  if (provider) {
    reasonParts.push(`provider:${provider}`);
  }

  if (titleSimilarity >= 0.5) {
    reasonParts.push(`title_match:${titleSimilarity.toFixed(2)}`);
  } else if (titleSimilarity < 0.18) {
    penalty += 0.16;
    reasonParts.push("weak_title_match");
  }

  if (companySimilarity >= 0.3) {
    reasonParts.push(`company_match:${companySimilarity.toFixed(2)}`);
  } else if (companySimilarity < 0.15) {
    penalty += 0.14;
    reasonParts.push("weak_company_match");
  }

  if (input.locationTokens.length > 0) {
    if (locationSimilarity >= 0.22) {
      reasonParts.push(`location_match:${locationSimilarity.toFixed(2)}`);
    } else {
      penalty += 0.05;
      reasonParts.push("weak_location_match");
    }
  }

  if (preferredHostBonus > 0) {
    reasonParts.push("preferred_host_bonus");
  }

  if (hostCompanyBonus > 0.05) {
    reasonParts.push("company_host_bonus");
  }

  if (jobDetailBonus > 0) {
    reasonParts.push("job_detail_bonus");
  }

  if (exactTitleBonus > 0) {
    reasonParts.push("exact_title_bonus");
  }

  if (looksLikeGenericPage(result, candidateUrl)) {
    penalty += 0.26;
    reasonParts.push("generic_page_penalty");
    rejectionReason ??= "generic_search_or_category_page";
  }

  if (isAggregatorHandoffUrl(candidateUrl)) {
    penalty += 0.52;
    reasonParts.push("aggregator_handoff_penalty");
    rejectionReason = "aggregator_handoff_url";
  }

  if (hasLowValueHost(candidateUrl)) {
    penalty += 0.3;
    reasonParts.push("low_value_host_penalty");
    rejectionReason ??= "low_value_host";
  }

  if (!provider && !isLikelyCompanyCareersUrl(candidateUrl)) {
    penalty += 0.12;
    reasonParts.push("not_direct_job_page_penalty");
  }

  let confidence =
    titleSimilarity * 0.46 +
    companySimilarity * 0.24 +
    locationSimilarity * 0.08 +
    exactTitleBonus +
    preferredHostBonus +
    hostCompanyBonus +
    jobDetailBonus -
    penalty;

  confidence = Math.max(0, Math.min(0.99, confidence));

  if (confidence < 0.22 && !provider) {
    rejectionReason ??= "weak_job_match";
  }

  return {
    url: candidateUrl,
    title: result.title,
    provider,
    domain,
    confidence: Number(confidence.toFixed(3)),
    reason: reasonParts.join("; ") || "candidate_scored",
    rejected: Boolean(rejectionReason),
    rejectionReason,
    searchSource: result.source,
    titleSimilarity,
    companySimilarity,
    locationSimilarity,
  };
}

export async function discoverJobSearchFallbackCandidates(args: {
  title: string;
  company: string;
  location?: string | null;
  currentUrl?: string | null;
  source?: string | null;
  limit?: number;
}): Promise<JobSearchFallbackDiscovery> {
  const input = buildNormalizedInput(args);
  const limit = Math.max(1, Math.min(args.limit ?? JOB_SEARCH_FALLBACK_MAX_RESULTS, 16));

  if (!input.title || !input.company) {
    return {
      queries: [],
      candidates: [],
      error: "Job search fallback requires both title and company.",
    };
  }

  const queries = buildFallbackQueries(input);

  console.info("[AUTO_APPLY_JOB_SEARCH_FALLBACK] discovery start", {
    title: input.title,
    company: input.company,
    location: input.location || null,
    currentUrl: input.currentUrl || null,
    source: input.source || null,
    queryCount: queries.length,
  });

  const results = dedupeJobSearchResults(
    await searchJobPages({
      queries,
      limit,
    }),
  );

  const candidates = results
    .map((result) => scoreFallbackCandidate(input, result))
    .sort((left, right) => {
      if (left.rejected !== right.rejected) {
        return left.rejected ? 1 : -1;
      }

      return right.confidence - left.confidence;
    })
    .slice(0, limit)
    .map((candidate) => ({
      url: candidate.url,
      title: candidate.title,
      provider: candidate.provider,
      domain: candidate.domain,
      confidence: candidate.confidence,
      reason: candidate.reason,
      rejected: candidate.rejected,
      rejectionReason: candidate.rejectionReason,
    }));

  console.info("[AUTO_APPLY_JOB_SEARCH_FALLBACK] discovery completed", {
    title: input.title,
    company: input.company,
    candidateCount: candidates.length,
    topCandidates: candidates.map((candidate) => ({
      url: candidate.url,
      domain: candidate.domain,
      confidence: candidate.confidence,
      rejected: candidate.rejected === true,
      rejectionReason: candidate.rejectionReason ?? null,
      reason: candidate.reason,
    })),
  });

  return {
    queries,
    candidates,
    error:
      candidates.length > 0
        ? undefined
        : "No public job-page candidates were returned by the configured search provider.",
  };
}

export async function inspectJobSearchFallbackPage(
  page: Page,
): Promise<JobSearchFallbackPageInspection> {
  const snapshot = await page
    .evaluate((applyPatterns) => {
      function isVisible(element: Element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function getText(element: Element) {
        if (
          element instanceof HTMLInputElement &&
          (element.type === "submit" || element.type === "button")
        ) {
          return element.value ?? "";
        }

        return (
          element.textContent ??
          element.getAttribute("aria-label") ??
          element.getAttribute("title") ??
          ""
        );
      }

      const pageTitle = document.title.replace(/\s+/g, " ").trim() || undefined;
      const h1Text =
        document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "";
      const bodyText = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
      const visibleApplyTexts = Array.from(
        document.querySelectorAll(
          "a[href], button, input[type='submit'], input[type='button'], [role='button']",
        ),
      )
        .filter(isVisible)
        .map((element) => getText(element).replace(/\s+/g, " ").trim())
        .filter((text) =>
          text &&
          applyPatterns.some((pattern) => text.toLowerCase().includes(pattern)),
        )
        .slice(0, 6);

      const genericPageSignals: string[] = [];
      if (/search results|sort by|filter jobs|related jobs|similar jobs/i.test(bodyText)) {
        genericPageSignals.push("generic_search_text");
      }
      if (/showing \d+ jobs|jobs available|browse jobs/i.test(bodyText)) {
        genericPageSignals.push("job_list_text");
      }
      if (
        document.querySelectorAll("article, [data-job-id], [data-testid*='job']").length >= 6 &&
        visibleApplyTexts.length === 0
      ) {
        genericPageSignals.push("multi_job_layout");
      }

      const applicationFlowSignals = [
        /upload resume|upload cv/i.test(bodyText) ? "resume_upload" : null,
        /continue application|start application|submit application/i.test(bodyText)
          ? "application_continue"
          : null,
        /personal information|work experience|education/i.test(bodyText)
          ? "application_form_copy"
          : null,
      ].filter((value): value is string => Boolean(value));

      const jobDetailSignals = [
        h1Text ? "h1_present" : null,
        /job description|responsibilities|qualifications|requirements|about the role/i.test(
          bodyText,
        )
          ? "job_description_copy"
          : null,
        /location|department|posted|employment type|salary/i.test(bodyText)
          ? "job_metadata_copy"
          : null,
      ].filter((value): value is string => Boolean(value));

      return {
        pageTitle,
        visibleApplyTexts,
        genericPageSignals,
        applicationFlowSignals,
        looksLikeJobDetail:
          visibleApplyTexts.length > 0 ||
          applicationFlowSignals.length > 0 ||
          jobDetailSignals.length >= 2,
      };
    }, APPLY_TEXT_PATTERNS)
    .catch(() => ({
      pageTitle: undefined,
      visibleApplyTexts: [],
      genericPageSignals: [],
      applicationFlowSignals: [],
      looksLikeJobDetail: false,
    }));

  const finalUrl = page.url();
  let rejectionReason: string | undefined;

  if (isAggregatorHandoffUrl(finalUrl)) {
    rejectionReason = "candidate_resolved_to_aggregator_handoff";
  } else if (
    snapshot.genericPageSignals.length > 0 &&
    snapshot.visibleApplyTexts.length === 0 &&
    snapshot.applicationFlowSignals.length === 0 &&
    !isLikelyAtsUrl(finalUrl) &&
    !isLikelyCompanyCareersUrl(finalUrl)
  ) {
    rejectionReason = "candidate_looks_like_generic_listing_page";
  } else if (
    !snapshot.looksLikeJobDetail &&
    snapshot.applicationFlowSignals.length === 0 &&
    !isLikelyAtsUrl(finalUrl) &&
    !isLikelyCompanyCareersUrl(finalUrl)
  ) {
    rejectionReason = "candidate_does_not_look_like_job_detail";
  }

  return {
    pageTitle: snapshot.pageTitle,
    visibleApplyCta: snapshot.visibleApplyTexts.length > 0,
    visibleApplyTexts: snapshot.visibleApplyTexts,
    looksLikeJobDetail: snapshot.looksLikeJobDetail,
    applicationFlowSignals: snapshot.applicationFlowSignals,
    genericPageSignals: snapshot.genericPageSignals,
    rejectionReason,
  };
}

export function confirmJobSearchFallbackProgress(args: {
  initialUrl?: string | null;
  finalUrl: string;
  signals: Pick<PageSignals, "formDetected" | "needsHuman" | "confirmationDetected">;
  inspection?: Pick<JobSearchFallbackPageInspection, "applicationFlowSignals"> | null;
  interactionAttempted?: boolean;
}) {
  const initialUrl = normalizeJobUrl(args.initialUrl ?? "");
  const finalUrl = normalizeJobUrl(args.finalUrl);
  const movedToNewNonAggregatorDomain =
    args.interactionAttempted === true &&
    Boolean(initialUrl) &&
    finalUrl !== initialUrl &&
    !isAggregatorHandoffUrl(finalUrl) &&
    normalizeHostname(finalUrl) !== normalizeHostname(initialUrl);

  if (args.signals.formDetected) {
    return {
      ok: true,
      reason: "application_form_detected",
    };
  }

  if ((args.inspection?.applicationFlowSignals.length ?? 0) > 0) {
    return {
      ok: true,
      reason: `application_flow:${args.inspection?.applicationFlowSignals.join(",")}`,
    };
  }

  if (isLikelyAtsUrl(finalUrl)) {
    return {
      ok: true,
      reason: args.signals.needsHuman
        ? "direct_ats_page_requires_human_step"
        : "direct_ats_page_reached",
    };
  }

  if (
    isLikelyCompanyCareersUrl(finalUrl) &&
    (args.signals.needsHuman || movedToNewNonAggregatorDomain)
  ) {
    return {
      ok: true,
      reason: args.signals.needsHuman
        ? "company_application_page_requires_human_step"
        : "company_application_page_reached",
    };
  }

  if (movedToNewNonAggregatorDomain) {
    return {
      ok: true,
      reason: "navigated_to_non_interstitial_downstream_domain",
    };
  }

  return {
    ok: false,
    reason: args.signals.confirmationDetected
      ? "confirmation_detected_without_confirmed_downstream_progress"
      : "no_confirmed_application_progress",
  };
}
