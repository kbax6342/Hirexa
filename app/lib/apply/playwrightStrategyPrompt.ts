import {
  getStopPageTypeLabel,
  type ApplyStopPageType,
} from "@/app/lib/apply/stopClassification";
import {
  derivePlaywrightStrategyType,
  resolveStrategyHostname,
} from "@/app/lib/apply/playwrightStrategyMatcher";
import type { ApplySiteStrategyType } from "@/app/lib/apply/playwrightStrategyTypes";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function toSentence(value: string) {
  return value.endsWith(".") ? value : `${value}.`;
}

function isRtxContextHost(hostname: string) {
  const value = normalizeText(hostname).toLowerCase();
  if (!value) return false;
  return (
    value.includes("rtx.com") ||
    value.includes("careers.rtx.com") ||
    value.includes("workdayjobs.com") ||
    value.includes("myworkdayjobs.com")
  );
}

export function derivePlaywrightStrategyInstruction(args: {
  sourceHost?: string | null;
  destinationHost?: string | null;
  pageType?: ApplyStopPageType | string | null;
  strategyType?: ApplySiteStrategyType | string | null;
  stopReason?: string | null;
}) {
  const sourceHost = resolveStrategyHostname(args.sourceHost);
  const destinationHost = resolveStrategyHostname(args.destinationHost);
  const pageType = normalizeText(args.pageType).toLowerCase();
  const strategyType =
    normalizeText(args.strategyType) ||
    derivePlaywrightStrategyType({
      sourceHost,
      destinationHost,
      pageType,
      stopReason: args.stopReason,
    });
  const rtxContext =
    isRtxContextHost(sourceHost) || isRtxContextHost(destinationHost);

  if (rtxContext) {
    return toSentence(
      "For RTX careers flows, use only safe on-site steps (accept cookies, allow, apply now, apply manually, continue) and pause immediately for verification prompts",
    );
  }

  if (strategyType === "aggregator_handoff") {
    return toSentence(
      `When the source page is an aggregator with no direct apply CTA, continue only on the resolved employer/ATS posting page. Never replay CAPTCHA or human-verification steps`,
    );
  }

  if (strategyType === "verification_blocker") {
    return toSentence(
      "When the employer site asks for verification, pause for a human step and do not replay CAPTCHA or robot-check actions",
    );
  }

  if (pageType === "application_form" || strategyType === "direct_apply") {
    return toSentence(
      "Reuse the safe recorded employer-site steps, keep navigation direct, and skip noisy repeated field edits or verification steps",
    );
  }

  return toSentence(
    "Reuse the safe recorded flow, avoid search engines and verification pages, and continue only with replay-safe employer or ATS actions",
  );
}

export function buildPlaywrightAutomationPrompt(args: {
  sourceHost?: string | null;
  destinationHost?: string | null;
  pageType?: ApplyStopPageType | string | null;
  strategyType?: ApplySiteStrategyType | string | null;
  derivedInstruction: string;
}) {
  const pageTypeLabel = getStopPageTypeLabel(
    (normalizeText(args.pageType) || "unknown") as ApplyStopPageType,
  );
  const sourceHost = resolveStrategyHostname(args.sourceHost) || "unknown";
  const destinationHost =
    resolveStrategyHostname(args.destinationHost) || "unknown";
  const strategyType =
    normalizeText(args.strategyType) ||
    derivePlaywrightStrategyType({
      sourceHost,
      destinationHost,
      pageType: args.pageType,
    });
  const rtxContext =
    isRtxContextHost(sourceHost) || isRtxContextHost(destinationHost);

  const lines = [
    `Current page classification: ${pageTypeLabel}`,
    `Source host: ${sourceHost}`,
    `Destination host: ${destinationHost}`,
    `Strategy type: ${strategyType}`,
    `Learned rule: ${toSentence(normalizeText(args.derivedInstruction))}`,
    "Forbidden actions: during strategy replay, do not use Google/Bing or any search engine; do not replay CAPTCHA, Cloudflare, robot-check, or human-verification steps; do not preserve noisy repeated field edits.",
    "Routing note: destination routing may use Ecosia before replay starts, but replay itself must stay on employer/ATS pages only.",
    "Structured search guidance: if navigation is needed, use the employer or ATS site directly and use only on-site search/apply controls.",
    "Stop conditions: stop and wait for a human if login, verification, or another non-replayable blocker appears.",
  ];

  if (rtxContext) {
    lines.push(
      "RTX-specific guidance: safe actions include Accept Cookies, Allow, Apply Now, Apply Manually, and Continue on RTX/Workday pages. If signals like Just a moment, Press & Hold, Verify you are human, or Cloudflare appear, stop with verification required.",
    );
  }

  return lines.join("\n");
}
