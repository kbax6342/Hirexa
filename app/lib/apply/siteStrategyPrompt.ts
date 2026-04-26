import type {
  ApplySiteStrategyRecord,
  ApplySiteStrategyStep,
} from "@/app/lib/apply/playwrightStrategyTypes";

export type ApplySiteStrategyPromptGenerationStatus =
  | "needs_recorded_steps"
  | "ready"
  | "generated";

type PromptGenerationStatusResult = {
  key: ApplySiteStrategyPromptGenerationStatus;
  label: "Needs recorded steps" | "Ready" | "Generated";
};

type BuildApplySiteStrategyCodexPromptOptions = {
  replaySafeSteps?: ApplySiteStrategyStep[] | null;
  rawRecordedSteps?: ApplySiteStrategyStep[] | null;
  filesToInspect?: string[];
  acceptanceChecklist?: string[];
};

const DEFAULT_FILES_TO_INSPECT = [
  "app/lib/apply/playwrightApply.ts",
  "app/lib/apply/playwrightStrategyRepository.ts",
  "app/lib/apply/playwrightStrategyMatcher.ts",
  "app/lib/apply/stopClassification.ts",
  "app/api/applications/[id]/apply/route.ts",
  "app/api/apply-sessions/[sessionId]/route.ts",
  "app/components/apply/TeachPageDialog.tsx",
  "app/components/apply/SavedStrategyPanel.tsx",
];

const DEFAULT_ACCEPTANCE_CHECKLIST = [
  "Saved strategy detection remains intact for the hostname and stop context.",
  "The learned site behavior is converted into stable, replayable automation without removing generic apply flows.",
  "Recorded CTA text and selectors are used as evidence, but brittle session-specific selectors are not blindly hardcoded.",
  "Manual verification remains a stop/resume point when the site requires human intervention.",
  "No user-specific personal data, cookies, tokens, or hidden values are hardcoded.",
  "Existing apply session polling, stop-point payloads, and response contract remain intact.",
  "Existing fallback behavior still works when the saved strategy is missing, stale, or incomplete.",
  "Dev-only logs show whether the saved strategy was detected, replayed, or converted for this hostname.",
];

function normalizeText(value: string | null | undefined, maxLength = 2000) {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function dedupeLines(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean)),
  );
}

