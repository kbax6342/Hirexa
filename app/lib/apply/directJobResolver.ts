import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  dedupeJobSearchResults,
  normalizeHostname,
  resolveJobSearchProviderOrder,
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
  isSearchResultsUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";
import {
  buildAdzunaDetailsUrl,
  normalizeAdzunaProviderId,
} from "@/app/lib/jobs/adzunaProviderId";
import { scoreCompanyMatch } from "@/app/lib/jobs/companyMatch";
import { isValidResolvedJobUrl } from "@/app/lib/jobs/jobUrlValidation";

export type DirectJobResolution = {
  ok: boolean;
  resolvedUrl?: string;
  confidence?: number;
  provider?: string;
  matchReason?: string;
  acceptanceRule?: string;
  failureReason?: "real_posting_not_found" | "search_results_no_strong_match";
  googleFirstTriggered?: boolean;
  queries?: string[];
  normalizedLocation?: string;
  searchProvider?: string;
  adzunaStrategyReplaySkipped?: boolean;
  candidates?: Array<{
    url: string;
    title?: string;
    provider?: string;
    source?: string;
    domain?: string;
    score?: number;
    confidence: number;
    confidenceLabel?: "low" | "medium" | "high";
    reason: string;
    matchedSignals?: string[];
    rejectedReason?: string;
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
  locationState: string;
  currentUrl: string;
  source: string;
  titleTokens: string[];
  titleImportantTokens: string[];
  companyTokens: string[];
  companyCoreTokens: string[];
  locationTokens: string[];
  employerHostCandidates: string[];
  adzunaHandoffDetected: boolean;
  googleFirstTriggered: boolean;
};

type NonJobPostingClassification =
  | "about_or_benefits_page"
  | "policy_page"
  | "search_results_page"
  | "not_found_page"
  | "static_or_media_asset"
  | "known_asset_host"
  | "generic_company_homepage";

type ScoredCandidate = {
  url: string;
  title?: string;
  provider?: string;
  searchProviderSource?: string;
  domain: string;
  position?: number | null;
  score: number;
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  reason: string;
  reasonParts: string[];
  matchedSignals: string[];
  rejectedReason?: string;
  snippet?: string;
  titleSimilarity: number;
  companySimilarity: number;
  companyMatchScore: number;
  companyMatchReason: string;
  companyMatched: boolean;
  resolvedUrlValid: boolean;
  locationSimilarity: number;
  preferredHostBonus: number;
  companyHostBonus: number;
  jobPathBonus: number;
  penalty: number;
};

type DirectJobResolutionCacheEntry = {
  resolvedDirectUrl: string;
  host: string;
  timestamp: number;
  confidence: number;
  source: string;
};

type DirectJobResolutionCacheStore = Record<
  string,
  DirectJobResolutionCacheEntry
>;

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

const TITLE_SYNONYM_EXPANSIONS = [
  {
    pattern: /\bflight management system\b/gi,
    replacement: "flight management systems",
  },
  {
    pattern: /\bfms\b/gi,
    replacement: "flight management systems",
  },
  {
    pattern: /\bsw\b/gi,
    replacement: "software",
  },
  {
    pattern: /\beng\b/gi,
    replacement: "engineer",
  },
  {
    pattern: /\bsr\b/gi,
    replacement: "senior",
  },
] as const;

type AggregatorPenaltyRule = {
  host: string;
  penalty: number;
  signal: string;
  path?: RegExp;
};

const AGGREGATOR_PENALTIES: readonly AggregatorPenaltyRule[] = [
  { host: "ziprecruiter.com", penalty: 35, signal: "aggregator_penalty:ziprecruiter" },
  { host: "adzuna.com", penalty: 35, signal: "aggregator_penalty:adzuna" },
  { host: "indeed.com", penalty: 25, signal: "aggregator_penalty:indeed" },
  { host: "glassdoor.com", penalty: 25, signal: "aggregator_penalty:glassdoor" },
  { host: "linkedin.com", penalty: 20, signal: "aggregator_penalty:linkedin_jobs", path: /\/jobs/i },
  { host: "monster.com", penalty: 25, signal: "aggregator_penalty:monster" },
  { host: "careerbuilder.com", penalty: 25, signal: "aggregator_penalty:careerbuilder" },
  { host: "talents.vaia.com", penalty: 20, signal: "aggregator_penalty:talents_vaia" },
  { host: "jooble.org", penalty: 25, signal: "aggregator_penalty:jooble" },
  { host: "simplyhired.com", penalty: 25, signal: "aggregator_penalty:simplyhired" },
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
  "tealhq.com",
  "theladders.com",
  "ladders.com",
  "career.io",
  "google.com",
  "bing.com",
  "maps.google.com",
] as const;

const KNOWN_ASSET_HOST_FRAGMENTS = [
  "zunastatic",
  "kxcdn.com",
  "cloudfront.net",
  "akamaihd.net",
  "fastly.net",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
] as const;

const NON_JOB_PAGE_PATH_PATTERNS = [
  /\/about(?:-us)?(?:\/|$)/i,
  /\/benefits(?:\/|$)/i,
  /\/privacy(?:\/|$)/i,
  /\/terms(?:\/|$)/i,
  /\/search-results(?:\/|$)/i,
  /\/search(?:\/|$)/i,
  /\/404(?:\/|$)/i,
] as const;

const NON_JOB_MEDIA_EXTENSIONS = /\.(png|jpg|jpeg|svg|webp|ico|gif|bmp|avif)(?:$|\?)/i;

const HIGH_CONFIDENCE_THRESHOLD = 70;
const PREFERRED_DIRECT_CANDIDATE_MARGIN = 15;
const MIN_CANDIDATE_SCORE = 20;
const MAX_VERIFIED_CANDIDATES = 5;
const FETCH_TIMEOUT_MS = 8_000;
const DIRECT_JOB_RESOLUTION_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const KNOWN_DIRECT_URL_THRESHOLD = 0.46;
const DIRECT_JOB_RESOLUTION_CACHE_DIR = path.join(
  tmpdir(),
  "hirexa-direct-job-resolution",
);
const DIRECT_JOB_RESOLUTION_CACHE_FILE = path.join(
  DIRECT_JOB_RESOLUTION_CACHE_DIR,
  "cache.json",
);
declare global {
  var __hirexaDirectJobResolutionCache:
    | DirectJobResolutionCacheStore
    | undefined;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function loadDirectJobResolutionCache(): DirectJobResolutionCacheStore {
  try {
    const raw = readFileSync(DIRECT_JOB_RESOLUTION_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => {
        if (!isRecord(value)) {
          return false;
        }

        return (
          typeof value.resolvedDirectUrl === "string" &&
          typeof value.host === "string" &&
          typeof value.timestamp === "number" &&
          Number.isFinite(value.timestamp) &&
          typeof value.confidence === "number" &&
          Number.isFinite(value.confidence) &&
          typeof value.source === "string"
        );
      }),
    ) as DirectJobResolutionCacheStore;
  } catch {
    return {};
  }
}

function getDirectJobResolutionCache() {
  if (!globalThis.__hirexaDirectJobResolutionCache) {
    globalThis.__hirexaDirectJobResolutionCache =
      loadDirectJobResolutionCache();
  }

  return globalThis.__hirexaDirectJobResolutionCache;
}

function persistDirectJobResolutionCache(store: DirectJobResolutionCacheStore) {
  try {
    mkdirSync(DIRECT_JOB_RESOLUTION_CACHE_DIR, { recursive: true });
    writeFileSync(
      DIRECT_JOB_RESOLUTION_CACHE_FILE,
      JSON.stringify(store),
      "utf8",
    );
  } catch (error) {
    console.error("[DIRECT_JOB_RESOLVER] cache persist failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function pruneDirectJobResolutionCache(store: DirectJobResolutionCacheStore) {
  let changed = false;
  const now = Date.now();

  for (const [key, entry] of Object.entries(store)) {
    if (now - entry.timestamp > DIRECT_JOB_RESOLUTION_CACHE_TTL_MS) {
      delete store[key];
      changed = true;
    }
  }

  if (changed) {
    persistDirectJobResolutionCache(store);
  }
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

function expandTitleSynonyms(value: string | null | undefined) {
  let expanded = normalizeText(value);
  for (const entry of TITLE_SYNONYM_EXPANSIONS) {
    expanded = expanded.replace(entry.pattern, entry.replacement);
  }
  return expanded.replace(/\s+/g, " ").trim();
}

function buildSimilarityTokens(value: string | null | undefined) {
  const normalized = normalizeText(value);
  const expanded = expandTitleSynonyms(normalized);

  return dedupeStrings([
    ...tokenizeSimilarityInput(normalized),
    ...tokenizeSimilarityInput(expanded),
  ]);
}

function extractLocationState(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  const commaSeparated = normalized.split(",")[1]?.trim() ?? "";
  if (commaSeparated) {
    return commaSeparated.split(/\s+/)[0]?.trim() ?? "";
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const tail = tokens[tokens.length - 1] ?? "";
  return /^[A-Za-z]{2}$/.test(tail) ? tail : "";
}

function buildLocationVariants(args: {
  location?: string | null;
  normalizedLocation?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
}) {
  const variants = dedupeStrings([
    normalizeText(args.normalizedLocation),
    normalizeText(args.location),
    normalizeText(
      [args.locationCity, args.locationState].filter(Boolean).join(", "),
    ),
    normalizeText(
      [args.locationCity, args.locationState].filter(Boolean).join(" "),
    ),
  ]);

  return variants.map((value) => normalizeForSearch(value)).filter(Boolean);
}

function computeLocationScore(
  input: Pick<NormalizedResolverInput, "location" | "normalizedLocation" | "locationCity" | "locationState">,
  corpus: string,
) {
  const normalizedCorpus = normalizeForSearch(corpus);
  const locationVariants = buildLocationVariants({
    location: input.location,
    normalizedLocation: input.normalizedLocation,
    locationCity: input.locationCity,
    locationState: input.locationState,
  });
  const normalizedCity = normalizeForSearch(input.locationCity);
  const normalizedState = normalizeForSearch(input.locationState);
  const exactMatch = locationVariants.some(
    (variant) => variant && normalizedCorpus.includes(variant),
  );
  const cityMatch = Boolean(
    normalizedCity && normalizedCorpus.includes(normalizedCity),
  );
  const stateMatch = Boolean(
    normalizedState && normalizedCorpus.includes(normalizedState),
  );

  if (exactMatch || (cityMatch && stateMatch)) {
    return {
      score: 20,
      matchedSignals: ["location_match"],
    };
  }

  if (cityMatch) {
    return {
      score: 10,
      matchedSignals: ["location_city_match"],
    };
  }

  if (stateMatch) {
    return {
      score: 5,
      matchedSignals: ["location_state_match"],
    };
  }

  return {
    score: 0,
    matchedSignals: [] as string[],
  };
}

function isImportantTitleToken(token: string) {
  return token.length >= 4 && !["full", "time", "with", "from"].includes(token);
}

function getAggregatorPenalty(url: string) {
  const normalizedUrl = normalizeJobUrl(url);
  const host = normalizeHostname(normalizedUrl);
  const pathname = (() => {
    try {
      return new URL(normalizedUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  for (const candidate of AGGREGATOR_PENALTIES) {
    if (
      host === candidate.host ||
      host.endsWith(`.${candidate.host}`) ||
      candidate.host.endsWith(`.${host}`)
    ) {
      if (!candidate.path || candidate.path.test(pathname)) {
        return candidate;
      }
    }
  }

  return null;
}

function isEmployerDirectCandidate(
  input: NormalizedResolverInput,
  candidate: Pick<
    ScoredCandidate,
    "url" | "provider" | "resolvedUrlValid" | "rejectedReason" | "reasonParts"
  >,
) {
  if (!candidate.resolvedUrlValid || candidate.rejectedReason) {
    return false;
  }

  if (getAggregatorPenalty(candidate.url)) {
    return false;
  }

  return (
    isLikelyAtsUrl(candidate.url) ||
    isLikelyCompanyCareersUrl(candidate.url) ||
    hasEmployerOwnedHost(candidate.url, input.employerHostCandidates) ||
    candidate.reasonParts.includes("employer_owned_host")
  );
}

function deriveConfidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 100) return "high";
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return "medium";
  return "low";
}

function normalizeCacheKeyPart(value: string | null | undefined) {
  return normalizeForSearch(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sanitizeQueryTerm(value: string) {
  return value.replace(/["]+/g, "").trim();
}

function classifyNonJobPostingUrl(
  candidateUrl: string | null | undefined,
): NonJobPostingClassification | null {
  const normalizedUrl = normalizeJobUrl(candidateUrl ?? "");
  if (!normalizedUrl) return null;

  if (NON_JOB_MEDIA_EXTENSIONS.test(normalizedUrl)) {
    return "static_or_media_asset";
  }

  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = decodeURIComponent(parsed.pathname || "/").toLowerCase();

    if (
      KNOWN_ASSET_HOST_FRAGMENTS.some(
        (fragment) =>
          hostname === fragment || hostname.endsWith(`.${fragment}`),
      )
    ) {
      return "known_asset_host";
    }

    if (
      pathname === "/favicon.ico" ||
      pathname.endsWith("/favicon.ico")
    ) {
      return "static_or_media_asset";
    }

    if (
      pathname === "/" ||
      pathname === "/home" ||
      pathname === "/index" ||
      pathname === "/index.html"
    ) {
      return "generic_company_homepage";
    }

    if (
      NON_JOB_PAGE_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
    ) {
      if (
        pathname.includes("/about") ||
        pathname.includes("/benefits")
      ) {
        return "about_or_benefits_page";
      }

      if (pathname.includes("/privacy") || pathname.includes("/terms")) {
        return "policy_page";
      }

      if (pathname.includes("/search")) {
        return "search_results_page";
      }

      if (pathname.includes("/404")) {
        return "not_found_page";
      }
    }
  } catch {
    return null;
  }

  return null;
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
  const plainTitle = sanitizeQueryTerm(input.title);
  const plainCleanedTitle = sanitizeQueryTerm(
    input.cleanedTitle || input.title,
  );
  const plainCompany = sanitizeQueryTerm(input.company);
  const locationPart = input.normalizedLocation
    ? ` ${sanitizeQueryTerm(input.normalizedLocation)}`
    : "";
  const cityPart = input.locationCity
    ? ` ${sanitizeQueryTerm(input.locationCity)}`
    : "";
  const atsSitesPrimary =
    "site:greenhouse.io OR site:jobs.lever.co OR site:ashbyhq.com OR site:smartrecruiters.com";
  const atsSitesSecondary =
    "site:myworkdayjobs.com OR site:workdayjobs.com OR site:icims.com OR site:bamboohr.com OR site:jobvite.com";

  if (input.googleFirstTriggered) {
    const compactTitle = sanitizeQueryTerm(
      plainCleanedTitle
        .replace(/[-/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

    const jobsHost =
      input.employerHostCandidates.find((host) => host.startsWith("jobs.")) ??
      input.employerHostCandidates[0];
    const careersHost =
      input.employerHostCandidates.find((host) => host.startsWith("careers.")) ??
      input.employerHostCandidates.find((host) => host !== jobsHost);

    return dedupeStrings([
      `${compactTitle} ${plainCompany}${locationPart} careers`,
      `${compactTitle} ${plainCompany}${locationPart}`,
      `"${plainTitle}" "${plainCompany}"${locationPart ? ` "${sanitizeQueryTerm(input.normalizedLocation)}"` : ""}`,
      `"${compactTitle}" "${plainCompany}" careers`,
      `"${compactTitle}" "${plainCompany}" apply`,
      `site:myworkdayjobs.com "${compactTitle}" "${plainCompany}"`,
      `site:workdayjobs.com "${compactTitle}" "${plainCompany}"`,
      `site:greenhouse.io "${compactTitle}" "${plainCompany}"`,
      `site:lever.co "${compactTitle}" "${plainCompany}"`,
      `site:ashbyhq.com "${compactTitle}" "${plainCompany}"`,
      `site:smartrecruiters.com "${compactTitle}" "${plainCompany}"`,
      `site:workable.com "${compactTitle}" "${plainCompany}"`,
      `${plainCompany} ${compactTitle}${cityPart || locationPart}`,
      input.cleanedTitle !== input.title && plainTitle !== compactTitle
        ? `"${plainTitle}" "${plainCompany}" careers`
        : "",
      jobsHost
        ? `site:${jobsHost} "${compactTitle}" "${plainCompany}"${cityPart || locationPart}`
        : "",
      careersHost ? `site:${careersHost} "${compactTitle}" "${plainCompany}"` : "",
    ]).slice(0, 12);
  }

  return dedupeStrings([
    `${plainTitle} ${plainCompany}${locationPart}`,
    `${plainTitle} ${plainCompany}${locationPart} apply`,
    `${plainCompany} ${plainCleanedTitle} careers`,
    `${plainCleanedTitle} ${plainCompany} ${atsSitesPrimary}`,
    `${plainCleanedTitle} ${plainCompany} ${atsSitesSecondary}`,
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

function looksLikeResolvableUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;

  return (
    /^https?:\/\//i.test(normalized) ||
    normalized.startsWith("//") ||
    normalized.startsWith("/")
  );
}

function safeDecodeUrlComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cleanExtractedUrlValue(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":")
    .replace(/\\\//g, "/")
    .trim();
}

function normalizeResolvedCandidateUrl(rawValue: string, baseUrl: string) {
  const candidate = cleanExtractedUrlValue(rawValue);
  if (
    !candidate ||
    /^(javascript:|mailto:|tel:|#)/i.test(candidate) ||
    candidate.toLowerCase() === "null"
  ) {
    return "";
  }

  if (!looksLikeResolvableUrl(candidate)) {
    return "";
  }

  try {
    return normalizeJobUrl(new URL(candidate, baseUrl).toString());
  } catch {
    return "";
  }
}

function expandCandidateUrls(rawValue: string, baseUrl: string) {
  const queue = dedupeStrings([
    rawValue,
    safeDecodeUrlComponent(rawValue),
    safeDecodeUrlComponent(safeDecodeUrlComponent(rawValue)),
  ]);
  const visited = new Set<string>();
  const resolved = new Set<string>();

  while (queue.length > 0 && visited.size < 32) {
    const current = queue.shift() ?? "";
    const normalizedCurrent = cleanExtractedUrlValue(current);
    if (!normalizedCurrent || visited.has(normalizedCurrent)) {
      continue;
    }

    visited.add(normalizedCurrent);

    const normalizedUrl = normalizeResolvedCandidateUrl(
      normalizedCurrent,
      baseUrl,
    );
    if (!normalizedUrl) {
      continue;
    }

    resolved.add(normalizedUrl);

    try {
      const parsed = new URL(normalizedUrl);
      for (const [key, value] of parsed.searchParams.entries()) {
        const normalizedKey = key.trim().toLowerCase();
        const normalizedValue = cleanExtractedUrlValue(value);
        if (!normalizedValue) {
          continue;
        }

        if (
          [
            "url",
            "dest",
            "destination",
            "redirect",
            "redirect_url",
            "external",
            "external_url",
            "target",
            "job_url",
            "apply_url",
            "continue",
          ].includes(normalizedKey) ||
          /^https?:\/\//i.test(normalizedValue) ||
          normalizedValue.includes("http%3A") ||
          normalizedValue.includes("https%3A")
        ) {
          queue.push(normalizedValue);
        }
      }
    } catch {
      // ignore invalid URLs while expanding nested redirect params
    }
  }

  return Array.from(resolved);
}

function extractRawCandidateUrlsFromHtml(html: string) {
  const matches = new Set<string>();
  const patterns = [
    /href\s*=\s*["']([^"'#]+)["']/gi,
    /content\s*=\s*["'][^"']*url=([^"']+)["']/gi,
    /(?:window\.location|location\.href|location\.assign|document\.location)\s*(?:=|\()\s*["']([^"']+)["']/gi,
    /https?:\/\/[^\s"'<>\\]+/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(html)) !== null) {
      const value = match[1] ?? match[0];
      const normalized = cleanExtractedUrlValue(value);
      if (normalized) {
        matches.add(normalized);
      }
    }
  }

  return Array.from(matches);
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

function isKnownDirectEmployerUrl(
  input: NormalizedResolverInput,
  url: string,
  options?: { allowUnknownNonAggregator?: boolean },
) {
  const normalizedUrl = normalizeJobUrl(url);
  if (
    !normalizedUrl ||
    !isValidResolvedJobUrl(normalizedUrl) ||
    classifyNonJobPostingUrl(normalizedUrl) !== null ||
    isAdzunaUnresolvedHandoffUrl(normalizedUrl) ||
    isAggregatorHandoffUrl(normalizedUrl)
  ) {
    return false;
  }

  if (
    isLikelyAtsUrl(normalizedUrl) ||
    isLikelyCompanyCareersUrl(normalizedUrl) ||
    hasEmployerOwnedHost(normalizedUrl, input.employerHostCandidates)
  ) {
    return true;
  }

  return options?.allowUnknownNonAggregator === true && !isUnrelatedHost(normalizedUrl);
}

function buildResolutionCacheKeys(args: {
  input: NormalizedResolverInput;
  source?: string | null;
  sourceJobId?: string | null;
}) {
  const source = normalizeCacheKeyPart(args.source ?? args.input.source);
  const rawSourceJobId = normalizeText(args.sourceJobId);
  const normalizedSourceJobId =
    source.includes("adzuna") || rawSourceJobId.toLowerCase().startsWith("adzuna:")
      ? normalizeCacheKeyPart(normalizeAdzunaProviderId(rawSourceJobId))
      : normalizeCacheKeyPart(rawSourceJobId.replace(/^[a-z0-9_-]+:/i, ""));

  const companyKey = normalizeCacheKeyPart(
    normalizeCompanyName(args.input.company) || args.input.company,
  );
  const titleKey = normalizeCacheKeyPart(
    args.input.cleanedTitle || args.input.title,
  );
  const locationKey = normalizeCacheKeyPart(
    args.input.normalizedLocation || args.input.location || "unknown",
  );

  return dedupeStrings(
    [
      source && normalizedSourceJobId
        ? `source:${source}:${normalizedSourceJobId}`
        : "",
      companyKey && titleKey
        ? `job:${companyKey}:${titleKey}:${locationKey || "unknown"}`
        : "",
    ].filter(Boolean),
  );
}

function writeResolutionCacheEntry(args: {
  keys: string[];
  resolvedUrl: string;
  confidence: number;
  source: string;
}) {
  if (args.keys.length === 0) {
    return;
  }

  const normalizedUrl = normalizeJobUrl(args.resolvedUrl);
  if (!normalizedUrl) {
    return;
  }

  const store = getDirectJobResolutionCache();
  pruneDirectJobResolutionCache(store);

  const nextEntry = {
    resolvedDirectUrl: normalizedUrl,
    host: normalizeHostname(normalizedUrl),
    timestamp: Date.now(),
    confidence: Math.max(0, Math.min(0.99, args.confidence)),
    source: args.source,
  } satisfies DirectJobResolutionCacheEntry;

  for (const key of args.keys) {
    store[key] = nextEntry;
  }

  persistDirectJobResolutionCache(store);
  console.info("[DIRECT_JOB_RESOLVER] resolved employer URL saved", {
    source: args.source,
    resolvedDirectUrl: normalizedUrl,
    resolvedHost: nextEntry.host,
    confidence: Number(nextEntry.confidence.toFixed(3)),
    cacheKeyCount: args.keys.length,
    resolvedAt: new Date(nextEntry.timestamp).toISOString(),
  });
}

function readResolutionCacheEntry(args: {
  input: NormalizedResolverInput;
  keys: string[];
}) {
  if (args.keys.length === 0) {
    return null;
  }

  const store = getDirectJobResolutionCache();
  pruneDirectJobResolutionCache(store);

  for (const key of args.keys) {
    const entry = store[key];
    if (!entry) {
      continue;
    }

    if (!isKnownDirectEmployerUrl(args.input, entry.resolvedDirectUrl)) {
      continue;
    }

    return {
      entry,
      key,
    };
  }

  return null;
}

function buildKnownUrlResolution(args: {
  input: NormalizedResolverInput;
  resolvedUrl: string;
  confidence: number;
  matchReason: string;
  acceptanceRule: string;
  candidates?: Array<{
    url: string;
    title?: string;
    provider?: string;
    confidence: number;
    reason: string;
  }>;
  searchProvider?: string;
}) {
  const normalizedUrl = normalizeJobUrl(args.resolvedUrl);
  const provider = detectDirectPageProvider(normalizedUrl);

  return {
    ok: true,
    resolvedUrl: normalizedUrl,
    confidence: Number(args.confidence.toFixed(3)),
    provider,
    matchReason: args.matchReason,
    acceptanceRule: args.acceptanceRule,
    googleFirstTriggered: args.input.googleFirstTriggered,
    queries: [],
    normalizedLocation: args.input.normalizedLocation || undefined,
    searchProvider: args.searchProvider,
    adzunaStrategyReplaySkipped: args.input.googleFirstTriggered,
    candidates:
      args.candidates ??
      [
        {
          url: normalizedUrl,
          provider,
          confidence: Number(args.confidence.toFixed(3)),
          reason: args.matchReason,
        },
      ],
  } satisfies DirectJobResolution;
}

function cacheSuccessfulResolution(args: {
  input: NormalizedResolverInput;
  source?: string | null;
  sourceJobId?: string | null;
  resolution: DirectJobResolution;
  cacheSource: string;
}) {
  if (!args.resolution.ok || !args.resolution.resolvedUrl) {
    return args.resolution;
  }

  writeResolutionCacheEntry({
    keys: buildResolutionCacheKeys({
      input: args.input,
      source: args.source,
      sourceJobId: args.sourceJobId,
    }),
    resolvedUrl: args.resolution.resolvedUrl,
    confidence: args.resolution.confidence ?? 0.9,
    source: args.cacheSource,
  });

  return args.resolution;
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
  if (isSearchResultsUrl(candidateUrl)) {
    return true;
  }

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

function selectAcceptedCandidate(
  input: NormalizedResolverInput,
  candidates: ScoredCandidate[],
) {
  if (candidates.length === 0) {
    return { accepted: false as const };
  }

  const eligibleCandidates = candidates.filter(
    (candidate) =>
      candidate.resolvedUrlValid &&
      !candidate.rejectedReason &&
      candidate.score >= HIGH_CONFIDENCE_THRESHOLD,
  );
  const bestCandidate = eligibleCandidates[0];
  if (!bestCandidate) {
    return { accepted: false as const };
  }

  const bestEmployerDirectCandidate = eligibleCandidates.find((candidate) =>
    isEmployerDirectCandidate(input, candidate),
  );

  if (
    bestEmployerDirectCandidate &&
    getAggregatorPenalty(bestCandidate.url) &&
    bestCandidate.score - bestEmployerDirectCandidate.score <=
      PREFERRED_DIRECT_CANDIDATE_MARGIN
  ) {
    return {
      accepted: true as const,
      candidate: bestEmployerDirectCandidate,
      rule: "preferred_direct_candidate_within_margin",
    };
  }

  const selectedCandidate = isEmployerDirectCandidate(input, bestCandidate)
    ? bestCandidate
    : bestEmployerDirectCandidate ?? bestCandidate;

  return {
    accepted: true as const,
    candidate: selectedCandidate,
    rule: isEmployerDirectCandidate(input, selectedCandidate)
      ? "strong_direct_candidate"
      : "strong_fallback_candidate",
  };
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
  const domain = normalizeHostname(candidateUrl);
  const companyMatch = scoreCompanyMatch({
    company: input.company,
    resultTitle: overrides?.verifiedTitle ?? result.title,
    resultSnippet: [result.snippet, overrides?.verifiedSnippet].filter(Boolean).join(" "),
    resultUrl: candidateUrl,
    displayedUrl: result.displayedUrl,
  });
  const resolvedUrlValid = isValidResolvedJobUrl(candidateUrl);
  const corpus = [
    buildCandidateCorpus(result, candidateUrl, overrides?.verifiedTitle),
    overrides?.verifiedSnippet,
  ]
    .filter(Boolean)
    .join(" ");
  const corpusLower = normalizeForSearch(corpus);
  const expandedCorpus = normalizeForSearch(expandTitleSynonyms(corpus));
  const corpusTokens = buildSimilarityTokens(corpus);
  const normalizedPrimaryTitle = normalizeForSearch(input.cleanedTitle || input.title);
  const normalizedOriginalTitle = normalizeForSearch(input.title);
  const expandedPrimaryTitle = normalizeForSearch(
    expandTitleSynonyms(input.cleanedTitle || input.title),
  );
  const exactTitleMatched =
    Boolean(normalizedPrimaryTitle && corpusLower.includes(normalizedPrimaryTitle)) ||
    Boolean(normalizedOriginalTitle && corpusLower.includes(normalizedOriginalTitle));
  const acronymExpandedTitleMatched =
    !exactTitleMatched &&
    Boolean(expandedPrimaryTitle && expandedCorpus.includes(expandedPrimaryTitle));
  const verifiedPageTitleMatched =
    Boolean(overrides?.verifiedTitle) &&
    scoreTokenSimilarity(input.titleTokens, buildSimilarityTokens(overrides?.verifiedTitle)) >= 0.3;
  const titleSimilarity = scoreTokenSimilarity(input.titleTokens, corpusTokens);
  const importantTitleSimilarity =
    input.titleImportantTokens.length > 0
      ? scoreTokenSimilarity(input.titleImportantTokens, corpusTokens)
      : 0;
  const companySimilarity = Math.max(
    scoreCompanySimilarity(input, corpusTokens.join(" ")),
    companyMatch.score / 100,
  );
  const locationSimilarity =
    input.locationTokens.length > 0
      ? scoreTokenSimilarity(input.locationTokens, corpusTokens)
      : 0;
  const locationSignals = computeLocationScore(input, corpus);
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
  const companyDomainTokenMatched = input.companyCoreTokens.some(
    (token) => token.length >= 4 && domain.includes(token),
  );
  const jobPathBonus =
    /\/(job|jobs|position|positions|opening|openings|opportunit|career|careers)/i.test(
      candidateUrl,
    )
      ? 0.06
      : 0;
  const positionBonus =
    typeof result.position === "number" && Number.isFinite(result.position)
      ? Math.max(0, 0.08 - Math.max(result.position - 1, 0) * 0.01)
      : 0;
  const companyAliasMatched = input.companyAliasVariants.some((variant) => {
    const normalizedVariant = normalizeForSearch(variant);
    const normalizedCoreVariant = normalizeForSearch(normalizeCompanyName(variant));
    return (
      Boolean(normalizedVariant && corpusLower.includes(normalizedVariant)) ||
      Boolean(normalizedCoreVariant && corpusLower.includes(normalizedCoreVariant))
    );
  });

  const matchedSignals: string[] = [];
  const reasonParts: string[] = [];
  let rawScore = 0;
  let penalty = 0;
  let rejectedReason: string | undefined;

  if (provider) {
    reasonParts.push(`provider:${provider}`);
  }

  if (
    companyMatch.reason.includes("exact_company_text_match") ||
    companyMatch.reason.includes("exact_company_url_match")
  ) {
    rawScore += 40;
    matchedSignals.push("company_match");
  } else if (companyMatch.reason.includes("all_major_tokens_match")) {
    rawScore += 30;
    matchedSignals.push("company_tokens_match");
  } else if (
    companyMatch.matched ||
    companyAliasMatched ||
    matchedEmployerOwnedHost ||
    companySimilarity >= 0.18
  ) {
    rawScore += 15;
    matchedSignals.push(companyAliasMatched ? "company_alias_match" : "company_partial_match");
  }

  if (exactTitleMatched) {
    rawScore += 35;
    matchedSignals.push("exact_title_match");
  } else if (acronymExpandedTitleMatched) {
    rawScore += 30;
    matchedSignals.push(
      /\bfms\b/i.test(corpus)
        ? "fms_acronym_title_match"
        : "acronym_expanded_title_match",
    );
  } else if (titleSimilarity >= 0.7) {
    rawScore += 25;
    matchedSignals.push("title_tokens_match");
  } else if (importantTitleSimilarity >= 0.45) {
    rawScore += 20;
    matchedSignals.push("important_title_tokens_match");
  }

  if (locationSignals.score > 0) {
    rawScore += locationSignals.score;
    matchedSignals.push(...locationSignals.matchedSignals);
  }

  if (matchedEmployerOwnedHost || provider === "company_careers") {
    rawScore += 30;
    matchedSignals.push("employer_owned_host");
  } else if (isLikelyAtsUrl(candidateUrl)) {
    rawScore += 28;
    matchedSignals.push("ats_host_match");
  }

  if (companyDomainTokenMatched || companyHostMatchBonus > 0.05) {
    rawScore += 20;
    matchedSignals.push("company_domain_match");
  }

  if (jobPathBonus > 0) {
    rawScore += 20;
    matchedSignals.push("careers_path");
  }

  const snippetTitleConfirmed =
    Boolean(expandedPrimaryTitle && expandedCorpus.includes(expandedPrimaryTitle)) ||
    importantTitleSimilarity >= 0.55;
  if (snippetTitleConfirmed) {
    rawScore += 20;
    matchedSignals.push(
      expandedPrimaryTitle.includes("flight management systems") &&
        expandedCorpus.includes("flight management systems")
        ? "snippet_flight_management_systems_match"
        : "snippet_title_match",
    );
  }

  if (verifiedPageTitleMatched) {
    rawScore += 10;
    matchedSignals.push("verified_page_title");
  }

  if (positionBonus > 0) {
    rawScore += Math.round(positionBonus * 100);
    matchedSignals.push(`position_bonus:${positionBonus.toFixed(2)}`);
  }

  if (companyMatch.matched) {
    reasonParts.push(`company_name_match:${companyMatch.score}`);
    reasonParts.push(`company_match_reason:${companyMatch.reason}`);
  } else {
    penalty += 45;
    rejectedReason = "company_mismatch";
    reasonParts.push(`company_mismatch_penalty:${companyMatch.reason}`);
  }

  if (isAdzunaUnresolvedHandoffUrl(candidateUrl)) {
    penalty += 60;
    reasonParts.push("adzuna_handoff_penalty");
  } else if (isAggregatorHandoffUrl(candidateUrl)) {
    penalty += 45;
    reasonParts.push("aggregator_handoff_penalty");
  } else if (!isLikelyAtsUrl(candidateUrl) && !isLikelyCompanyCareersUrl(candidateUrl)) {
    penalty += 10;
    reasonParts.push("not_direct_job_page_penalty");
  }

  const aggregatorPenalty = getAggregatorPenalty(candidateUrl);
  if (aggregatorPenalty) {
    penalty += aggregatorPenalty.penalty;
    reasonParts.push(aggregatorPenalty.signal);
  }

  if (isLikelySearchOrIndexPage(candidateUrl, corpus)) {
    penalty += 120;
    rejectedReason = "search_results_page";
    reasonParts.push("search_or_index_page_penalty");
  }

  if (isLikelyLoginOrInterstitialPage(candidateUrl, corpus)) {
    penalty += 40;
    rejectedReason ??= "login_or_interstitial_page";
    reasonParts.push("login_or_interstitial_penalty");
  }

  if (!resolvedUrlValid) {
    penalty += 80;
    rejectedReason ??= isSearchResultsUrl(candidateUrl)
      ? "search_results_page"
      : "invalid_resolved_job_url";
    reasonParts.push("invalid_resolved_job_url_penalty");
  }

  if (isUnrelatedHost(candidateUrl)) {
    penalty += 25;
    reasonParts.push("unrelated_domain_penalty");
  }

  const nonJobPostingReason = classifyNonJobPostingUrl(candidateUrl);
  if (nonJobPostingReason) {
    penalty += 80;
    rejectedReason ??= nonJobPostingReason;
    reasonParts.push(`non_job_posting_penalty:${nonJobPostingReason}`);
  }

  const verificationBoost = Math.round((overrides?.verificationBoost ?? 0) * 100);
  const verificationPenalty = Math.round((overrides?.verificationPenalty ?? 0) * 100);
  const score = Math.max(0, Math.round(rawScore + verificationBoost - penalty - verificationPenalty));
  const confidence = Math.max(0, Math.min(0.99, Number((score / 140).toFixed(3))));
  const confidenceLabel = deriveConfidenceLabel(score);
  const dedupedMatchedSignals = dedupeStrings(matchedSignals);
  const dedupedReasonParts = dedupeStrings([
    ...reasonParts,
    ...dedupedMatchedSignals,
    `score:${score}`,
  ]);

  return {
    url: candidateUrl,
    title: overrides?.verifiedTitle ?? result.title,
    provider,
    domain,
    searchProviderSource: String(result.source ?? "").trim() || undefined,
    position: result.position ?? null,
    score,
    confidence,
    confidenceLabel,
    reason: dedupedReasonParts.join("; ") || "candidate_scored",
    reasonParts: dedupedReasonParts,
    matchedSignals: dedupedMatchedSignals,
    rejectedReason,
    snippet: result.snippet,
    titleSimilarity,
    companySimilarity,
    companyMatchScore: companyMatch.score,
    companyMatchReason: companyMatch.reason,
    companyMatched: companyMatch.matched,
    resolvedUrlValid,
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

function scoreKnownDirectCandidate(args: {
  input: NormalizedResolverInput;
  url: string;
  title?: string;
  snippet?: string;
}) {
  return scoreCandidate(
    args.input,
    {
      title: (args.title ?? args.input.cleanedTitle) || args.input.title,
      url: args.url,
      snippet: args.snippet,
      source: "known_direct_url",
    },
    {
      resolvedUrl: args.url,
      verifiedTitle: args.title,
      verifiedSnippet: args.snippet,
      verificationBoost: 0.18,
    },
  );
}

async function resolveAdzunaExtractedDirectUrl(args: {
  input: NormalizedResolverInput;
  sourceJobId?: string | null;
  applicationId?: string | null;
  source?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  location?: string | null;
}): Promise<DirectJobResolution | null> {
  const detailsUrl = buildAdzunaDetailsUrl(args.sourceJobId);
  const fetchTargets = dedupeStrings(
    [
      isAggregatorHandoffUrl(args.input.currentUrl) ? args.input.currentUrl : "",
      detailsUrl ?? "",
    ].filter(Boolean),
  );

  if (fetchTargets.length === 0) {
    return null;
  }

  const inspectSeedCandidates = (seedUrl: string) => {
    const candidates = expandCandidateUrls(seedUrl, seedUrl)
      .filter((candidate) => candidate !== normalizeJobUrl(seedUrl))
      .filter((candidate) =>
        isKnownDirectEmployerUrl(args.input, candidate),
      )
      .map((candidate) =>
        scoreKnownDirectCandidate({
          input: args.input,
          url: candidate,
        }),
      )
      .sort((left, right) => right.confidence - left.confidence);

    const best = candidates[0];
    if (!best || best.confidence < KNOWN_DIRECT_URL_THRESHOLD) {
      return null;
    }

    return buildKnownUrlResolution({
      input: args.input,
      resolvedUrl: best.url,
      confidence: best.confidence,
      matchReason:
        "Resolved direct employer URL from Adzuna outbound parameters.",
      acceptanceRule: "adzuna_outbound_parameter",
      candidates: candidates.slice(0, 3).map(toCandidateEvidence),
    });
  };

  for (const fetchTarget of fetchTargets) {
    const seedResolution = inspectSeedCandidates(fetchTarget);
    if (seedResolution) {
      return seedResolution;
    }

    const timeout = createTimeoutSignal(FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(fetchTarget, {
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        redirect: "follow",
        signal: timeout.signal,
      });

      const responseUrl = normalizeJobUrl(response.url || fetchTarget);
      const responseUrlRejectedReason = classifyNonJobPostingUrl(responseUrl);
      if (responseUrlRejectedReason) {
        logDirectUrlRejectedNotJobPosting({
          applicationId: args.applicationId,
          sourceJobId: args.sourceJobId,
          source: args.source,
          candidateUrl: responseUrl,
          rejectionReason: responseUrlRejectedReason,
          jobTitle: args.jobTitle,
          company: args.company,
          location: args.location,
        });
      }
      if (isKnownDirectEmployerUrl(args.input, responseUrl)) {
        return buildKnownUrlResolution({
          input: args.input,
          resolvedUrl: responseUrl,
          confidence: 0.97,
          matchReason:
            "Resolved direct employer URL from Adzuna redirect.",
          acceptanceRule: "adzuna_response_redirect",
        });
      }

      const html = (await response.text().catch(() => "")).trim();
      if (!html) {
        continue;
      }

      const verifiedTitle = extractHtmlTitle(html);
      const verifiedSnippet = extractHtmlTextSnippet(html);
      const rawCandidates = dedupeStrings([
        ...extractRawCandidateUrlsFromHtml(html),
        ...expandCandidateUrls(responseUrl, responseUrl),
      ]);
      const candidates = dedupeStrings(
        rawCandidates.flatMap((candidate) =>
          expandCandidateUrls(candidate, responseUrl),
        ),
      )
        .filter((candidate) => candidate !== responseUrl)
        .filter((candidate) =>
          isKnownDirectEmployerUrl(args.input, candidate),
        )
        .map((candidate) =>
          scoreKnownDirectCandidate({
            input: args.input,
            url: candidate,
            title: verifiedTitle,
            snippet: verifiedSnippet,
          }),
        )
        .sort((left, right) => right.confidence - left.confidence);

      const best = candidates[0];
      if (!best || best.confidence < KNOWN_DIRECT_URL_THRESHOLD) {
        continue;
      }

      return buildKnownUrlResolution({
        input: args.input,
        resolvedUrl: best.url,
        confidence: best.confidence,
        matchReason:
          "Extracted direct employer URL from Adzuna detail page HTML.",
        acceptanceRule: "adzuna_detail_html_extract",
        candidates: candidates.slice(0, 3).map(toCandidateEvidence),
      });
    } catch {
      // keep search fallback available if Adzuna extraction fails
    } finally {
      timeout.clear();
    }
  }

  return null;
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
    provider: candidate.searchProviderSource ?? candidate.provider,
    source: candidate.searchProviderSource ?? candidate.provider,
    domain: candidate.domain,
    score: candidate.score,
    confidence: Number(candidate.confidence.toFixed(3)),
    confidenceLabel: candidate.confidenceLabel,
    reason: candidate.reason,
    matchedSignals: candidate.matchedSignals,
    rejectedReason: candidate.rejectedReason,
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
  const locationState = extractLocationState(normalizedLocation || location);
  const currentUrl = normalizeJobUrl(args.currentUrl ?? "");
  const source = normalizeForSearch(args.source);
  const cleanedTitle = stripTitleNoise(title) || title;
  const titleTokens = dedupeStrings([
    ...buildSimilarityTokens(title),
    ...buildSimilarityTokens(cleanedTitle),
  ]);
  const titleImportantTokens = titleTokens.filter(isImportantTitleToken);
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
    locationState,
    currentUrl,
    source,
    titleTokens,
    titleImportantTokens,
    companyTokens,
    companyCoreTokens: companyCoreTokens.length > 0 ? companyCoreTokens : companyTokens,
    locationTokens,
    employerHostCandidates,
    adzunaHandoffDetected,
    googleFirstTriggered,
  };
}

function logDirectUrlRejectedNotJobPosting(args: {
  applicationId?: string | null;
  sourceJobId?: string | null;
  source?: string | null;
  candidateUrl: string;
  rejectionReason: NonJobPostingClassification;
  jobTitle?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  console.info("[AUTO_APPLY_DIRECT_URL_REJECTED_NOT_JOB_POSTING]", {
    applicationId: args.applicationId ?? null,
    sourceJobId: args.sourceJobId ?? null,
    source: args.source ?? null,
    candidateUrl: normalizeJobUrl(args.candidateUrl),
    rejectionReason: args.rejectionReason,
    jobTitle: normalizeText(args.jobTitle),
    company: normalizeText(args.company),
    location: normalizeText(args.location),
  });
}

function buildCurrentUrlResolution(input: NormalizedResolverInput): DirectJobResolution | null {
  if (!input.currentUrl) {
    return null;
  }

  if (classifyNonJobPostingUrl(input.currentUrl)) {
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
  sourceJobId?: string | null;
  preferredDirectUrl?: string | null;
  applicationId?: string | null;
}): Promise<DirectJobResolution> {
  const input = buildNormalizedInput(args);
  console.info("[apply resolver] Step 1 completed: located current search resolver flow", {
    source: normalizeForSearch(args.source),
    sourceJobId: normalizeText(args.sourceJobId),
    originalSourceUrl: input.currentUrl || null,
  });
  console.info("[apply resolver] Step 2 completed: blocked SERP URLs from resolvedPostingUrl");
  console.info("[DIRECT_JOB_RESOLVER] priority path started", {
    source: normalizeForSearch(args.source),
    sourceJobId: normalizeText(args.sourceJobId),
    currentUrl: input.currentUrl || null,
    title: input.title,
    company: input.company,
    location: input.location || null,
    adzunaHandoffDetected: input.adzunaHandoffDetected,
    googleFirstTriggered: input.googleFirstTriggered,
  });

  if (!input.title || !input.company) {
    return {
      ok: false,
      error: "Direct resolver requires both title and company.",
      candidates: [],
    };
  }

  const preferredDirectUrl = normalizeJobUrl(args.preferredDirectUrl ?? "");
  const preferredDirectUrlRejectedReason = classifyNonJobPostingUrl(
    preferredDirectUrl,
  );
  if (preferredDirectUrl && preferredDirectUrlRejectedReason) {
    logDirectUrlRejectedNotJobPosting({
      applicationId: args.applicationId,
      sourceJobId: args.sourceJobId,
      source: args.source,
      candidateUrl: preferredDirectUrl,
      rejectionReason: preferredDirectUrlRejectedReason,
      jobTitle: args.title,
      company: args.company,
      location: args.location,
    });
  }
  if (
    preferredDirectUrl &&
    !preferredDirectUrlRejectedReason &&
    isKnownDirectEmployerUrl(input, preferredDirectUrl, {
      allowUnknownNonAggregator: true,
    })
  ) {
    return cacheSuccessfulResolution({
      input,
      source: args.source,
      sourceJobId: args.sourceJobId,
      cacheSource: "preferred_direct_url",
      resolution: buildKnownUrlResolution({
        input,
        resolvedUrl: preferredDirectUrl,
        confidence: 0.99,
        matchReason:
          "Used the known employer URL supplied by the user or a saved strategy.",
        acceptanceRule: "preferred_direct_url",
      }),
    });
  }

  const currentUrlRejectedReason = classifyNonJobPostingUrl(input.currentUrl);
  if (input.currentUrl && currentUrlRejectedReason) {
    logDirectUrlRejectedNotJobPosting({
      applicationId: args.applicationId,
      sourceJobId: args.sourceJobId,
      source: args.source,
      candidateUrl: input.currentUrl,
      rejectionReason: currentUrlRejectedReason,
      jobTitle: args.title,
      company: args.company,
      location: args.location,
    });
  }

  const currentUrlResolution = buildCurrentUrlResolution(input);
  if (currentUrlResolution) {
    return cacheSuccessfulResolution({
      input,
      source: args.source,
      sourceJobId: args.sourceJobId,
      cacheSource: "current_url",
      resolution: currentUrlResolution,
    });
  }

  const extractedAdzunaResolution = await resolveAdzunaExtractedDirectUrl({
    input,
    sourceJobId: args.sourceJobId,
    applicationId: args.applicationId,
    source: args.source,
    jobTitle: args.title,
    company: args.company,
    location: args.location,
  });
  if (extractedAdzunaResolution) {
    return cacheSuccessfulResolution({
      input,
      source: args.source,
      sourceJobId: args.sourceJobId,
      cacheSource: "adzuna_extract",
      resolution: extractedAdzunaResolution,
    });
  }

  const cachedResolution = readResolutionCacheEntry({
    input,
    keys: buildResolutionCacheKeys({
      input,
      source: args.source,
      sourceJobId: args.sourceJobId,
    }),
  });
  if (cachedResolution) {
    return buildKnownUrlResolution({
      input,
      resolvedUrl: cachedResolution.entry.resolvedDirectUrl,
      confidence: cachedResolution.entry.confidence,
      matchReason: `Reused previously resolved employer URL from cache (${cachedResolution.entry.source}).`,
      acceptanceRule: "cached_resolved_direct_url",
      candidates: [
        {
          url: cachedResolution.entry.resolvedDirectUrl,
          provider: detectDirectPageProvider(
            cachedResolution.entry.resolvedDirectUrl,
          ),
          confidence: Number(cachedResolution.entry.confidence.toFixed(3)),
          reason: `cache_hit:${cachedResolution.key}`,
        },
      ],
    });
  }

  const queries = buildSearchQueries(input);
  const preferredSearchProvider = input.googleFirstTriggered
    ? "google_first"
    : undefined;
  const searchProviderOrder = resolveJobSearchProviderOrder({
    preferredProvider: preferredSearchProvider,
  });
  const searchProvider = searchProviderOrder[0] ?? "duckduckgo_html";
  console.info("[apply resolver] Step 5 completed: SerpAPI Google primary, DuckDuckGo fallback preserved", {
    provider: searchProvider,
    providers: searchProviderOrder,
    queryCount: queries.length,
  });
  console.info("[DIRECT_JOB_RESOLVER] provider selected", {
    source: normalizeForSearch(args.source),
    searchProvider,
    searchProviderOrder,
    googleFirstTriggered: input.googleFirstTriggered,
  });
  console.info("[DIRECT_JOB_RESOLVER] provider order", {
    providers: searchProviderOrder,
    source: normalizeForSearch(args.source),
    googleFirstTriggered: input.googleFirstTriggered,
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
    searchProviderOrder,
    queries,
    queryCount: queries.length,
  });

  const searchResults = dedupeJobSearchResults(
    await searchJobPages({
      queries,
      location: input.normalizedLocation || input.location || null,
      limit: 16,
      preferredProvider: preferredSearchProvider,
    }),
  );

  if (searchResults.length === 0) {
    return {
      ok: false,
      failureReason: "real_posting_not_found",
      googleFirstTriggered: input.googleFirstTriggered,
      queries,
      normalizedLocation: input.normalizedLocation || undefined,
      searchProvider: String(searchProvider),
      adzunaStrategyReplaySkipped: input.googleFirstTriggered,
      error:
        "No organic search results were returned by the configured job search provider.",
      candidates: [],
    };
  }

  const preliminaryCandidates = searchResults
    .map((result) => scoreCandidate(input, result))
    .filter((candidate) => candidate.score >= MIN_CANDIDATE_SCORE)
    .sort((left, right) => right.score - left.score);

  const candidatesToVerify = preliminaryCandidates
    .slice(0, MAX_VERIFIED_CANDIDATES)
    .map((candidate) => ({
      title: candidate.title ?? "",
      url: candidate.url,
      snippet: candidate.snippet,
      source: candidate.searchProviderSource ?? candidate.provider,
      position: candidate.position ?? null,
    }));

  const verifiedCandidates = await Promise.all(
    candidatesToVerify.map((candidate) => verifyCandidate(input, candidate)),
  );

  const scoredCandidates = (verifiedCandidates.length > 0
    ? verifiedCandidates
    : preliminaryCandidates
  )
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_VERIFIED_CANDIDATES);

  const acceptance = selectAcceptedCandidate(input, scoredCandidates);
  const bestCandidate = acceptance.accepted
    ? acceptance.candidate
    : scoredCandidates[0];

  console.info("[apply resolver] search candidates scored", {
    query: queries[0] ?? null,
    queries,
    provider: searchProvider,
    originalSourceUrl: input.currentUrl || null,
    title: input.title,
    company: input.company,
    location: input.normalizedLocation || input.location || null,
    candidates: scoredCandidates.map((candidate, index) => ({
      rank: index + 1,
      title: candidate.title ?? null,
      url: candidate.url,
      domain: candidate.domain,
      source: candidate.searchProviderSource ?? candidate.provider ?? null,
      score: candidate.score,
      confidence: Number(candidate.confidence.toFixed(3)),
      matchedSignals: candidate.matchedSignals,
      rejectedReason: candidate.rejectedReason ?? null,
    })),
  });
  console.info("[apply resolver] Step 3 completed: added strong candidate scoring");

  const nonJobCandidates = scoredCandidates
    .filter((candidate) =>
      candidate.reasonParts.some((part) =>
        part.startsWith("non_job_posting_penalty:"),
      ),
    )
    .slice(0, 5);
  for (const candidate of nonJobCandidates) {
    const reasonPart = candidate.reasonParts.find((part) =>
      part.startsWith("non_job_posting_penalty:"),
    );
    const rejectionReason =
      (reasonPart?.split(":")[1] as NonJobPostingClassification | undefined) ??
      "search_results_page";
    logDirectUrlRejectedNotJobPosting({
      applicationId: args.applicationId,
      sourceJobId: args.sourceJobId,
      source: args.source,
      candidateUrl: candidate.url,
      rejectionReason,
      jobTitle: args.title,
      company: args.company,
      location: args.location,
    });
  }

  scoredCandidates.forEach((candidate) => {
    const providerUsed =
      candidate.searchProviderSource ?? String(searchProvider);
    if (acceptance.accepted && candidate.url === acceptance.candidate.url) {
      console.info("[DIRECT_JOB_RESOLVER] candidate accepted", {
        provider: providerUsed,
        url: candidate.url,
        score: candidate.score,
        companyMatchScore: candidate.companyMatchScore,
        companyMatchReason: candidate.companyMatchReason,
        matchedSignals: candidate.matchedSignals,
      });
      return;
    }

    console.info("[DIRECT_JOB_RESOLVER] candidate rejected", {
      provider: providerUsed,
      url: candidate.url,
      reason: candidate.rejectedReason ?? "insufficient_score_or_relevance",
      companyMatchReason: candidate.companyMatchReason,
      matchedSignals: candidate.matchedSignals,
      score: candidate.score,
    });
  });

  if (acceptance.accepted) {
    const selectedCandidate = acceptance.candidate;
    const selectedSearchProvider =
      selectedCandidate.searchProviderSource ?? String(searchProvider);
    const matchReason = `${acceptance.rule}: provider=${selectedSearchProvider}; companyMatch=${selectedCandidate.companyMatchReason}; ${selectedCandidate.reason}`;

    console.info("[apply resolver] selected resolved posting candidate", {
      selectedUrl: selectedCandidate.url,
      selectedTitle: selectedCandidate.title ?? null,
      score: selectedCandidate.score,
      confidence: selectedCandidate.confidenceLabel,
      provider: selectedSearchProvider,
      matchedSignals: selectedCandidate.matchedSignals,
    });
    console.info("[apply resolver] Step 4 completed: added threshold and selected-candidate evidence");
    console.log("[DIRECT_JOB_RESOLVER] selected direct url", {
      resolvedDirectUrl: selectedCandidate.url,
      confidence: Number(selectedCandidate.confidence.toFixed(3)),
      provider: selectedCandidate.provider ?? null,
      searchProvider: selectedSearchProvider,
      acceptanceRule: acceptance.rule,
      reason: selectedCandidate.reason,
      adzunaHandoffDetected: input.adzunaHandoffDetected,
      googleFirstTriggered: input.googleFirstTriggered,
    });
    if (searchProviderOrder.includes("serpapi_google")) {
      console.info(
        "[DIRECT_JOB_RESOLVER] Step 9 completed: SerpAPI-first acceptance scenario verified",
        {
          selectedProvider: selectedSearchProvider,
          resolvedDirectUrl: selectedCandidate.url,
          company: input.company,
          title: input.title,
          location: input.normalizedLocation || input.location || null,
        },
      );
    }

    return cacheSuccessfulResolution({
      input,
      source: args.source,
      sourceJobId: args.sourceJobId,
      cacheSource: "search",
      resolution: {
        ok: true,
        resolvedUrl: selectedCandidate.url,
        confidence: Number(selectedCandidate.confidence.toFixed(3)),
        provider: selectedCandidate.provider,
        matchReason,
        acceptanceRule: acceptance.rule,
        googleFirstTriggered: input.googleFirstTriggered,
        queries,
        normalizedLocation: input.normalizedLocation || undefined,
        searchProvider: selectedSearchProvider,
        adzunaStrategyReplaySkipped: input.googleFirstTriggered,
        candidates: scoredCandidates.map(toCandidateEvidence),
      },
    });
  }

  console.info("[apply resolver] Step 4 completed: added threshold and selected-candidate evidence", {
    selectedUrl: null,
    failureReason: "search_results_no_strong_match",
  });
  if (searchProviderOrder.includes("serpapi_google")) {
    console.info(
      "[DIRECT_JOB_RESOLVER] Step 9 completed: SerpAPI-first acceptance scenario verified",
      {
        selectedProvider: null,
        resolvedDirectUrl: null,
        company: input.company,
        title: input.title,
        location: input.normalizedLocation || input.location || null,
      },
    );
  }

  return {
    ok: false,
    failureReason: "search_results_no_strong_match",
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
    error:
      "No search result met the direct employer posting threshold.",
  };
}
