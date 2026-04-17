import {
  dedupeJobSearchResults,
  normalizeHostname,
  resolveJobSearchProvider,
  scoreTokenSimilarity,
  searchJobPages,
  tokenizeSimilarityInput,
  type JobSearchResult,
} from "@/app/lib/apply/jobSearchProvider";
import { isAdzunaUnresolvedHandoffUrl } from "@/app/lib/apply/adzunaHandoff";
import { normalizeLocationLabel } from "@/app/lib/locationOptions";
import {
  isAggregatorHandoffUrl,
  isLikelyAtsUrl,
  isLikelyCompanyCareersUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

export type DirectJobResolution = {
  ok: boolean;
  resolvedUrl?: string;
  confidence?: number;
  provider?: string;
  matchReason?: string;
  acceptanceRule?: string;
  googleFirstTriggered?: boolean;
  queries?: string[];
  normalizedLocation?: string;
  searchProvider?: string;
  adzunaStrategyReplaySkipped?: boolean;
  candidates?: Array<{
    url: string;
    title?: string;
    provider?: string;
    confidence: number;
    reason: string;
  }>;
  error?: string;
};

type NormalizedResolverInput = {
  title: string;
  cleanedTitle: string;
  company: string;
  companyAliasVariants: string[];
  location: string;
  normalizedLocation: string;
  locationCity: string;
  currentUrl: string;
  source: string;
  titleTokens: string[];
  companyTokens: string[];
  companyCoreTokens: string[];
  locationTokens: string[];
  employerHostCandidates: string[];
  adzunaHandoffDetected: boolean;
  googleFirstTriggered: boolean;
};

type ScoredCandidate = {
  url: string;
  title?: string;
  provider?: string;
  confidence: number;
  reason: string;
  reasonParts: string[];
  snippet?: string;
  titleSimilarity: number;
  companySimilarity: number;
  locationSimilarity: number;
  preferredHostBonus: number;
  companyHostBonus: number;
  jobPathBonus: number;
  penalty: number;
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

const COMPANY_ALIAS_GROUPS = [
  [
    "RTX",
    "RTX Corporation",
    "Raytheon Technologies",
    "Raytheon Technologies Corporation",
  ],
] as const;

const UNRELATED_HOST_FRAGMENTS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "monster.com",
  "ziprecruiter.com",
  "talent.com",
  "simplyhired.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "wikipedia.org",
] as const;

const HIGH_CONFIDENCE_THRESHOLD = 0.72;
const ADZUNA_GOOGLE_FIRST_THRESHOLD = 0.64;
const MIN_CANDIDATE_THRESHOLD = 0.28;
const MAX_VERIFIED_CANDIDATES = 5;
const FETCH_TIMEOUT_MS = 8_000;
const ADZUNA_UNRESOLVED_FAILURE_MESSAGE =
  "No confirmed employer-hosted application URL found from Google-first resolution for Adzuna job";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeForSearch(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function normalizeCompanyName(value: string | null | undefined) {
  return tokenizeSimilarityInput(value)
    .filter((token) => !COMPANY_SUFFIXES.has(token))
    .join(" ");
}

function companyAliasMatches(left: string, right: string) {
  return (
    normalizeForSearch(left) === normalizeForSearch(right) ||
    normalizeCompanyName(left) === normalizeCompanyName(right)
  );
}

function buildCompanyAliasVariants(value: string | null | undefined) {
  const normalized = normalizeText(value);
  const normalizedCore = normalizeCompanyName(normalized);
  const baseVariants = dedupeStrings([normalized, normalizedCore]).filter(Boolean);
  const aliasGroup =
    COMPANY_ALIAS_GROUPS.find((group) =>
      group.some(
        (candidate) =>
          companyAliasMatches(candidate, normalized) ||
          companyAliasMatches(candidate, normalizedCore),
      ),
    ) ?? [];

  return dedupeStrings(
    [...baseVariants, ...aliasGroup.map((alias) => normalizeText(alias))].filter(Boolean),
  );
}

function stripTitleNoise(value: string) {
  return normalizeText(value)
    .replace(/\s*\((?:onsite|on[- ]site|hybrid|remote|remote eligible|us only)\)\s*/gi, " ")
    .replace(/\s*[-:]\s*(?:onsite|on[- ]site|hybrid|remote)\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function sanitizeQueryTerm(value: string) {
  return value.replace(/["]+/g, "").trim();
}

function normalizeResolverLocation(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  const primary = normalizeLocationLabel(normalized);
  if (/,\s*[A-Z]{2}$/.test(primary)) {
    return primary;
  }

  const firstSegment = normalized.split(",")[0]?.trim() ?? "";
  if (!firstSegment) {
    return primary;
  }

  const fallback = normalizeLocationLabel(firstSegment);
  return fallback || primary;
}

function extractLocationCity(value: string) {
  return value.split(",")[0]?.trim() ?? "";
}

function buildEmployerHostCandidates(companyAliasVariants: string[]) {
  const seeds = dedupeStrings(
    companyAliasVariants.flatMap((alias) => {
      const normalizedAlias = normalizeCompanyName(alias) || normalizeText(alias);
      const aliasTokens = tokenizeSimilarityInput(normalizedAlias);
      return [
        aliasTokens.join(""),
        aliasTokens[0],
      ].filter(Boolean);
    }),
  ).filter((seed) => seed.length >= 2);

  return dedupeStrings(
    seeds.flatMap((seed) => [
      `jobs.${seed}.com`,
      `careers.${seed}.com`,
      seed.includes(".") ? seed : `${seed}.com`,
    ]),
  ).slice(0, 6);
}

function buildSearchQueries(input: NormalizedResolverInput) {
  const quotedTitle = `"${sanitizeQueryTerm(input.title)}"`;
  const quotedCleanedTitle = `"${sanitizeQueryTerm(input.cleanedTitle || input.title)}"`;
  const quotedCompany = `"${sanitizeQueryTerm(input.company)}"`;
  const locationPart = input.normalizedLocation
    ? ` "${sanitizeQueryTerm(input.normalizedLocation)}"`
    : "";
  const cityPart = input.locationCity
    ? ` "${sanitizeQueryTerm(input.locationCity)}"`
    : "";
  const atsSitesPrimary =
    "site:greenhouse.io OR site:jobs.lever.co OR site:ashbyhq.com OR site:smartrecruiters.com";
  const atsSitesSecondary =
    "site:myworkdayjobs.com OR site:workdayjobs.com OR site:icims.com OR site:bamboohr.com OR site:jobvite.com";

  if (input.googleFirstTriggered) {
    const jobsHost =
      input.employerHostCandidates.find((host) => host.startsWith("jobs.")) ??
      input.employerHostCandidates[0];
    const careersHost =
      input.employerHostCandidates.find((host) => host.startsWith("careers.")) ??
      input.employerHostCandidates.find((host) => host !== jobsHost);

    return dedupeStrings([
      `${quotedCleanedTitle} ${quotedCompany}${locationPart}`,
      input.cleanedTitle !== input.title
        ? `${quotedTitle} ${quotedCompany}${locationPart}`
        : "",
      `${quotedCleanedTitle} ${quotedCompany} careers`,
      jobsHost
        ? `site:${jobsHost} ${quotedCleanedTitle}${cityPart || locationPart}`
        : "",
      careersHost ? `site:${careersHost} ${quotedCleanedTitle}` : "",
      `${quotedCompany} ${quotedCleanedTitle}${cityPart || locationPart}`,
    ]).slice(0, 5);
  }

  return dedupeStrings([
    `${quotedTitle} ${quotedCompany}${locationPart}`,
    `${quotedTitle} ${quotedCompany}${locationPart} apply`,
    `${quotedCompany} ${quotedCleanedTitle} careers`,
    `${quotedCleanedTitle} ${quotedCompany} ${atsSitesPrimary}`,
    `${quotedCleanedTitle} ${quotedCompany} ${atsSitesSecondary}`,
  ]);
}

function detectDirectPageProvider(url: string) {
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

function classifyCurrentUrl(url: string) {
  if (isAggregatorHandoffUrl(url)) return "aggregator_handoff";
  if (isLikelyAtsUrl(url)) return "direct_ats";
  if (isLikelyCompanyCareersUrl(url)) return "company_careers";
  return "unknown";
}

function hasEmployerOwnedHost(url: string, employerHostCandidates: string[]) {
  const host = normalizeHostname(url);
  if (!host) return false;

  return employerHostCandidates.some((candidate) => {
    const normalizedCandidate = candidate.replace(/^www\./, "").toLowerCase();
    return (
      host === normalizedCandidate ||
      host.endsWith(`.${normalizedCandidate}`) ||
      normalizedCandidate.endsWith(`.${host}`)
    );
  });
}

function companyHostBonus(companyCoreTokens: string[], url: string) {
  if (companyCoreTokens.length === 0) return 0;

  const host = normalizeHostname(url);
  const path = (() => {
    try {
      return decodeURIComponent(new URL(normalizeJobUrl(url)).pathname);
    } catch {
      return "";
    }
  })();
  const hostTokens = tokenizeSimilarityInput(`${host.replace(/\./g, " ")} ${path}`);
  return Math.min(0.16, scoreTokenSimilarity(companyCoreTokens, hostTokens) * 0.22);
}

function isUnrelatedHost(url: string) {
  const host = normalizeHostname(url);
  return UNRELATED_HOST_FRAGMENTS.some(
    (fragment) => host === fragment || host.endsWith(`.${fragment}`),
  );
}

function isLikelySearchOrIndexPage(candidateUrl: string, corpus: string) {
  if (
    /search results|browse jobs|related jobs|similar jobs|jobs in |all jobs|open positions/i.test(
      corpus,
    )
  ) {
    return true;
  }

  try {
    const parsed = new URL(candidateUrl);
    return /\/(search|jobs\/search|careers\/search|browse|listings?)\/?$/i.test(
      parsed.pathname,
    );
  } catch {
    return false;
  }
}

function isLikelyLoginOrInterstitialPage(candidateUrl: string, corpus: string) {
  if (
    isAdzunaUnresolvedHandoffUrl(candidateUrl) ||
    /login|log in|signin|sign in|authenticate|interstitial|continue to login/i.test(
      corpus,
    )
  ) {
    return true;
  }

  try {
    const parsed = new URL(candidateUrl);
    return /\/(login|signin|sign-in|authenticate|interstitial|redirect|handoff)/i.test(
      parsed.pathname,
    );
  } catch {
    return false;
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

function buildCandidateCorpus(result: JobSearchResult, resolvedUrl?: string, verifiedTitle?: string) {
  return [
    result.title,
    verifiedTitle,
    result.snippet,
    readUrlText(resolvedUrl ?? result.url),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasReasonPart(
  candidate: Pick<ScoredCandidate, "reasonParts">,
  reason: string,
) {
  return candidate.reasonParts.some(
    (part) => part === reason || part.startsWith(`${reason}:`),
  );
}

function scoreCompanySimilarity(
  input: Pick<
    NormalizedResolverInput,
    "companyTokens" | "companyCoreTokens" | "companyAliasVariants"
  >,
  corpus: string,
) {
  const variantScores = input.companyAliasVariants.flatMap((variant) => {
    const normalizedVariant = normalizeCompanyName(variant);
    return [
      scoreTokenSimilarity(variant, corpus),
      normalizedVariant ? scoreTokenSimilarity(normalizedVariant, corpus) : 0,
    ];
  });

  return Math.max(
    scoreTokenSimilarity(input.companyTokens, corpus),
    scoreTokenSimilarity(input.companyCoreTokens, corpus),
    ...variantScores,
  );
}

function evaluateCandidateAcceptance(
  input: NormalizedResolverInput,
  candidate: ScoredCandidate | undefined,
) {
  if (!candidate) {
    return { accepted: false as const };
  }

  const employerOwnedHost = hasReasonPart(candidate, "employer_owned_host");
  const directDestination =
    isLikelyAtsUrl(candidate.url) ||
    isLikelyCompanyCareersUrl(candidate.url) ||
    hasEmployerOwnedHost(candidate.url, input.employerHostCandidates);
  const hasBlockingPenalty =
    hasReasonPart(candidate, "adzuna_handoff_penalty") ||
    hasReasonPart(candidate, "aggregator_handoff_penalty") ||
    hasReasonPart(candidate, "login_or_interstitial_penalty") ||
    hasReasonPart(candidate, "search_or_index_page_penalty") ||
    hasReasonPart(candidate, "unrelated_domain_penalty");
  const threshold = input.googleFirstTriggered
    ? ADZUNA_GOOGLE_FIRST_THRESHOLD
    : HIGH_CONFIDENCE_THRESHOLD;

  if (
    directDestination &&
    !hasBlockingPenalty &&
    candidate.confidence >= threshold
  ) {
    return {
      accepted: true as const,
      rule: input.googleFirstTriggered
        ? "google_first_confident_direct_candidate"
        : "generic_high_confidence_direct_candidate",
    };
  }

  const hasStrongTitleEvidence =
    hasReasonPart(candidate, "exact_title_match") ||
    hasReasonPart(candidate, "verified_page_title") ||
    candidate.titleSimilarity >= 0.34;
  const hasSufficientCompanyEvidence =
    hasReasonPart(candidate, "company_match") ||
    hasReasonPart(candidate, "company_alias_match") ||
    hasReasonPart(candidate, "company_host_match") ||
    employerOwnedHost ||
    candidate.companySimilarity >= 0.12;
  const looksLikeJobDetailPage =
    hasReasonPart(candidate, "job_like_path") ||
    candidate.jobPathBonus > 0;

  if (
    input.googleFirstTriggered &&
    directDestination &&
    !hasBlockingPenalty &&
    employerOwnedHost &&
    looksLikeJobDetailPage &&
    hasStrongTitleEvidence &&
    hasSufficientCompanyEvidence
  ) {
    return {
      accepted: true as const,
      rule: "google_first_employer_owned_direct_job_page",
    };
  }

  return { accepted: false as const };
}

function scoreCandidate(
  input: NormalizedResolverInput,
  result: JobSearchResult,
  overrides?: {
    resolvedUrl?: string;
    verifiedTitle?: string;
    verifiedSnippet?: string;
    verificationBoost?: number;
    verificationPenalty?: number;
  },
): ScoredCandidate {
  const candidateUrl = normalizeJobUrl(overrides?.resolvedUrl ?? result.url);
  const provider = detectDirectPageProvider(candidateUrl);
  const corpus = [
    buildCandidateCorpus(result, candidateUrl, overrides?.verifiedTitle),
    overrides?.verifiedSnippet,
  ]
    .filter(Boolean)
    .join(" ");
  const corpusLower = corpus.toLowerCase();
  const normalizedPrimaryTitle = normalizeForSearch(input.cleanedTitle || input.title);
  const normalizedOriginalTitle = normalizeForSearch(input.title);
  const exactTitleMatched =
    Boolean(normalizedPrimaryTitle && corpusLower.includes(normalizedPrimaryTitle)) ||
    Boolean(normalizedOriginalTitle && corpusLower.includes(normalizedOriginalTitle));
  const verifiedPageTitleMatched =
    Boolean(overrides?.verifiedTitle) &&
    scoreTokenSimilarity(input.titleTokens, overrides?.verifiedTitle) >= 0.3;
  const titleSimilarity = scoreTokenSimilarity(input.titleTokens, corpus);
  const companySimilarity = scoreCompanySimilarity(input, corpus);
  const locationSimilarity =
    input.locationTokens.length > 0
      ? scoreTokenSimilarity(input.locationTokens, corpus)
      : 0;
  const preferredHostBonus =
    provider && provider !== "company_careers"
      ? 0.18
      : provider === "company_careers"
        ? 0.12
        : 0;
  const companyHostMatchBonus = companyHostBonus(input.companyCoreTokens, candidateUrl);
  const matchedEmployerOwnedHost = hasEmployerOwnedHost(
    candidateUrl,
    input.employerHostCandidates,
  );
  const employerOwnedHostBonus = matchedEmployerOwnedHost ? 0.22 : 0;
  const jobPathBonus =
    /\/(job|jobs|position|positions|opening|openings|opportunit|career|careers)/i.test(
      candidateUrl,
    )
      ? 0.06
      : 0;
  const exactTitleBonus = exactTitleMatched ? 0.12 : 0;
  const companyAliasMatched = input.companyAliasVariants.some((variant) => {
    const normalizedVariant = normalizeForSearch(variant);
    const normalizedCoreVariant = normalizeForSearch(normalizeCompanyName(variant));
    return (
      Boolean(normalizedVariant && corpusLower.includes(normalizedVariant)) ||
      Boolean(normalizedCoreVariant && corpusLower.includes(normalizedCoreVariant))
    );
  });

  let penalty = 0;
  const reasonParts: string[] = [];

  if (provider) {
    reasonParts.push(`provider:${provider}`);
  }

  if (titleSimilarity > 0.45) {
    reasonParts.push(`title_match:${titleSimilarity.toFixed(2)}`);
  } else if (!exactTitleMatched && !verifiedPageTitleMatched && titleSimilarity < 0.2) {
    penalty += 0.14;
    reasonParts.push("weak_title_match");
  }

  if (companySimilarity > 0.3) {
    reasonParts.push(`company_match:${companySimilarity.toFixed(2)}`);
  } else if (companyAliasMatched) {
    reasonParts.push("company_alias_match");
  } else if (
    companySimilarity < 0.15 &&
    !matchedEmployerOwnedHost &&
    companyHostMatchBonus <= 0.05
  ) {
    penalty += 0.12;
    reasonParts.push("weak_company_match");
  }

  if (input.locationTokens.length > 0) {
    if (locationSimilarity > 0.25) {
      reasonParts.push(`location_match:${locationSimilarity.toFixed(2)}`);
    } else if (!provider && !matchedEmployerOwnedHost) {
      penalty += 0.04;
      reasonParts.push("weak_location_match");
    }
  }

  if (preferredHostBonus > 0) {
    reasonParts.push("preferred_direct_host");
  }

  if (employerOwnedHostBonus > 0) {
    reasonParts.push("employer_owned_host");
  }

  if (companyHostMatchBonus > 0.05) {
    reasonParts.push("company_host_match");
  }

  if (jobPathBonus > 0) {
    reasonParts.push("job_like_path");
  }

  if (exactTitleBonus > 0) {
    reasonParts.push("exact_title_match");
  }

  if (isAdzunaUnresolvedHandoffUrl(candidateUrl)) {
    penalty += 0.68;
    reasonParts.push("adzuna_handoff_penalty");
  } else if (isAggregatorHandoffUrl(candidateUrl)) {
    penalty += 0.48;
    reasonParts.push("aggregator_handoff_penalty");
  } else if (!isLikelyAtsUrl(candidateUrl) && !isLikelyCompanyCareersUrl(candidateUrl)) {
    penalty += 0.16;
    reasonParts.push("not_direct_job_page_penalty");
  }

  if (isLikelySearchOrIndexPage(candidateUrl, corpus)) {
    penalty += 0.2;
    reasonParts.push("search_or_index_page_penalty");
  }

  if (isLikelyLoginOrInterstitialPage(candidateUrl, corpus)) {
    penalty += 0.42;
    reasonParts.push("login_or_interstitial_penalty");
  }

  if (isUnrelatedHost(candidateUrl)) {
    penalty += 0.28;
    reasonParts.push("unrelated_domain_penalty");
  }

  penalty += overrides?.verificationPenalty ?? 0;

  let confidence =
    titleSimilarity * 0.48 +
    companySimilarity * 0.24 +
    locationSimilarity * 0.08 +
    preferredHostBonus +
    employerOwnedHostBonus +
    companyHostMatchBonus +
    exactTitleBonus +
    jobPathBonus -
    penalty;

  confidence += overrides?.verificationBoost ?? 0;
  confidence = Math.max(0, Math.min(0.99, confidence));

  if (verifiedPageTitleMatched) {
    reasonParts.push("verified_page_title");
  }

  return {
    url: candidateUrl,
    title: overrides?.verifiedTitle ?? result.title,
    provider,
    confidence,
    reason: reasonParts.join("; ") || "candidate_scored",
    reasonParts,
    snippet: result.snippet,
    titleSimilarity,
    companySimilarity,
    locationSimilarity,
    preferredHostBonus,
    companyHostBonus: companyHostMatchBonus,
    jobPathBonus,
    penalty,
  };
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeoutId);
    },
  };
}

function extractHtmlTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return undefined;

  return titleMatch[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined;
}

function extractHtmlTextSnippet(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1600);
}

async function verifyCandidate(
  input: NormalizedResolverInput,
  candidate: JobSearchResult,
): Promise<ScoredCandidate> {
  const timeout = createTimeoutSignal(FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(candidate.url, {
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      redirect: "follow",
      signal: timeout.signal,
    });

    const finalUrl = normalizeJobUrl(response.url || candidate.url);
    const contentType = response.headers.get("content-type") ?? "";
    const html = contentType.includes("text/html")
      ? await response.text().catch(() => "")
      : "";
    const verifiedTitle = extractHtmlTitle(html);
    const verifiedSnippet = extractHtmlTextSnippet(html);
    const applyUiDetected =
      /apply now|apply for this job|continue application|submit application|upload resume|start application/i.test(
        verifiedSnippet,
      );
    const jobDetailContentDetected =
      /job description|responsibilities|qualifications|requisition|job id|job requisition|about the role/i.test(
        verifiedSnippet,
      );

    return scoreCandidate(input, candidate, {
      resolvedUrl: finalUrl,
      verifiedTitle,
      verifiedSnippet,
      verificationBoost:
        (response.ok ? 0.06 : 0) +
        (applyUiDetected ? 0.08 : 0) +
        (jobDetailContentDetected ? 0.04 : 0),
      verificationPenalty:
        response.ok || contentType.includes("text/html") ? 0 : 0.08,
    });
  } catch (error) {
    const scored = scoreCandidate(input, candidate, {
      verificationPenalty: 0.06,
    });
    return {
      ...scored,
      reason: `${scored.reason}; verification_fetch_failed:${
        error instanceof Error ? error.message : String(error)
      }`,
      reasonParts: [
        ...scored.reasonParts,
        `verification_fetch_failed:${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  } finally {
    timeout.clear();
  }
}

function toCandidateEvidence(candidate: ScoredCandidate) {
  return {
    url: candidate.url,
    title: candidate.title,
    provider: candidate.provider,
    confidence: Number(candidate.confidence.toFixed(3)),
    reason: candidate.reason,
  };
}

function buildNormalizedInput(args: {
  title: string;
  company: string;
  location?: string | null;
  currentUrl?: string | null;
  source?: string | null;
}): NormalizedResolverInput {
  const title = normalizeText(args.title);
  const company = normalizeText(args.company);
  const companyAliasVariants = buildCompanyAliasVariants(company);
  const location = normalizeText(args.location);
  const normalizedLocation = normalizeResolverLocation(location);
  const locationCity = extractLocationCity(normalizedLocation || location);
  const currentUrl = normalizeJobUrl(args.currentUrl ?? "");
  const source = normalizeForSearch(args.source);
  const cleanedTitle = stripTitleNoise(title) || title;
  const titleTokens = dedupeStrings([
    ...tokenizeSimilarityInput(title),
    ...tokenizeSimilarityInput(cleanedTitle),
  ]);
  const companyTokens = dedupeStrings(
    companyAliasVariants.flatMap((variant) => tokenizeSimilarityInput(variant)),
  );
  const companyCoreTokens = dedupeStrings(
    companyAliasVariants.flatMap((variant) =>
      tokenizeSimilarityInput(normalizeCompanyName(variant)),
    ),
  );
  const locationTokens = tokenizeSimilarityInput(normalizedLocation || location);
  const adzunaHandoffDetected =
    isAdzunaUnresolvedHandoffUrl(currentUrl) || source.includes("adzuna");
  const googleFirstTriggered = adzunaHandoffDetected;
  const employerHostCandidates = buildEmployerHostCandidates(
    companyAliasVariants,
  );

  return {
    title,
    cleanedTitle,
    company,
    companyAliasVariants,
    location,
    normalizedLocation,
    locationCity,
    currentUrl,
    source,
    titleTokens,
    companyTokens,
    companyCoreTokens: companyCoreTokens.length > 0 ? companyCoreTokens : companyTokens,
    locationTokens,
    employerHostCandidates,
    adzunaHandoffDetected,
    googleFirstTriggered,
  };
}

function buildCurrentUrlResolution(input: NormalizedResolverInput): DirectJobResolution | null {
  if (!input.currentUrl) {
    return null;
  }

  const currentUrlKind = classifyCurrentUrl(input.currentUrl);
  if (currentUrlKind === "aggregator_handoff" || currentUrlKind === "unknown") {
    return null;
  }

  const provider = detectDirectPageProvider(input.currentUrl);
  const matchReason =
    currentUrlKind === "direct_ats"
      ? "Current job URL already looks like a direct ATS application page."
      : "Current job URL already looks like a direct company careers page.";

  return {
    ok: true,
    resolvedUrl: input.currentUrl,
    confidence: 0.95,
    provider,
    matchReason,
    googleFirstTriggered: input.googleFirstTriggered,
    queries: [],
    normalizedLocation: input.normalizedLocation || undefined,
    adzunaStrategyReplaySkipped: input.googleFirstTriggered,
    candidates: [
      {
        url: input.currentUrl,
        provider,
        confidence: 0.95,
        reason: matchReason,
      },
    ],
  };
}

export async function resolveDirectJobUrl(args: {
  title: string;
  company: string;
  location?: string | null;
  currentUrl?: string | null;
  source?: string | null;
}): Promise<DirectJobResolution> {
  const input = buildNormalizedInput(args);

  if (!input.title || !input.company) {
    return {
      ok: false,
      error: "Direct resolver requires both title and company.",
      candidates: [],
    };
  }

  const currentUrlResolution = buildCurrentUrlResolution(input);
  if (currentUrlResolution) {
    return currentUrlResolution;
  }

  const queries = buildSearchQueries(input);
  const preferredSearchProvider = input.googleFirstTriggered
    ? "google_first"
    : undefined;
  const searchProvider = resolveJobSearchProvider({
    preferredProvider: preferredSearchProvider,
  });

  console.log("[DIRECT_JOB_RESOLVER] search start", {
    title: input.title,
    cleanedTitle: input.cleanedTitle,
    company: input.company,
    location: input.location || null,
    normalizedLocation: input.normalizedLocation || null,
    locationCity: input.locationCity || null,
    currentUrl: input.currentUrl || null,
    source: input.source || null,
    adzunaHandoffDetected: input.adzunaHandoffDetected,
    googleFirstTriggered: input.googleFirstTriggered,
    employerHostCandidates: input.employerHostCandidates,
    searchProvider,
    queries,
    queryCount: queries.length,
  });

  const searchResults = dedupeJobSearchResults(
    await searchJobPages({
      queries,
      limit: 16,
      preferredProvider: preferredSearchProvider,
    }),
  );

  if (searchResults.length === 0) {
    return {
      ok: false,
      googleFirstTriggered: input.googleFirstTriggered,
      queries,
      normalizedLocation: input.normalizedLocation || undefined,
      searchProvider: String(searchProvider),
      adzunaStrategyReplaySkipped: input.googleFirstTriggered,
      error: input.adzunaHandoffDetected
        ? ADZUNA_UNRESOLVED_FAILURE_MESSAGE
        : "No search results returned by the configured job search provider.",
      candidates: [],
    };
  }

  const preliminaryCandidates = searchResults
    .map((result) => scoreCandidate(input, result))
    .filter((candidate) => candidate.confidence >= MIN_CANDIDATE_THRESHOLD)
    .sort((left, right) => right.confidence - left.confidence);

  const candidatesToVerify = preliminaryCandidates
    .slice(0, MAX_VERIFIED_CANDIDATES)
    .map((candidate) => ({
      title: candidate.title ?? "",
      url: candidate.url,
      snippet: candidate.snippet,
      source: candidate.provider,
    }));

  const verifiedCandidates = await Promise.all(
    candidatesToVerify.map((candidate) => verifyCandidate(input, candidate)),
  );

  const scoredCandidates = (verifiedCandidates.length > 0
    ? verifiedCandidates
    : preliminaryCandidates
  )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_VERIFIED_CANDIDATES);

  const bestCandidate = scoredCandidates[0];
  const acceptance = evaluateCandidateAcceptance(input, bestCandidate);

  console.log("[DIRECT_JOB_RESOLVER] scored candidates", {
    title: input.title,
    company: input.company,
    normalizedLocation: input.normalizedLocation || null,
    currentUrl: input.currentUrl || null,
    adzunaHandoffDetected: input.adzunaHandoffDetected,
    googleFirstTriggered: input.googleFirstTriggered,
    searchProvider,
    acceptanceRule: acceptance.accepted ? acceptance.rule : null,
    topCandidates: scoredCandidates.map((candidate) => ({
      url: candidate.url,
      provider: candidate.provider ?? null,
      confidence: Number(candidate.confidence.toFixed(3)),
      reason: candidate.reason,
    })),
  });

  if (bestCandidate && acceptance.accepted) {
    const matchReason = `${acceptance.rule}: ${bestCandidate.reason}`;

    console.log("[DIRECT_JOB_RESOLVER] selected direct url", {
      resolvedDirectUrl: bestCandidate.url,
      confidence: Number(bestCandidate.confidence.toFixed(3)),
      provider: bestCandidate.provider ?? null,
      acceptanceRule: acceptance.rule,
      reason: bestCandidate.reason,
      adzunaHandoffDetected: input.adzunaHandoffDetected,
      googleFirstTriggered: input.googleFirstTriggered,
      searchProvider,
    });

    return {
      ok: true,
      resolvedUrl: bestCandidate.url,
      confidence: Number(bestCandidate.confidence.toFixed(3)),
      provider: bestCandidate.provider,
      matchReason,
      acceptanceRule: acceptance.rule,
      googleFirstTriggered: input.googleFirstTriggered,
      queries,
      normalizedLocation: input.normalizedLocation || undefined,
      searchProvider: String(searchProvider),
      adzunaStrategyReplaySkipped: input.googleFirstTriggered,
      candidates: scoredCandidates.map(toCandidateEvidence),
    };
  }

  return {
    ok: false,
    googleFirstTriggered: input.googleFirstTriggered,
    queries,
    normalizedLocation: input.normalizedLocation || undefined,
    searchProvider: String(searchProvider),
    adzunaStrategyReplaySkipped: input.googleFirstTriggered,
    confidence: bestCandidate
      ? Number(bestCandidate.confidence.toFixed(3))
      : undefined,
    provider: bestCandidate?.provider,
    matchReason: bestCandidate?.reason,
    candidates: scoredCandidates.map(toCandidateEvidence),
    error: input.adzunaHandoffDetected
      ? ADZUNA_UNRESOLVED_FAILURE_MESSAGE
      : "Could not verify a high-confidence direct employer or ATS application page.",
  };
}
