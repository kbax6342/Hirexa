export type RecordedStep = {
  action: string;
  selector?: string;
  text?: string;
  url?: string;
  recordedAt?: string;
};

export type StrategyPromptInput = {
  domain: string;
  startingUrl?: string;
  lastSavedUrl?: string;
  lastTrainedUrl?: string;
  observedFinalUrl?: string;
  stopReason?: string;
  errorMessage?: string;
  replaySafeSteps: RecordedStep[];
  rawRecordedSteps: RecordedStep[];
  generatedAt?: string;
  modelUsed?: string;
  reasoningEffort?: string;
};

type NormalizedRecordedStep = {
  action: string;
  selector?: string;
  text?: string;
  url?: string;
  recordedAt?: string;
};

type NormalizedStrategyPromptInput = {
  domain: string;
  startingUrl: string;
  lastSavedUrl: string;
  lastTrainedUrl: string;
  observedFinalUrl: string;
  stopReason: string;
  errorMessage: string;
  replaySafeSteps: NormalizedRecordedStep[];
  rawRecordedSteps: NormalizedRecordedStep[];
  generatedAt: string;
  modelUsed: string;
  reasoningEffort: string;
  detected: {
    consentSteps: number[];
    applySteps: number[];
    externalHandoff: boolean;
    workdayExternalHandoff: boolean;
    rtxCareersDomain: boolean;
  };
};

export type ParsedGeneratedStrategyPrompt = {
  summary: string;
  codexPrompt: string;
};

function normalizeText(value: string | null | undefined, maxLength = 1200) {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function normalizeStep(step: RecordedStep): NormalizedRecordedStep | null {
  const action = normalizeText(step.action, 180);
  if (!action) return null;

  return {
    action,
    selector: normalizeText(step.selector, 700) || undefined,
    text: normalizeText(step.text, 500) || undefined,
    url: normalizeText(step.url, 1200) || undefined,
    recordedAt: normalizeText(step.recordedAt, 80) || undefined,
  };
}

function normalizeSteps(steps: RecordedStep[] | null | undefined, maxCount = 40) {
  if (!Array.isArray(steps)) return [];

  return steps
    .slice(0, maxCount)
    .map((step) => normalizeStep(step))
    .filter((step): step is NormalizedRecordedStep => Boolean(step));
}

function parseHostname(rawUrl: string) {
  const value = normalizeText(rawUrl, 1600);
  if (!value) return "";

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
  }
}

function isConsentStep(step: NormalizedRecordedStep) {
  const text = `${step.action} ${step.text ?? ""}`.toLowerCase();
  return (
    text.includes("allow") ||
    text.includes("accept") ||
    text.includes("agree") ||
    text.includes("cookie") ||
    text.includes("consent")
  );
}

function isApplyStep(step: NormalizedRecordedStep) {
  const text = `${step.action} ${step.text ?? ""}`.toLowerCase();
  return (
    text.includes("apply now") ||
    text.includes("apply manually") ||
    text.includes(" click apply") ||
    text.endsWith("apply") ||
    text.includes(" apply ")
  );
}

function isWorkdayHost(hostname: string) {
  return hostname.endsWith(".workdayjobs.com") || hostname.endsWith(".myworkdayjobs.com");
}

