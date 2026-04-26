import {
  isAggregatorHandoffUrl,
  isLikelyAtsUrl,
  isLikelyCompanyCareersUrl,
  isSearchResultsUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

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

const THIRD_PARTY_SOURCE_PATTERNS = [
  "adzuna",
  "equest",
  "appcast",
  "ziprecruiter",
  "indeed",
  "glassdoor",
  "linkedin",
  "monster",
  "careerbuilder",
  "jooble",
  "simplyhired",
  "talent.com",
  "talent",
  "external",
  "aggregator",
] as const;

const KNOWN_COMPANY_FAMILIES = [
  {
    id: "rtx",
    aliases: [
      "rtx",
      "raytheon",
      "raytheon technologies",
      "raytheon technologies corporation",
    ],
    hostFragments: ["rtx.com", "careers.rtx.com"],
  },
] as const;

type ResolvedUrlCompatibilityArgs = {
  url?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  sourceUrl?: string | null;
};

export type ResolvedUrlCompatibilityResult = {
  compatible: boolean;
  normalizedUrl: string;
  hostname: string;
  matchedSignals: string[];
  reason:
    | "missing_url"
    | "search_results_url"
    | "aggregator_handoff_url"
    | "company_family_mismatch"
    | "company_token_match"
    | "source_host_match"
    | "trusted_ats_or_careers_host"
    | "no_known_company_conflict";
  mismatchFamily?: string;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function parseHostname(value: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(value ?? "");
  if (!normalizedUrl) return "";

  try {
    return new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function tokenizeCompanyName(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !COMPANY_SUFFIXES.has(token) &&
        !/^\d+$/.test(token),
    );
}

function detectCompanyFamily(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;

  return (
    KNOWN_COMPANY_FAMILIES.find((family) =>
      family.aliases.some((alias) => normalized.includes(alias.toLowerCase())),
    ) ?? null
  );
}

function buildUrlCorpus(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname} ${decodeURIComponent(parsed.pathname)}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function getResolvedUrlCompatibility(
  args: ResolvedUrlCompatibilityArgs,
): ResolvedUrlCompatibilityResult {
  const normalizedUrl = normalizeJobUrl(args.url ?? "");
  if (!normalizedUrl) {
    return {
      compatible: false,
      normalizedUrl: "",
      hostname: "",
      matchedSignals: [],
      reason: "missing_url",
    };
  }

  if (isSearchResultsUrl(normalizedUrl)) {
    return {
      compatible: false,
      normalizedUrl,
      hostname: parseHostname(normalizedUrl),
      matchedSignals: [],
      reason: "search_results_url",
    };
  }

  if (isAggregatorHandoffUrl(normalizedUrl)) {
    return {
      compatible: false,
      normalizedUrl,
      hostname: parseHostname(normalizedUrl),
      matchedSignals: [],
      reason: "aggregator_handoff_url",
    };
  }

  const hostname = parseHostname(normalizedUrl);
  const sourceHost = parseHostname(args.sourceUrl);
  const companyTokens = tokenizeCompanyName(args.companyName);
  const currentCompanyFamily = detectCompanyFamily(args.companyName);
  const urlCorpus = buildUrlCorpus(normalizedUrl);
  const matchedSignals: string[] = [];

  const mismatchedFamily =
    KNOWN_COMPANY_FAMILIES.find((family) => {
      const familyDetected =
        family.hostFragments.some(
          (fragment) => hostname === fragment || hostname.endsWith(`.${fragment}`),
        ) ||
        family.aliases.some((alias) => urlCorpus.includes(alias.toLowerCase()));
      if (!familyDetected) return false;

      return currentCompanyFamily?.id !== family.id;
    }) ?? null;

  if (mismatchedFamily) {
    return {
      compatible: false,
      normalizedUrl,
      hostname,
      matchedSignals,
      reason: "company_family_mismatch",
      mismatchFamily: mismatchedFamily.id,
    };
  }

  const companyTokenMatched = companyTokens.some(
    (token) => token.length >= 4 && urlCorpus.includes(token),
  );
  if (companyTokenMatched) {
    matchedSignals.push("company_token_match");
    return {
      compatible: true,
      normalizedUrl,
      hostname,
      matchedSignals,
      reason: "company_token_match",
    };
  }

  if (
    sourceHost &&
    (hostname === sourceHost ||
      hostname.endsWith(`.${sourceHost}`) ||
      sourceHost.endsWith(`.${hostname}`))
  ) {
    matchedSignals.push("source_host_match");
    return {
      compatible: true,
      normalizedUrl,
      hostname,
      matchedSignals,
      reason: "source_host_match",
    };
  }

  if (isLikelyAtsUrl(normalizedUrl) || isLikelyCompanyCareersUrl(normalizedUrl)) {
    matchedSignals.push("trusted_ats_or_careers_host");
    return {
      compatible: true,
      normalizedUrl,
      hostname,
      matchedSignals,
      reason: "trusted_ats_or_careers_host",
    };
  }

  return {
    compatible: true,
    normalizedUrl,
    hostname,
    matchedSignals,
    reason: "no_known_company_conflict",
  };
}

export function isResolvedUrlCompatibleWithJob(
  args: ResolvedUrlCompatibilityArgs,
) {
  return getResolvedUrlCompatibility(args).compatible;
}

export function isThirdPartyJobSource(args: {
  source?: string | null;
  url?: string | null;
}) {
  const source = normalizeText(args.source).toLowerCase();
  const hostname = parseHostname(args.url);
  const combined = `${source} ${hostname}`;

  return THIRD_PARTY_SOURCE_PATTERNS.some((pattern) =>
    combined.includes(pattern),
  );
}

export function isRtxJobContext(args: {
  companyName?: string | null;
  url?: string | null;
}) {
  const family = detectCompanyFamily(args.companyName);
  if (family?.id === "rtx") {
    return true;
  }

  const hostname = parseHostname(args.url);
  return hostname === "rtx.com" || hostname.endsWith(".rtx.com");
}