function parseHostname(value: string | null | undefined) {
  const raw = normalizeText(value, 1600);
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

function getStrategySteps(
  strategy: ApplySiteStrategyRecord,
  options?: BuildApplySiteStrategyCodexPromptOptions,
) {
  const replaySafeSteps =
    options?.replaySafeSteps ?? strategy.steps ?? strategy.sanitizedSteps ?? [];
  const rawRecordedSteps =
    options?.rawRecordedSteps ??
    strategy.rawSteps ??
    strategy.steps ??
    strategy.sanitizedSteps ??
    [];

  return {
    replaySafeSteps,
    rawRecordedSteps,
  };
}

function getPromptSummary(strategy: ApplySiteStrategyRecord) {
  return (
    normalizeText(strategy.aiSummary, 1200) ||
    normalizeText(strategy.derivedInstruction, 1200)
  );
}

function getSupportedStopReasons(strategy: ApplySiteStrategyRecord) {
  return dedupeLines([strategy.stopReason, ...(strategy.supportedReasons ?? [])]);
}

function getStatusLabel(status: ApplySiteStrategyRecord["status"]) {
  switch (status) {
    case "tested_once":
      return "Tested once";
    case "working":
      return "Working";
    case "unstable":
      return "Unstable";
    case "draft":
    default:
      return "Draft";
  }
}

function inferSiteBehaviorLines(args: {
  strategy: ApplySiteStrategyRecord;
  replaySafeSteps: ApplySiteStrategyStep[];
  rawRecordedSteps: ApplySiteStrategyStep[];
}) {
  const stepPool =
    args.rawRecordedSteps.length > 0 ? args.rawRecordedSteps : args.replaySafeSteps;
  const stepText = stepPool
    .map((step) =>
      [
        step.type,
        step.label,
        step.text,
        step.selector,
        step.currentUrl,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    )
    .join("\n");
  const savedHost = parseHostname(args.strategy.finalUrl || args.strategy.hostname);
  const trainedHost = parseHostname(
    args.strategy.lastTrainedUrl ??
      args.rawRecordedSteps.at(-1)?.currentUrl ??
      args.replaySafeSteps.at(-1)?.currentUrl,
  );
  const lines = [
    "Review the saved steps in order and convert the observed flow into hostname-specific automation only where the site behavior is repeatable.",
    "Identify repeatable selectors, visible button text, and navigation transitions before adding any site-specific handling.",
    "Avoid hardcoding one user's personal data, hidden form values, cookies, tokens, or account-specific identifiers.",
    "Prefer safe, replayable actions and preserve the generic apply automation path for all other sites.",
  ];

  if (
    stepText.includes("apply") ||
    stepText.includes("continue to application") ||
    stepText.includes("apply manually")
  ) {
    lines.push(
      "Support the observed Apply / Continue handoff sequence and preserve the order shown in the recorded evidence.",
    );
  }

  if (
    stepText.includes("allow") ||
    stepText.includes("accept") ||
    stepText.includes("cookie") ||
    stepText.includes("consent")
  ) {
    lines.push(
      "Handle consent or cookie prompts before trying the primary apply CTA when the saved evidence shows they block progression.",
    );
  }

  if (
    stepPool.some(
      (step) =>
        step.type === "fill" ||
        step.type === "select_option" ||
        step.type === "toggle",
    )
  ) {
    lines.push(
      "Keep any recorded form interaction generic and replay-safe; never hardcode user-specific text input or secrets.",
    );
  }

  if (savedHost && trainedHost && savedHost !== trainedHost) {
    lines.push(
      `Preserve the external handoff from ${savedHost} to ${trainedHost} when it is part of the expected apply flow.`,
    );
  }

  if (
    args.strategy.stopReason.toLowerCase().includes("verification") ||
    args.strategy.stopReason.toLowerCase().includes("human")
  ) {
    lines.push(
      "Keep manual verification as a clean stop/resume point instead of treating verification gates as successful submission.",
    );
  }

  return dedupeLines(lines);
}

export function redactStrategyStepValue(value: string | null | undefined) {
  const normalized = normalizeText(value, 500);
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  if (
    lower.includes("token") ||
    lower.includes("cookie") ||
    lower.includes("authorization") ||
    lower.includes("bearer") ||
    lower.includes("session") ||
    lower.includes("secret") ||
    lower.includes("api_key") ||
    lower.includes("apikey")
  ) {
    return "[redacted sensitive value]";
  }

  if (normalized.includes("@")) {
    return "[redacted email value]";
  }

  if (/^\+?[\d()\-\s]{7,}$/.test(normalized)) {
    return "[redacted phone or numeric value]";
  }

  if (
    normalized.length >= 24 &&
    /^[A-Za-z0-9._\-:/=+]+$/.test(normalized)
  ) {
    return "[redacted token-like value]";
  }

  if (/^\d+$/.test(normalized)) {
    return "[redacted numeric value]";
  }

  return "[redacted user-provided value]";
}

export function formatStrategyStepForPrompt(
  step: ApplySiteStrategyStep,
  index: number,
) {
  const lines = [`${index + 1}. type: ${step.type}`];
  const label = normalizeText(step.label, 240);
  const selector = normalizeText(step.selector, 800);
  const text = normalizeText(step.text, 400);
  const redactedValue = redactStrategyStepValue(step.value);
  const currentUrl = normalizeText(step.currentUrl, 1600) || "(unavailable)";

  if (label) {
    lines.push(`   label: ${label}`);
  }

  if (selector) {
    lines.push(`   selector: ${selector}`);
  }

  if (text) {
    lines.push(`   text: ${text}`);
  }

  if (redactedValue) {
    lines.push(`   value: ${redactedValue}`);
  }

  if (typeof step.checked === "boolean") {
    lines.push(`   checked: ${String(step.checked)}`);
  }

  lines.push(`   currentUrl: ${currentUrl}`);

  return lines.join("\n");
}

export function getPromptGenerationStatus(
  strategy: Pick<
    ApplySiteStrategyRecord,
    "steps" | "rawSteps" | "sanitizedSteps"
  > | null | undefined,
  options?: {
    generated?: boolean;
    replaySafeSteps?: ApplySiteStrategyStep[] | null;
    rawRecordedSteps?: ApplySiteStrategyStep[] | null;
  },
): PromptGenerationStatusResult {
  if (!strategy) {
    return {
      key: "needs_recorded_steps",
      label: "Needs recorded steps",
    };
  }

  const replaySafeSteps =
    options?.replaySafeSteps ?? strategy.steps ?? strategy.sanitizedSteps ?? [];
  const rawRecordedSteps =
    options?.rawRecordedSteps ??
    strategy.rawSteps ??
    strategy.steps ??
    strategy.sanitizedSteps ??
    [];
  const hasSteps = replaySafeSteps.length > 0 || rawRecordedSteps.length > 0;

  if (options?.generated) {
    return {
      key: "generated",
      label: "Generated",
    };
  }

  if (!hasSteps) {
    return {
      key: "needs_recorded_steps",
      label: "Needs recorded steps",
    };
  }

  return {
    key: "ready",
    label: "Ready",
  };
}

export function buildApplySiteStrategyCodexPrompt(
  strategy: ApplySiteStrategyRecord,
  options?: BuildApplySiteStrategyCodexPromptOptions,
) {
  const { replaySafeSteps, rawRecordedSteps } = getStrategySteps(strategy, options);
  const lastTrainedUrl =
    normalizeText(
      strategy.lastTrainedUrl ??
        rawRecordedSteps.at(-1)?.currentUrl ??
        replaySafeSteps.at(-1)?.currentUrl,
      1600,
    ) || "(unavailable)";
  const supportedReasons = getSupportedStopReasons(strategy);
  const summary = getPromptSummary(strategy);
  const siteBehaviorLines = inferSiteBehaviorLines({
    strategy,
    replaySafeSteps,
    rawRecordedSteps,
  });
  const filesToInspect = options?.filesToInspect ?? DEFAULT_FILES_TO_INSPECT;
  const acceptanceChecklist =
    options?.acceptanceChecklist ?? DEFAULT_ACCEPTANCE_CHECKLIST;

  return [
    `Improve apply automation strategy for ${strategy.hostname}`,
    "",
    "Objective",
    `Convert the saved strategy for ${strategy.hostname} into a stable apply automation improvement while preserving the current response contract, existing generic automation paths, and existing apply session behavior.`,
    "",
    "Observed saved strategy",
    `- Hostname: ${strategy.hostname}`,
    `- Final saved URL: ${normalizeText(strategy.finalUrl, 1600) || "(unavailable)"}`,
    `- Last trained URL: ${lastTrainedUrl}`,
    `- Stop reason: ${normalizeText(strategy.stopReason, 300) || "(unavailable)"}`,
    `- Last action: ${normalizeText(strategy.lastAction, 300) || "(unavailable)"}`,
    `- Supported stop reasons: ${supportedReasons.join(", ") || "(none recorded)"}`,
    `- Strategy status: ${getStatusLabel(strategy.status)} (${strategy.status})`,
    `- Success count: ${strategy.successCount}`,
    `- Failure count: ${strategy.failureCount}`,
    `- Instructions: ${normalizeText(strategy.instructions, 2000) || "(none recorded)"}`,
    `- Selector notes: ${normalizeText(strategy.selectors, 2000) || "(none recorded)"}`,
    `- Replay-safe steps count: ${replaySafeSteps.length}`,
    `- Raw recorded steps count: ${rawRecordedSteps.length}`,
    summary ? `- Generated summary: ${summary}` : null,
    "",
    "Recorded replay-safe steps",
    ...(replaySafeSteps.length > 0
      ? replaySafeSteps.map((step, index) => formatStrategyStepForPrompt(step, index))
      : ["- No replay-safe steps were saved."]),
    "",
    "Recorded raw steps",
    ...(rawRecordedSteps.length > 0
      ? rawRecordedSteps.map((step, index) => formatStrategyStepForPrompt(step, index))
      : ["- No raw recorded steps were saved."]),
    "",
    "Site-specific behavior to support",
    ...siteBehaviorLines.map((line) => `- ${line}`),
    "",
    "Implementation rules",
    "- Review the saved steps before changing automation behavior for this hostname.",
    "- Identify repeatable selectors and visible button text before adding any hostname-specific handling.",
    "- Create or update hostname-specific handling only where the saved strategy shows stable site behavior.",
    "- Avoid hardcoding one user's personal data, credentials, cookies, tokens, localStorage values, or hidden form values.",
    "- Keep manual verification as a stop/resume point when needed.",
    "- Prefer safe, replayable actions and preserve existing fallback behavior.",
    "- Keep existing apply session polling and stop-point payloads intact.",
    "- Add dev-only logs showing whether the saved strategy was detected, replayed, or converted.",
    "- Do not remove existing generic automation paths.",
    "",
    "Manual verification / stop-point behavior",
    "- If the site still requires verification, stop cleanly with the latest real browser URL and preserve the existing resume path.",
    "- Do not bypass CAPTCHA, Cloudflare, or human verification challenges.",
    "- Preserve the current stop classification and latest real URL behavior when manual intervention is required.",
    "",
    "Logging requirements",
    '- Add development-only logs that state whether the hostname-specific saved strategy was detected, replayed, converted, or skipped.',
    "- Include hostname, relevant final URL, stop reason, and replay step count in those logs.",
    "",
    "Acceptance checklist",
    ...acceptanceChecklist.map((item) => `- ${item}`),
    "",
    "Files to inspect/edit",
    ...filesToInspect.map((filePath) => `- ${filePath}`),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