function formatStepLine(step: NormalizedRecordedStep, index: number) {
  const parts = [
    `${index + 1}. Action: ${step.action}`,
    step.selector ? `Selector: ${step.selector}` : null,
    step.text ? `Visible text: ${step.text}` : null,
    step.url ? `URL: ${step.url}` : null,
    step.recordedAt ? `Recorded at: ${step.recordedAt}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join("\n   ");
}

function inferObservedFinalUrl(args: {
  observedFinalUrl: string;
  lastTrainedUrl: string;
  replaySafeSteps: NormalizedRecordedStep[];
  rawRecordedSteps: NormalizedRecordedStep[];
}) {
  if (args.observedFinalUrl) return args.observedFinalUrl;
  if (args.lastTrainedUrl) return args.lastTrainedUrl;

  const lastRawStep = args.rawRecordedSteps.at(-1);
  if (lastRawStep?.url) return lastRawStep.url;

  const lastReplayStep = args.replaySafeSteps.at(-1);
  return lastReplayStep?.url ?? "";
}

export function normalizeStrategyPromptInput(
  input: StrategyPromptInput,
): NormalizedStrategyPromptInput {
  const replaySafeSteps = normalizeSteps(input.replaySafeSteps, 40);
  const rawRecordedSteps = normalizeSteps(input.rawRecordedSteps, 60);
  const domain = normalizeText(input.domain, 220) || "unknown-domain";
  const startingUrl = normalizeText(input.startingUrl, 1400);
  const lastSavedUrl = normalizeText(input.lastSavedUrl, 1400);
  const lastTrainedUrl = normalizeText(input.lastTrainedUrl, 1400);
  const observedFinalUrl = inferObservedFinalUrl({
    observedFinalUrl: normalizeText(input.observedFinalUrl, 1400),
    lastTrainedUrl,
    replaySafeSteps,
    rawRecordedSteps,
  });
  const stopReason =
    normalizeText(input.stopReason, 260) || "HUMAN_INTERVENTION_REQUIRED";
  const errorMessage = normalizeText(input.errorMessage, 1200);
  const generatedAt = normalizeText(input.generatedAt, 80) || new Date().toISOString();
  const modelUsed = normalizeText(input.modelUsed, 120) || "gpt-5.4";
  const reasoningEffort = normalizeText(input.reasoningEffort, 32) || "high";
  const startHost = parseHostname(startingUrl || lastSavedUrl || domain);
  const observedHost = parseHostname(observedFinalUrl || lastTrainedUrl);
  const rawForClassification = rawRecordedSteps.length > 0 ? rawRecordedSteps : replaySafeSteps;
  const consentSteps = rawForClassification
    .map((step, index) => (isConsentStep(step) ? index + 1 : -1))
    .filter((value) => value > 0);
  const applySteps = rawForClassification
    .map((step, index) => (isApplyStep(step) ? index + 1 : -1))
    .filter((value) => value > 0);
  const externalHandoff =
    Boolean(startHost) &&
    Boolean(observedHost) &&
    startHost !== observedHost;
  const workdayExternalHandoff =
    externalHandoff && Boolean(observedHost) && isWorkdayHost(observedHost);
  const rtxCareersDomain =
    domain.toLowerCase().includes("rtx.com") || startHost.includes("rtx.com");

  return {
    domain,
    startingUrl,
    lastSavedUrl,
    lastTrainedUrl,
    observedFinalUrl,
    stopReason,
    errorMessage,
    replaySafeSteps,
    rawRecordedSteps,
    generatedAt,
    modelUsed,
    reasoningEffort,
    detected: {
      consentSteps,
      applySteps,
      externalHandoff,
      workdayExternalHandoff,
      rtxCareersDomain,
    },
  };
}

function buildStepSection(
  title: string,
  steps: NormalizedRecordedStep[],
  emptyMessage: string,
) {
  if (steps.length === 0) {
    return `${title}\n- ${emptyMessage}`;
  }

  return [
    title,
    ...steps.map((step, index) => formatStepLine(step, index)),
  ].join("\n");
}

function buildSuggestedSelectorLines(context: NormalizedStrategyPromptInput) {
  const suggestions: string[] = [];

  if (context.detected.consentSteps.length > 0) {
    suggestions.push('getByRole("button", { name: /allow/i })');
  }

  if (context.detected.applySteps.length > 0) {
    suggestions.push('getByRole("link", { name: /apply/i })');
    suggestions.push('getByRole("button", { name: /apply/i })');
    suggestions.push('getByText(/apply now|apply/i)');
  }

  return [...new Set(suggestions)];
}

function buildEvidenceLines(context: NormalizedStrategyPromptInput) {
  const evidence = [
    `- Domain: ${context.domain}`,
    `- Starting URL: ${context.startingUrl || "(not provided)"}`,
    `- Last saved URL: ${context.lastSavedUrl || "(not provided)"}`,
    `- Last trained URL: ${context.lastTrainedUrl || "(not provided)"}`,
    `- Observed final URL: ${context.observedFinalUrl || "(not provided)"}`,
    `- Stop reason: ${context.stopReason || "(not provided)"}`,
    `- Error message: ${context.errorMessage || "(none)"}`,
    `- Replay-safe step count: ${context.replaySafeSteps.length}`,
    `- Raw recorded step count: ${context.rawRecordedSteps.length}`,
    context.detected.externalHandoff
      ? `- External handoff detected: yes (${parseHostname(
          context.startingUrl || context.lastSavedUrl || context.domain,
        )} -> ${parseHostname(context.observedFinalUrl || context.lastTrainedUrl)})`
      : "- External handoff detected: no",
  ];

  if (context.detected.workdayExternalHandoff) {
    evidence.push("- This run reached a Workday external apply handoff.");
  }

  if (context.detected.rtxCareersDomain) {
    evidence.push("- RTX careers domain context detected.");
  }

  if (context.detected.consentSteps.length > 0) {
    evidence.push(
      `- Consent/cookie-like steps detected at step(s): ${context.detected.consentSteps.join(
        ", ",
      )}`,
    );
  }

  if (context.detected.applySteps.length > 0) {
    evidence.push(
      `- Apply CTA steps detected at step(s): ${context.detected.applySteps.join(", ")}`,
    );
  }

  return evidence.join("\n");
}

export function buildStrategyPromptSummary(input: StrategyPromptInput) {
  const context = normalizeStrategyPromptInput(input);

  if (context.detected.workdayExternalHandoff && context.detected.rtxCareersDomain) {
    return "RTX careers strategy with Workday external apply handoff evidence.";
  }

  if (context.detected.externalHandoff) {
    return "Apply automation strategy with external handoff evidence and replay-safe steps.";
  }

  return "Apply automation strategy generated from recorded replay-safe steps.";
}

export function buildStrategyPromptSystemInstruction() {
  return [
    "You are generating a paste-ready Codex implementation prompt for a developer working in a Next.js/TypeScript application.",
    "Convert recorded browser automation evidence into a precise implementation prompt.",
    "Separate facts from inferences.",
    "Preserve raw evidence and step order.",
    "Recommend robust selectors before brittle CSS selectors.",
    "Include file paths to inspect/edit.",
    "Include acceptance criteria.",
    "Do not invent facts.",
    "Do not output a vague lesson.",
    "Do not output chain-of-thought or hidden reasoning.",
    "Return ONLY valid JSON with keys summary and codexPrompt.",
  ].join(" ");
}

export function buildStrategyPromptUserPayload(input: StrategyPromptInput) {
  const context = normalizeStrategyPromptInput(input);

  return {
    task:
      "Generate a detailed Codex implementation prompt for improving apply automation strategy behavior while preserving existing working behavior.",
    requiredSections: [
      "Goal",
      "Recorded evidence",
      "Suggested implementation",
      "Selector strategy",
      "Navigation handling",
      "Safety constraints",
      "Acceptance criteria",
      "Files to inspect/edit",
    ],
    rules: [
      "Never return a one-sentence generic prompt when recorded steps are present.",
      "List each recorded step in a numbered list and include selector, visible text, and URL when available.",
      "If careers.rtx.com hands off to workdayjobs.com or myworkdayjobs.com, describe it as a Workday external apply handoff.",
      "Keep verification/challenge handling intact and never suggest bypassing CAPTCHA/Cloudflare checks.",
      "Preserve existing Save Strategy, session polling, and apply flow behavior.",
    ],
    evidence: context,
    robustSelectorsToPrefer: [
      'getByRole("button", { name: /allow/i })',
      'getByRole("link", { name: /apply/i })',
      'getByRole("button", { name: /apply/i })',
      'getByText(/apply now|apply/i)',
    ],
    filesToInspect: [
      "my-app/app/lib/apply/playwrightApply.ts",
      "my-app/app/lib/apply/playwrightSignals.ts",
      "my-app/app/lib/apply/stopClassification.ts",
      "my-app/app/api/applications/[id]/apply/route.ts",
      "my-app/app/api/apply-sessions/[sessionId]/route.ts",
      "my-app/app/lib/apply/playwrightStrategyRepository.ts",
      "my-app/app/lib/ai/applyStrategyPromptGenerator.ts",
      "my-app/app/components/apply/TeachPageDialog.tsx",
      "my-app/app/components/apply/SavedStrategyPanel.tsx",
    ],
  };
}

export function buildFallbackStrategyCodexPrompt(
  input: StrategyPromptInput,
  options?: {
    includeFailureWarning?: boolean;
  },
) {
  const context = normalizeStrategyPromptInput(input);
  const robustSelectorLines = buildSuggestedSelectorLines(context);
  const replaySafeSection = buildStepSection(
    "Recorded steps (replay-safe)",
    context.replaySafeSteps,
    "No replay-safe steps were saved.",
  );
  const rawSection = buildStepSection(
    "Recorded steps (raw)",
    context.rawRecordedSteps,
    "No raw recorded steps were saved.",
  );

  return [
    "You are working in the Hirexa codebase.",
    "",
    options?.includeFailureWarning
      ? "AI prompt generation failed, so this fallback prompt was generated from recorded evidence."
      : null,
    "",
    "Goal",
    `Upgrade the apply automation strategy for ${context.domain} using recorded Teach Mode evidence while preserving existing apply flow behavior.`,
    "",
    "Recorded evidence",
    buildEvidenceLines(context),
    "",
    replaySafeSection,
    "",
    rawSection,
    "",
    "Suggested implementation",
    "[1/8] Identify strategy prompt generation path and model configuration used for Save Strategy.",
    "[2/8] Keep existing strategy save behavior and replay-safe/raw-step persistence unchanged.",
    "[3/8] Improve strategy prompt generation to produce a detailed Codex-ready implementation prompt based on recorded evidence.",
    "[4/8] Ensure generated prompt includes domain context, URL evidence, selector notes, and stop/error context.",
    "[5/8] Ensure generated prompt classifies consent and apply CTA steps and handles external handoff classification correctly.",
    "[6/8] Preserve verification handling and session polling contract; do not mark verification as submitted.",
    "[7/8] Keep UI labels clear for generated prompt metadata and copy/regenerate behavior.",
    "[8/8] Add/extend focused tests for RTX careers to Workday handoff evidence and prompt output quality.",
    "",
    "Selector strategy (prefer robust selectors first)",
    ...(robustSelectorLines.length > 0
      ? robustSelectorLines.map((selector) => `- ${selector}`)
      : ["- Prefer role/text selectors before brittle CSS selectors."]),
    "- Avoid relying only on brittle full CSS selectors recorded from one session.",
    "",
    "Navigation handling",
    "- Handle same-tab redirect after CTA click.",
    "- Handle popup/new-tab apply pages.",
    "- Handle delayed redirect and intermediate transition pages.",
    context.detected.workdayExternalHandoff
      ? "- Classify reaching Workday as successful external handoff / next-step apply page, not a generic failure."
      : "- Classify external handoff by comparing start host and observed host.",
    "",
    "Safety constraints",
    "- Do not bypass CAPTCHA, Cloudflare, Press & Hold, or human verification challenges.",
    "- If verification challenge is detected, stop cleanly with VERIFICATION_REQUIRED or HUMAN_INTERVENTION_REQUIRED.",
    "- Preserve existing verification handling and session polling behavior.",
    "",
    "Files to inspect/edit",
    "- my-app/app/lib/apply/playwrightApply.ts",
    "- my-app/app/lib/apply/playwrightSignals.ts",
    "- my-app/app/lib/apply/stopClassification.ts",
    "- my-app/app/api/applications/[id]/apply/route.ts",
    "- my-app/app/api/apply-sessions/[sessionId]/route.ts",
    "- my-app/app/lib/apply/playwrightStrategyRepository.ts",
    "- my-app/app/lib/ai/applyStrategyPromptGenerator.ts",
    "- my-app/app/components/apply/TeachPageDialog.tsx",
    "- my-app/app/components/apply/SavedStrategyPanel.tsx",
    "",
    "Acceptance criteria",
    "- Generated prompt includes domain, URLs, stop reason/error context, and step counts.",
    "- Generated prompt includes all recorded steps with selectors/text/URLs when available.",
    "- Prompt explicitly references consent button handling and apply CTA handling when present.",
    "- Prompt warns against brittle CSS-only selectors and recommends robust role/text selectors first.",
    "- Prompt includes navigation handling for same-tab, popup/new-tab, and delayed redirect cases.",
    "- RTX careers to Workday transitions are classified as external apply handoff when applicable.",
    "- Existing Save Strategy, replay-safe/raw-step storage, and session polling behavior remains intact.",
    "- Existing verification/challenge handling remains intact and no bypass logic is added.",
    "",
    `Model used for generation target: ${context.modelUsed}`,
    `Reasoning effort target: ${context.reasoningEffort}`,
    `Generated timestamp: ${context.generatedAt}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function parseGeneratedStrategyPrompt(content: string): ParsedGeneratedStrategyPrompt {
  try {
    const parsed = JSON.parse(content) as {
      summary?: unknown;
      codexPrompt?: unknown;
    };

    const summary = normalizeText(
      typeof parsed.summary === "string" ? parsed.summary : "",
      2000,
    );
    const codexPrompt = String(parsed.codexPrompt ?? "")
      .replace(/\r/g, "")
      .trim()
      .slice(0, 32000);

    return {
      summary,
      codexPrompt,
    };
  } catch {
    return {
      summary: "",
      codexPrompt: "",
    };
  }
}
