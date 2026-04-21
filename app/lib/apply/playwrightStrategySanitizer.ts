import { HUMAN_VERIFICATION_CHECKS } from "@/app/lib/apply/playwrightSignals";
import type { ApplySiteStrategyStep } from "@/app/lib/apply/playwrightStrategyTypes";

const SEARCH_ENGINE_HOST_PATTERNS = [
  "google.",
  "bing.",
  "duckduckgo.",
  "search.yahoo.",
  "yahoo.",
];

const SEARCH_ENGINE_TEXT_PATTERNS = [
  "google search",
  "search google",
  "search bing",
  "open google",
  "open bing",
];

const NON_REPLAYABLE_TEXT_PATTERNS = [
  ...HUMAN_VERIFICATION_CHECKS,
  "robot check",
  "i am human",
  "i'm human",
  "not a robot",
  "image challenge",
];

const CONSENT_TEXT_PATTERNS = [
  "accept",
  "agree",
  "allow",
  "consent",
  "cookie",
  "privacy",
];

const MEANINGFUL_CLICK_TEXT_PATTERNS = [
  "apply",
  "continue",
  "submit",
  "next",
  "search",
  "find jobs",
  "view job",
  "view jobs",
  "job details",
  "company site",
  "employer site",
  "careers",
  "see more",
  "show more",
  ...CONSENT_TEXT_PATTERNS,
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function normalizeLooseText(value: string | null | undefined) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function resolveHostname(value: string | null | undefined) {
  const raw = normalizeText(value);
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
  }
}

function containsAny(text: string, patterns: readonly string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function isSearchEngineHost(hostname: string) {
  return SEARCH_ENGINE_HOST_PATTERNS.some((pattern) => hostname.includes(pattern));
}

function buildStepText(step: ApplySiteStrategyStep) {
  return [
    step.selector,
    step.label,
    step.text,
    step.value,
    step.currentUrl,
  ]
    .map((value) => normalizeLooseText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function normalizeStep(step: ApplySiteStrategyStep): ApplySiteStrategyStep {
  return {
    ...step,
    selector: normalizeText(step.selector) || undefined,
    label: normalizeLooseText(step.label) || undefined,
    text: normalizeLooseText(step.text) || undefined,
    value: normalizeLooseText(step.value) || undefined,
    currentUrl: normalizeText(step.currentUrl),
    timestamp: normalizeText(step.timestamp),
  };
}

function inferDestinationHost(args: {
  rawSteps: ApplySiteStrategyStep[];
  sourceHost?: string;
  destinationHost?: string;
  lastTrainedUrl?: string | null;
  finalUrl?: string | null;
}) {
  const explicit =
    resolveHostname(args.destinationHost) ||
    resolveHostname(args.lastTrainedUrl) ||
    resolveHostname(args.finalUrl);
  if (explicit && explicit !== resolveHostname(args.sourceHost)) {
    return explicit;
  }

  for (let index = args.rawSteps.length - 1; index >= 0; index -= 1) {
    const candidate = resolveHostname(args.rawSteps[index]?.currentUrl);
    if (candidate && candidate !== resolveHostname(args.sourceHost)) {
      return candidate;
    }
  }

  return explicit || undefined;
}

function isMeaningfulClick(step: ApplySiteStrategyStep) {
  if (step.type !== "click" && step.type !== "navigation" && step.type !== "goto") {
    return true;
  }

  const text = buildStepText(step);
  if (!text) return false;

  return containsAny(text, MEANINGFUL_CLICK_TEXT_PATTERNS);
}

function buildFieldKey(step: ApplySiteStrategyStep) {
  const anchor =
    normalizeText(step.selector) ||
    normalizeLooseText(step.label) ||
    normalizeLooseText(step.text);

  return `${step.type}::${resolveHostname(step.currentUrl)}::${anchor.toLowerCase()}`;
}

export function sanitizePlaywrightStrategySteps(args: {
  steps?: ApplySiteStrategyStep[] | null;
  sourceHost?: string | null;
  destinationHost?: string | null;
  lastTrainedUrl?: string | null;
  finalUrl?: string | null;
}) {
  const rawSteps = (args.steps ?? [])
    .map(normalizeStep)
    .filter((step): step is ApplySiteStrategyStep => Boolean(step));
  const sourceHost =
    resolveHostname(args.sourceHost) || resolveHostname(rawSteps[0]?.currentUrl);
  const destinationHost = inferDestinationHost({
    rawSteps,
    sourceHost,
    destinationHost: args.destinationHost ?? undefined,
    lastTrainedUrl: args.lastTrainedUrl,
    finalUrl: args.finalUrl,
  });
  const sanitized: ApplySiteStrategyStep[] = [];
  const lastIndexByFieldKey = new Map<string, number>();

  for (const step of rawSteps) {
    const stepHost = resolveHostname(step.currentUrl);
    const stepText = buildStepText(step);

    if (
      isSearchEngineHost(stepHost) ||
      containsAny(stepText, SEARCH_ENGINE_TEXT_PATTERNS)
    ) {
      continue;
    }

    if (containsAny(stepText, NON_REPLAYABLE_TEXT_PATTERNS)) {
      continue;
    }

    if (
      step.type === "click" &&
      !isMeaningfulClick(step) &&
      stepHost === sourceHost &&
      destinationHost &&
      destinationHost !== sourceHost
    ) {
      continue;
    }

    if (
      step.type === "fill" ||
      step.type === "select_option" ||
      step.type === "toggle"
    ) {
      const fieldKey = buildFieldKey(step);
      if (!fieldKey.endsWith("::")) {
        const priorIndex = lastIndexByFieldKey.get(fieldKey);
        if (typeof priorIndex === "number") {
          sanitized[priorIndex] = step;
          continue;
        }

        lastIndexByFieldKey.set(fieldKey, sanitized.length);
      }
    }

    const previousStep = sanitized.at(-1);
    if (
      previousStep &&
      previousStep.type === step.type &&
      previousStep.currentUrl === step.currentUrl &&
      normalizeText(previousStep.selector) === normalizeText(step.selector) &&
      normalizeLooseText(previousStep.text) === normalizeLooseText(step.text) &&
      normalizeLooseText(previousStep.value) === normalizeLooseText(step.value)
    ) {
      continue;
    }

    sanitized.push(step);
  }

  return {
    rawSteps,
    sanitizedSteps: sanitized,
    sourceHost,
    destinationHost,
  };
}
