import { getJobLocationMatch, type JobMatchTier } from "@/app/lib/jobs/locationMatch";
import type { Job } from "@/app/lib/jobs/types";

type QueryIntentKind = "generic" | "tech";

type QueryIntent = {
  kind: QueryIntentKind;
  positiveTerms: readonly string[];
  negativeTerms: readonly string[];
};

export type JobRelevanceAnalysis = {
  intent: QueryIntentKind;
  score: number;
  contentScore: number;
  locationScore: number;
  locationTier: JobMatchTier;
  titleQueryMatches: string[];
  contextQueryMatches: string[];
  positiveTitleMatches: string[];
  positiveContextMatches: string[];
  negativeTitleMatches: string[];
  negativeContextMatches: string[];
};

type RelevanceOptions = {
  includeRemote?: boolean;
};

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "job",
  "jobs",
  "of",
  "on",
  "or",
  "position",
  "positions",
  "role",
  "roles",
  "the",
  "to",
  "with",
]);

const TECH_QUERY_TERMS = [
  "tech",
  "technology",
  "software",
  "developer",
  "engineer",
  "engineering",
  "full stack",
  "fullstack",
  "front end",
  "frontend",
  "back end",
  "backend",
  "react",
  "javascript",
  "typescript",
  "java",
  "python",
  "devops",
  "cloud",
  "platform",
  "web",
  "application developer",
  "software engineer",
  "software developer",
  "programmer",
  "servicenow",
  "qa engineer",
  "test engineer",
  "site reliability",
  "sre",
  "solution architect",
  "solutions architect",
  "cloud architect",
] as const;

const TECH_POSITIVE_TERMS = [
  "software",
  "developer",
  "engineer",
  "engineering",
  "full stack",
  "fullstack",
  "front end",
  "frontend",
  "back end",
  "backend",
  "react",
  "javascript",
  "typescript",
  "java",
  "python",
  "devops",
  "cloud",
  "aws",
  "azure",
  "gcp",
  "platform",
  "web",
  "application developer",
  "software engineer",
  "software developer",
  "programmer",
  "servicenow",
  "site reliability",
  "sre",
  "solution architect",
  "solutions architect",
  "cloud architect",
] as const;

const TECH_NEGATIVE_TERMS = [
  "nurse",
  "registered nurse",
  "rn",
  "med surg",
  "telemetry",
  "rehabilitation",
  "acute care",
  "emergency department",
  "cna",
  "lpn",
  "therapist",
  "physician",
  "patient care",
  "clinical",
  "hospital",
  "travel nurse",
] as const;

const TECH_ROLE_TITLE_PATTERN =
  /\b(software|developer|engineer|engineering|architect|devops|platform|cloud|frontend|front end|backend|back end|full stack|fullstack|programmer|servicenow|sre|site reliability)\b/i;

const QUERY_INTENTS: readonly QueryIntent[] = [
  {
    kind: "tech",
    positiveTerms: TECH_POSITIVE_TERMS,
    negativeTerms: TECH_NEGATIVE_TERMS,
  },
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWholeTerm(text: string, term: string) {
  if (!text || !term) return false;

  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;

  const pattern = new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "i");
  return pattern.test(text);
}

function getMatchedTerms(text: string, terms: readonly string[]) {
  return terms.filter((term, index) => {
    if (!hasWholeTerm(text, term)) return false;
    return !terms.slice(0, index).some((other) => normalizeText(other) === normalizeText(term));
  });
}

function tokenizeQuery(query: string) {
  return normalizeText(query)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !QUERY_STOP_WORDS.has(part));
}

function getQueryIntent(query: string): QueryIntent {
  const normalizedQuery = normalizeText(query);

  for (const intent of QUERY_INTENTS) {
    if (TECH_QUERY_TERMS.some((term) => hasWholeTerm(normalizedQuery, term))) {
      return intent;
    }
  }

  return {
    kind: "generic",
    positiveTerms: [],
    negativeTerms: [],
  };
}

function buildTitleText(job: Pick<Job, "title">) {
  return normalizeText(job.title);
}

function buildContextText(
  job: Pick<Job, "description" | "searchText">,
) {
  return normalizeText(
    [job.description, job.searchText]
      .filter(Boolean)
      .join(" "),
  );
}

function getLocationScore(tier: JobMatchTier) {
  switch (tier) {
    case "exact":
      return 18;
    case "nearby":
      return 12;
    case "same_state":
      return 8;
    case "remote":
      return 6;
    case "broader":
      return -8;
    case "none":
    default:
      return -20;
  }
}

