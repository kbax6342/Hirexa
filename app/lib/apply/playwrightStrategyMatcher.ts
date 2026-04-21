import { normalizeJobUrl } from "@/app/lib/jobSources";
import {
  isAggregatorStopHostname,
  type ApplyStopPageType,
} from "@/app/lib/apply/stopClassification";
import {
  isKnownAssetHostname,
  isSearchEngineHostname,
  validateAutomationStartUrl,
} from "@/app/lib/apply/urlValidation";
import type {
  ApplySiteStrategyRecord,
  ApplySiteStrategyType,
} from "@/app/lib/apply/playwrightStrategyTypes";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function normalizeToken(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function resolveStrategyHostname(value: string | null | undefined) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const validation = validateAutomationStartUrl(raw, {
    rejectAggregator: false,
    rejectSearchEngine: false,
  });
  const parsedHostname = validation.hostname
    ? validation.hostname.toLowerCase()
    : raw
        .replace(/::.*$/, "")
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .trim()
        .toLowerCase();

  if (!parsedHostname) return "";
  if (isKnownAssetHostname(parsedHostname)) return "";
  if (isSearchEngineHostname(parsedHostname)) return "";

  return parsedHostname;
}

export function derivePlaywrightStrategyType(args: {
  sourceHost?: string | null;
  destinationHost?: string | null;
  pageType?: ApplyStopPageType | string | null;
  stopReason?: string | null;
}) {
  const sourceHost = resolveStrategyHostname(args.sourceHost);
  const destinationHost = resolveStrategyHostname(args.destinationHost);
  const pageType = normalizeText(args.pageType).toLowerCase();
  const stopReason = normalizeText(args.stopReason).toLowerCase();

  if (
    stopReason === "verification_required" ||
    pageType === "auth_gate"
  ) {
    return "verification_blocker" satisfies ApplySiteStrategyType;
  }

  if (
    isAggregatorStopHostname(sourceHost) &&
    Boolean(destinationHost) &&
    destinationHost !== sourceHost
  ) {
    return "aggregator_handoff" satisfies ApplySiteStrategyType;
  }

  if (pageType === "application_form" || pageType === "employer_site") {
    return "direct_apply" satisfies ApplySiteStrategyType;
  }

  return "generic_navigation" satisfies ApplySiteStrategyType;
}

export function buildApplySiteStrategyKey(args: {
  sourceHost?: string | null;
  destinationHost?: string | null;
  strategyType?: string | null;
  pageType?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  location?: string | null;
}) {
  const sourceHost = resolveStrategyHostname(args.sourceHost) || "unknown-source";
  const destinationHost =
    resolveStrategyHostname(args.destinationHost) || "unknown-destination";
  const strategyType = normalizeToken(args.strategyType) || "generic-navigation";
  const pageType = normalizeToken(args.pageType) || "unknown";
  const company = normalizeToken(args.company);
  const jobTitle = normalizeToken(args.jobTitle);
  const location = normalizeToken(args.location);

  return [
    sourceHost,
    destinationHost,
    strategyType,
    pageType,
    company || "any-company",
    jobTitle || "any-title",
    location || "any-location",
  ].join("::");
}

function pickReplayUrlFromSteps(strategy: ApplySiteStrategyRecord) {
  const sanitizedSteps = strategy.sanitizedSteps ?? strategy.steps ?? [];

  for (const step of sanitizedSteps) {
    const candidateUrl = normalizeJobUrl(step.currentUrl);
    const validation = validateAutomationStartUrl(candidateUrl, {
      rejectAggregator: true,
      rejectSearchEngine: true,
    });
    const candidateHost = resolveStrategyHostname(candidateUrl);
    const sourceHost = resolveStrategyHostname(strategy.sourceHost ?? strategy.hostname);

    if (
      candidateUrl &&
      validation.isValid &&
      candidateHost &&
      candidateHost !== sourceHost
    ) {
      return candidateUrl;
    }
  }

  return null;
}

export function pickStrategyStartUrl(strategy: ApplySiteStrategyRecord) {
  const candidates = [
    normalizeJobUrl(strategy.finalUrl ?? ""),
    pickReplayUrlFromSteps(strategy),
    normalizeJobUrl(strategy.lastTrainedUrl ?? ""),
  ].filter(Boolean);
  const picked = candidates.find((candidate) =>
    validateAutomationStartUrl(candidate, {
      rejectAggregator: true,
      rejectSearchEngine: true,
    }).isValid,
  );

  return picked || null;
}

function scoreStrategy(args: {
  strategy: ApplySiteStrategyRecord;
  sourceHost?: string;
  destinationHost?: string;
  pageType?: string;
  strategyType?: string;
  company?: string;
  location?: string;
}) {
  const strategySourceHost = resolveStrategyHostname(
    args.strategy.sourceHost ?? args.strategy.hostname,
  );
  const strategyDestinationHost = resolveStrategyHostname(
    args.strategy.destinationHost,
  );
  const strategyPageType = normalizeText(args.strategy.pageType).toLowerCase();
  const strategyType = normalizeText(args.strategy.strategyType).toLowerCase();
  const strategyCompany = normalizeToken(args.strategy.company);
  const strategyLocation = normalizeToken(args.strategy.location);
  let score = 0;

  if (args.sourceHost && strategySourceHost === args.sourceHost) {
    score += 90;
  } else if (args.sourceHost && strategySourceHost && args.sourceHost.includes(strategySourceHost)) {
    score += 40;
  }

  if (args.destinationHost && strategyDestinationHost === args.destinationHost) {
    score += 70;
  }

  if (args.pageType && strategyPageType === args.pageType) {
    score += 30;
  }

  if (args.strategyType && strategyType === args.strategyType) {
    score += 35;
  }

  if (args.company && strategyCompany && strategyCompany === normalizeToken(args.company)) {
    score += 20;
  }

  if (args.location && strategyLocation && strategyLocation === normalizeToken(args.location)) {
    score += 10;
  }

  score += (args.strategy.successfulReplays ?? args.strategy.successCount ?? 0) * 8;
  score -= (args.strategy.failedReplays ?? args.strategy.failureCount ?? 0) * 5;

  if (args.strategy.lastReplaySucceeded === true) {
    score += 8;
  }

  if (args.strategy.promptGenerationSucceeded) {
    score += 4;
  }

  if ((args.strategy.sanitizedSteps ?? args.strategy.steps ?? []).length > 0) {
    score += 6;
  }

  return score;
}

export function matchPlaywrightStrategy(args: {
  strategies: ApplySiteStrategyRecord[];
  sourceHost?: string | null;
  destinationHost?: string | null;
  pageType?: ApplyStopPageType | string | null;
  strategyType?: ApplySiteStrategyType | string | null;
  company?: string | null;
  location?: string | null;
}) {
  const sourceHost = resolveStrategyHostname(args.sourceHost);
  const destinationHost = resolveStrategyHostname(args.destinationHost);
  const pageType = normalizeText(args.pageType).toLowerCase();
  const strategyType = normalizeText(args.strategyType).toLowerCase();
  const company = normalizeText(args.company) || undefined;
  const location = normalizeText(args.location) || undefined;
  let bestMatch: ApplySiteStrategyRecord | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const strategy of args.strategies) {
    const score = scoreStrategy({
      strategy,
      sourceHost,
      destinationHost,
      pageType,
      strategyType,
      company,
      location,
    });

    if (score > bestScore) {
      bestMatch = strategy;
      bestScore = score;
    }
  }

  return {
    strategy: bestScore >= 60 ? bestMatch : null,
    score: bestScore,
  };
}
