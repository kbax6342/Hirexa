import { normalizeHostname } from "@/app/lib/apply/jobSearchProvider";
import { normalizeJobUrl } from "@/app/lib/jobSources";

const COMPANY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "company",
  "co",
  "group",
  "holdings",
]);

const COMPANY_ALIAS_MAP: Array<{
  canonical: string;
  aliases: string[];
}> = [
  {
    canonical: "western governors university",
    aliases: ["wgu", "western governors university"],
  },
  {
    canonical: "raytheon technologies",
    aliases: ["rtx", "raytheon", "raytheon technologies"],
  },
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function resolveCompanyAliases(company: string) {
  const normalized = normalizeText(company);
  if (!normalized) return [];

  const hit = COMPANY_ALIAS_MAP.find((entry) => {
    if (entry.canonical === normalized) return true;
    return entry.aliases.some((alias) => normalizeText(alias) === normalized);
  });

  if (!hit) return [];
  return dedupe(hit.aliases.map((alias) => normalizeText(alias)));
}

export function normalizeCompanyName(name: string): string {
  const baseTokens = normalizeText(name).split(" ").filter(Boolean);
  if (baseTokens.length === 0) return "";

  const normalizedTokens = baseTokens.filter((token, index, allTokens) => {
    if (COMPANY_SUFFIXES.has(token)) return false;
    if (token === "university") {
      return allTokens.length <= 2;
    }
    if (token === "the" && index === 0 && allTokens.length > 1) return false;
    return true;
  });

  const finalTokens = normalizedTokens.length > 0 ? normalizedTokens : baseTokens;
  return dedupe(finalTokens).join(" ");
}

export function companyNameTokens(name: string): string[] {
  const normalized = normalizeCompanyName(name);
  const aliases = resolveCompanyAliases(name);
  const aliasTokens = aliases.flatMap((alias) => alias.split(" ").filter(Boolean));
  return dedupe([...normalized.split(" ").filter(Boolean), ...aliasTokens]);
}

function buildUrlText(url: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(String(url ?? ""));
  if (!normalizedUrl) return "";

  try {
    const parsed = new URL(normalizedUrl);
    return normalizeText(
      `${parsed.hostname.replace(/\./g, " ")} ${decodeURIComponent(parsed.pathname)}`,
    );
  } catch {
    return normalizeText(normalizedUrl);
  }
}

function tokenMatches(token: string, corpus: string) {
  if (!token || !corpus) return false;
  if (corpus.includes(token)) return true;
  return false;
}

export function scoreCompanyMatch(input: {
  company: string;
  resultTitle?: string | null;
  resultSnippet?: string | null;
  resultUrl?: string | null;
  displayedUrl?: string | null;
}): {
  score: number;
  matched: boolean;
  reason: string;
} {
  const company = normalizeCompanyName(input.company);
  const tokens = companyNameTokens(input.company);
  const aliases = resolveCompanyAliases(input.company);
  const titleText = normalizeText(input.resultTitle);
  const snippetText = normalizeText(input.resultSnippet);
  const displayedUrlText = normalizeText(input.displayedUrl);
  const resultUrlText = buildUrlText(input.resultUrl);
  const hostname = normalizeHostname(String(input.resultUrl ?? ""));
  const combinedText = [titleText, snippetText, displayedUrlText, resultUrlText]
    .filter(Boolean)
    .join(" ");

  let score = 0;
  const reasonParts: string[] = [];

  if (company && (titleText.includes(company) || snippetText.includes(company))) {
    score += 50;
    reasonParts.push("exact_company_text_match");
  }

  if (company && (displayedUrlText.includes(company) || resultUrlText.includes(company))) {
    score += 50;
    reasonParts.push("exact_company_url_match");
  }

  const majorTokens = tokens.filter((token) => token.length >= 3);
  const matchedMajorTokenCount = majorTokens.filter((token) =>
    tokenMatches(token, combinedText),
  ).length;
  if (majorTokens.length > 0 && matchedMajorTokenCount === majorTokens.length) {
    score += 35;
    reasonParts.push("all_major_tokens_match");
  } else if (matchedMajorTokenCount > 0) {
    score += Math.min(10, matchedMajorTokenCount * 5);
    reasonParts.push("partial_token_match");
  }

  const aliasMatched = aliases.find((alias) => tokenMatches(alias, combinedText));
  if (aliasMatched) {
    score += 45;
    reasonParts.push(`alias_match:${aliasMatched}`);
  }

  const atsTenantMatched = aliases.find((alias) => {
    const tenant = alias.replace(/\s+/g, "").toLowerCase();
    if (!tenant || !hostname) return false;
    return hostname === tenant || hostname.startsWith(`${tenant}.`) || hostname.includes(`.${tenant}.`);
  });
  if (atsTenantMatched) {
    score += 45;
    reasonParts.push(`ats_tenant_alias_match:${atsTenantMatched}`);
  }

  const weakSingleTokenHit =
    score < 40 &&
    tokens.some((token) => token.length >= 3 && tokenMatches(token, combinedText));
  if (weakSingleTokenHit) {
    score += 8;
    reasonParts.push("weak_single_token_match");
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  return {
    score: boundedScore,
    matched: boundedScore >= 40,
    reason: reasonParts.join("; ") || "no_company_match",
  };
}