function getQueryMatches(text: string, query: string) {
  const queryTerms = tokenizeQuery(query);
  const directPhrase = normalizeText(query);

  const matchedTerms = queryTerms.filter((term) => hasWholeTerm(text, term));

  if (directPhrase && directPhrase.length >= 3 && hasWholeTerm(text, directPhrase)) {
    return [directPhrase, ...matchedTerms.filter((term) => term !== directPhrase)];
  }

  return matchedTerms;
}

export function isTechQuery(query: string) {
  return getQueryIntent(query).kind === "tech";
}

export function analyzeJobRelevance(
  job: Pick<Job, "title" | "description" | "location" | "searchText">,
  query: string,
  location: string | null | undefined,
  options?: RelevanceOptions,
): JobRelevanceAnalysis {
  const intent = getQueryIntent(query);
  const titleText = buildTitleText(job);
  const contextText = buildContextText(job);
  const locationMatch = getJobLocationMatch(
    job,
    location,
    options?.includeRemote ?? true,
  );

  const titleQueryMatches = getQueryMatches(titleText, query);
  const contextQueryMatches = getQueryMatches(contextText, query).filter(
    (term) => !titleQueryMatches.includes(term),
  );
  const positiveTitleMatches = getMatchedTerms(titleText, intent.positiveTerms);
  const positiveContextMatches = getMatchedTerms(contextText, intent.positiveTerms).filter(
    (term) => !positiveTitleMatches.includes(term),
  );
  const negativeTitleMatches = getMatchedTerms(titleText, intent.negativeTerms);
  const negativeContextMatches = getMatchedTerms(contextText, intent.negativeTerms).filter(
    (term) => !negativeTitleMatches.includes(term),
  );

  const queryPhrase = normalizeText(query);
  const hasExactTitlePhrase =
    queryPhrase.length >= 3 && hasWholeTerm(titleText, queryPhrase);
  const hasExactContextPhrase =
    !hasExactTitlePhrase &&
    queryPhrase.length >= 3 &&
    hasWholeTerm(contextText, queryPhrase);
  const hasTechRoleTitle = intent.kind === "tech" && TECH_ROLE_TITLE_PATTERN.test(job.title);

  const contentScore =
    (hasExactTitlePhrase ? 30 : 0) +
    (hasExactContextPhrase ? 12 : 0) +
    titleQueryMatches.length * 16 +
    contextQueryMatches.length * 6 +
    positiveTitleMatches.length * 12 +
    positiveContextMatches.length * 4 +
    (hasTechRoleTitle ? 8 : 0) -
    negativeTitleMatches.length * 18 -
    negativeContextMatches.length * 6;
  const locationScore = getLocationScore(locationMatch.tier);

  return {
    intent: intent.kind,
    score: contentScore + locationScore,
    contentScore,
    locationScore,
    locationTier: locationMatch.tier,
    titleQueryMatches,
    contextQueryMatches,
    positiveTitleMatches,
    positiveContextMatches,
    negativeTitleMatches,
    negativeContextMatches,
  };
}

export function scoreJobRelevance(
  job: Pick<Job, "title" | "description" | "location" | "searchText">,
  query: string,
  location: string | null | undefined,
  options?: RelevanceOptions,
) {
  return analyzeJobRelevance(job, query, location, options).score;
}

export function shouldExcludeJob(
  job: Pick<Job, "title" | "description" | "location" | "searchText">,
  query: string,
  location: string | null | undefined,
  options?: RelevanceOptions,
): { exclude: boolean; reason?: string } {
  const analysis = analyzeJobRelevance(job, query, location, options);

  if (analysis.intent !== "tech") {
    return { exclude: false };
  }

  const positiveSignals =
    analysis.titleQueryMatches.length +
    analysis.contextQueryMatches.length +
    analysis.positiveTitleMatches.length +
    analysis.positiveContextMatches.length;
  const negativeSignals =
    analysis.negativeTitleMatches.length + analysis.negativeContextMatches.length;

  if (
    analysis.negativeTitleMatches.length > 0 &&
    positiveSignals === 0
  ) {
    return { exclude: true, reason: "tech_healthcare_title_mismatch" };
  }

  if (negativeSignals >= 2 && positiveSignals <= 1) {
    return { exclude: true, reason: "tech_healthcare_domain_mismatch" };
  }

  if (analysis.locationTier === "broader" && analysis.contentScore < 26) {
    return { exclude: true, reason: "tech_broader_low_relevance" };
  }

  if (analysis.contentScore < 18) {
    return { exclude: true, reason: "tech_low_relevance" };
  }

  return { exclude: false };
}
