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

export type DirectJobResolution = {
  ok: boolean;
  resolvedUrl?: string;
  confidence?: number;
  provider?: string;
  matchReason?: string;
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
  company: string;
  location: string;
  currentUrl: string;
  source: string;
  titleTokens: string[];
  companyTokens: string[];
  companyCoreTokens: string[];
  locationTokens: string[];
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
const MIN_CANDIDATE_THRESHOLD = 0.28;
const MAX_VERIFIED_CANDIDATES = 5;
const FETCH_TIMEOUT_MS = 8_000;

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

function buildSearchQueries(input: NormalizedResolverInput) {
  const quotedTitle = `"${sanitizeQueryTerm(input.title)}"`;
  const quotedCompany = `"${sanitizeQueryTerm(input.company)}"`;
  const locationPart = input.location ? ` ${sanitizeQueryTerm(input.location)}` : "";
  const atsSitesPrimary =
    "site:greenhouse.io OR site:jobs.lever.co OR site:ashbyhq.com OR site:smartrecruiters.com";
  const atsSitesSecondary =
    "site:myworkdayjobs.com OR site:workdayjobs.com OR site:icims.com OR site:bamboohr.com OR site:jobvite.com";

  return dedupeStrings([
    `${quotedTitle} ${quotedCompany}${locationPart}`,
    `${quotedTitle} ${quotedCompany}${locationPart} apply`,
    `${quotedCompany} ${quotedTitle} careers`,
    `${quotedTitle} ${quotedCompany} ${atsSitesPrimary}`,
    `${quotedTitle} ${quotedCompany} ${atsSitesSecondary}`,
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

function scoreCandidate(
  input: NormalizedResolverInput,
  result: JobSearchResult,
  overrides?: {
    resolvedUrl?: string;
    verifiedTitle?: string;
    verificationBoost?: number;
    verificationPenalty?: number;
  },
): ScoredCandidate {
  const candidateUrl = normalizeJobUrl(overrides?.resolvedUrl ?? result.url);
  const provider = detectDirectPageProvider(candidateUrl);
  const corpus = buildCandidateCorpus(result, candidateUrl, overrides?.verifiedTitle);
  const titleSimilarity = scoreTokenSimilarity(input.titleTokens, corpus);
  const companySimilarity = Math.max(
    scoreTokenSimilarity(input.companyTokens, corpus),
    scoreTokenSimilarity(input.companyCoreTokens, corpus),
  );
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
  const jobPathBonus =
    /\/(job|jobs|position|positions|opening|openings|opportunit|career|careers)/i.test(
      candidateUrl,
    )
      ? 0.06
      : 0;

  let penalty = 0;
  const reasonParts: string[] = [];

  if (provider) {
    reasonParts.push(`provider:${provider}`);
  }

  if (titleSimilarity > 0.45) {
    reasonParts.push(`title_match:${titleSimilarity.toFixed(2)}`);
  } else if (titleSimilarity < 0.2) {
    penalty += 0.14;
    reasonParts.push("weak_title_match");
  }

  if (companySimilarity > 0.3) {
    reasonParts.push(`company_match:${companySimilarity.toFixed(2)}`);
  } else if (companySimilarity < 0.15) {
    penalty += 0.12;
    reasonParts.push("weak_company_match");
  }

  if (input.locationTokens.length > 0) {
    if (locationSimilarity > 0.25) {
      reasonParts.push(`location_match:${locationSimilarity.toFixed(2)}`);
    } else if (!provider) {
      penalty += 0.04;
      reasonParts.push("weak_location_match");
    }
  }

  if (preferredHostBonus > 0) {
    reasonParts.push("preferred_direct_host");
  }

  if (companyHostMatchBonus > 0.05) {
    reasonParts.push("company_host_match");
  }

  if (jobPathBonus > 0) {
    reasonParts.push("job_like_path");
  }

  if (isAggregatorHandoffUrl(candidateUrl)) {
    penalty += 0.48;
    reasonParts.push("aggregator_handoff_penalty");
  } else if (!isLikelyAtsUrl(candidateUrl) && !isLikelyCompanyCareersUrl(candidateUrl)) {
    penalty += 0.16;
    reasonParts.push("not_direct_job_page_penalty");
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
    companyHostMatchBonus +
    jobPathBonus -
    penalty;

  confidence += overrides?.verificationBoost ?? 0;
  confidence = Math.max(0, Math.min(0.99, confidence));

  if (overrides?.verifiedTitle) {
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

    return scoreCandidate(input, candidate, {
      resolvedUrl: finalUrl,
      verifiedTitle,
      verificationBoost: response.ok ? 0.06 : 0,
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
  const location = normalizeText(args.location);
  const currentUrl = normalizeJobUrl(args.currentUrl ?? "");
  const source = normalizeForSearch(args.source);
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

  console.log("[DIRECT_JOB_RESOLVER] search start", {
    title: input.title,
    company: input.company,
    location: input.location || null,
    currentUrl: input.currentUrl || null,
    source: input.source || null,
    queryCount: queries.length,
  });

  const searchResults = dedupeJobSearchResults(
    await searchJobPages({
      queries,
      limit: 16,
    }),
  );

  if (searchResults.length === 0) {
    return {
      ok: false,
      error: "No search results returned by the configured job search provider.",
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

  console.log("[DIRECT_JOB_RESOLVER] scored candidates", {
    title: input.title,
    company: input.company,
    currentUrl: input.currentUrl || null,
    topCandidates: scoredCandidates.map((candidate) => ({
      url: candidate.url,
      provider: candidate.provider ?? null,
      confidence: Number(candidate.confidence.toFixed(3)),
      reason: candidate.reason,
    })),
  });

  if (
    bestCandidate &&
    bestCandidate.confidence >= HIGH_CONFIDENCE_THRESHOLD &&
    !isAggregatorHandoffUrl(bestCandidate.url) &&
    (isLikelyAtsUrl(bestCandidate.url) || isLikelyCompanyCareersUrl(bestCandidate.url))
  ) {
    return {
      ok: true,
      resolvedUrl: bestCandidate.url,
      confidence: Number(bestCandidate.confidence.toFixed(3)),
      provider: bestCandidate.provider,
      matchReason: bestCandidate.reason,
      candidates: scoredCandidates.map(toCandidateEvidence),
    };
  }

  return {
    ok: false,
    confidence: bestCandidate
      ? Number(bestCandidate.confidence.toFixed(3))
      : undefined,
    provider: bestCandidate?.provider,
    matchReason: bestCandidate?.reason,
    candidates: scoredCandidates.map(toCandidateEvidence),
    error:
      "Could not verify a high-confidence direct employer or ATS application page.",
  };
}
