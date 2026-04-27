import {
  compareAtsJobIdentityFromUrls,
  extractAtsJobIdentityFromUrl,
} from "@/app/lib/apply/atsUrlIdentity";
import { getResolvedUrlCompatibility } from "@/app/lib/apply/resolvedUrlCompatibility";
import type { ApplySiteStrategyRecord } from "@/app/lib/apply/playwrightStrategyTypes";
import type { JobIdentitySnapshot } from "@/app/lib/jobs/jobIdentity";
import { normalizeJobUrl } from "@/app/lib/jobSources";

export type SavedStrategyCompatibilityReason =
  | "same_provider_same_job"
  | "same_greenhouse_token"
  | "same_company_family"
  | "company_family_mismatch"
  | "provider_mismatch"
  | "host_mismatch"
  | "ats_token_mismatch"
  | "unknown";

export type SavedStrategyCompatibilityResult = {
  compatible: boolean;
  reason: SavedStrategyCompatibilityReason;
  severity: "allow" | "steps_only" | "reject";
  selectedProvider?: string | null;
  strategyProvider?: string | null;
  selectedToken?: string | null;
  strategyToken?: string | null;
  selectedHost?: string | null;
  strategyHost?: string | null;
  rejectedUrl?: string | null;
};

function normalizeUrlOrHost(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = normalizeJobUrl(raw);
  if (normalized) return normalized;
  return raw.includes(".") ? `https://${raw.replace(/^https?:\/\//, "")}` : "";
}

function parseHost(value: string | null | undefined) {
  const normalized = normalizeUrlOrHost(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostsEquivalentOrSubdomain(left: string | null | undefined, right: string | null | undefined) {
  const lhs = String(left ?? "").toLowerCase();
  const rhs = String(right ?? "").toLowerCase();
  if (!lhs || !rhs) return false;
  return lhs === rhs || lhs.endsWith(`.${rhs}`) || rhs.endsWith(`.${lhs}`);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map(normalizeUrlOrHost).filter(Boolean))];
}

function strategyUrls(strategy: ApplySiteStrategyRecord, strategyStartUrl?: string | null) {
  return unique([
    strategyStartUrl,
    strategy.finalUrl,
    strategy.lastTrainedUrl,
    strategy.destinationHost,
    strategy.sourceHost,
    strategy.hostname,
  ]);
}

function isTrustedGenericAtsHost(host: string) {
  return (
    host.includes("greenhouse.io") ||
    host.includes("lever.co") ||
    host.includes("ashbyhq.com") ||
    host.includes("workable.com") ||
    host.includes("workdayjobs.com") ||
    host.includes("myworkdayjobs.com")
  );
}

export function isSavedStrategyCompatibleWithSelectedJob(args: {
  strategy: ApplySiteStrategyRecord;
  strategyStartUrl?: string | null;
  selectedJobIdentity?: JobIdentitySnapshot | null;
  resolvedDirectUrl?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  applyProvider?: string | null;
}): SavedStrategyCompatibilityResult {
  const selectedUrl =
    normalizeUrlOrHost(args.resolvedDirectUrl) ||
    normalizeUrlOrHost(args.selectedJobIdentity?.resolvedApplyUrl) ||
    normalizeUrlOrHost(args.selectedJobIdentity?.jobUrl);
  const selectedIdentity = extractAtsJobIdentityFromUrl(selectedUrl);
  const selectedHost = parseHost(selectedUrl);
  const urls = strategyUrls(args.strategy, args.strategyStartUrl);

  for (const url of urls) {
    const compatibility = getResolvedUrlCompatibility({
      url,
      companyName: args.companyName ?? args.selectedJobIdentity?.company,
      jobTitle: args.jobTitle ?? args.selectedJobIdentity?.title,
      sourceUrl: selectedUrl,
    });
    if (!compatibility.compatible && compatibility.reason === "company_family_mismatch") {
      return {
        compatible: false,
        reason: "company_family_mismatch",
        severity: "reject",
        selectedProvider: selectedIdentity.provider,
        selectedToken: selectedIdentity.token ?? null,
        selectedHost,
        strategyHost: compatibility.hostname,
        rejectedUrl: url,
      };
    }
  }

  const strategyIdentities = urls.map((url) => ({
    url,
    identity: extractAtsJobIdentityFromUrl(url),
    host: parseHost(url),
  }));
  const knownStrategyIdentity = strategyIdentities.find(
    ({ identity }) => identity.provider !== "unknown",
  );

  if (
    selectedIdentity.provider !== "unknown" &&
    knownStrategyIdentity &&
    knownStrategyIdentity.identity.provider !== selectedIdentity.provider
  ) {
    return {
      compatible: false,
      reason: "provider_mismatch",
      severity: "reject",
      selectedProvider: selectedIdentity.provider,
      strategyProvider: knownStrategyIdentity.identity.provider,
      selectedToken: selectedIdentity.token ?? null,
      strategyToken: knownStrategyIdentity.identity.token ?? null,
      selectedHost,
      strategyHost: knownStrategyIdentity.host,
      rejectedUrl: knownStrategyIdentity.url,
    };
  }

  if (selectedUrl) {
    for (const { url, identity, host } of strategyIdentities) {
      const comparison = compareAtsJobIdentityFromUrls(selectedUrl, url);
      if (comparison.comparable && !comparison.matches) {
        return {
          compatible: false,
          reason: "ats_token_mismatch",
          severity:
            comparison.expected.provider === comparison.actual.provider
              ? "steps_only"
              : "reject",
          selectedProvider: comparison.expected.provider,
          strategyProvider: comparison.actual.provider,
          selectedToken: comparison.expected.token ?? null,
          strategyToken: comparison.actual.token ?? null,
          selectedHost,
          strategyHost: host,
          rejectedUrl: url,
        };
      }

      if (
        selectedIdentity.provider !== "unknown" &&
        identity.provider === "unknown" &&
        selectedHost &&
        host &&
        !hostsEquivalentOrSubdomain(selectedHost, host) &&
        !isTrustedGenericAtsHost(host)
      ) {
        return {
          compatible: false,
          reason: "host_mismatch",
          severity: "reject",
          selectedProvider: selectedIdentity.provider,
          strategyProvider: identity.provider,
          selectedToken: selectedIdentity.token ?? null,
          selectedHost,
          strategyHost: host,
          rejectedUrl: url,
        };
      }
    }
  }

  if (
    selectedIdentity.provider === "greenhouse" &&
    selectedIdentity.token &&
    strategyIdentities.some(
      ({ identity }) =>
        identity.provider === "greenhouse" && identity.token === selectedIdentity.token,
    )
  ) {
    return {
      compatible: true,
      reason: "same_greenhouse_token",
      severity: "allow",
      selectedProvider: selectedIdentity.provider,
      strategyProvider: "greenhouse",
      selectedToken: selectedIdentity.token,
      strategyToken: selectedIdentity.token,
      selectedHost,
    };
  }

  return {
    compatible: true,
    reason:
      selectedIdentity.provider !== "unknown" && knownStrategyIdentity
        ? "same_provider_same_job"
        : "same_company_family",
    severity: "allow",
    selectedProvider: selectedIdentity.provider,
    strategyProvider: knownStrategyIdentity?.identity.provider ?? null,
    selectedToken: selectedIdentity.token ?? null,
    strategyToken: knownStrategyIdentity?.identity.token ?? null,
    selectedHost,
    strategyHost: knownStrategyIdentity?.host ?? null,
  };
}
