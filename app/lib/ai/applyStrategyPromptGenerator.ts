import "server-only";

import OpenAI from "openai";
import type { ApplySiteStrategyStep } from "@/app/lib/apply/playwrightStrategyTypes";

type StrategyPromptInput = {
  hostname?: string | null;
  stoppedUrl?: string | null;
  stopReason?: string | null;
  lastAction?: string | null;
  errorMessage?: string | null;
  instructions?: string | null;
  selectorNotes?: string | null;
  recordedSteps?: ApplySiteStrategyStep[] | null;
  lastTrainedUrl?: string | null;
};

type NormalizedStep = {
  type: string;
  label?: string;
  selector?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  currentUrl: string;
};

export type NormalizedStrategyPromptContext = {
  hostname: string;
  stoppedUrl: string;
  stopReason: string;
  lastAction: string;
  errorMessage: string;
  instructions: string;
  selectorNotes: string;
  lastTrainedUrl: string;
  recordedSteps: NormalizedStep[];
};

export type GeneratedStrategyPrompt = {
  aiSummary: string;
  generatedCodexPrompt: string;
  promptGeneratedAt: string;
  promptModel: string;
  source: "openai" | "fallback";
};

function normalizeText(value: string | null | undefined, maxLength = 800) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function normalizeMultilineText(
  value: string | null | undefined,
  maxLength = 4000,
) {
  const normalized = String(value ?? "").replace(/\r/g, "").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function normalizeSteps(steps: ApplySiteStrategyStep[] | null | undefined) {
  if (!Array.isArray(steps)) return [];

  return steps
    .slice(-25)
    .map((step) => ({
      type: normalizeText(step.type, 60),
      label: normalizeText(step.label, 140) || undefined,
      selector: normalizeText(step.selector, 200) || undefined,
      text: normalizeText(step.text, 200) || undefined,
      value:
        step.value === "[REDACTED]"
          ? "[REDACTED]"
          : normalizeText(step.value, 200) || undefined,
      checked: typeof step.checked === "boolean" ? step.checked : undefined,
      currentUrl: normalizeText(step.currentUrl, 500),
    }))
    .filter((step) => Boolean(step.type) && Boolean(step.currentUrl));
}

export function normalizeStrategyPromptContext(
  input: StrategyPromptInput,
): NormalizedStrategyPromptContext {
  return {
    hostname: normalizeText(input.hostname, 180) || "unknown-host",
    stoppedUrl: normalizeText(input.stoppedUrl, 900),
    stopReason:
      normalizeText(input.stopReason, 180) || "HUMAN_INTERVENTION_REQUIRED",
    lastAction: normalizeText(input.lastAction, 240),
    errorMessage: normalizeText(input.errorMessage, 700),
    instructions: normalizeMultilineText(input.instructions, 5000),
    selectorNotes: normalizeMultilineText(input.selectorNotes, 5000),
    lastTrainedUrl: normalizeText(input.lastTrainedUrl, 900),
    recordedSteps: normalizeSteps(input.recordedSteps),
  };
}

function buildFallbackSummary(context: NormalizedStrategyPromptContext) {
  const parts = [
    `Stopped on ${context.hostname}`,
    context.stopReason ? `reason: ${context.stopReason}` : null,
    context.lastAction ? `last action: ${context.lastAction}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join("; ");
}

function buildFallbackCodexPrompt(context: NormalizedStrategyPromptContext) {
  const stepLines =
    context.recordedSteps.length > 0
      ? context.recordedSteps
          .map((step, index) => {
            const fragments = [
              `${index + 1}. ${step.type}`,
              step.label ? `label=${step.label}` : null,
              step.selector ? `selector=${step.selector}` : null,
              step.currentUrl ? `url=${step.currentUrl}` : null,
            ].filter((value): value is string => Boolean(value));

            return `- ${fragments.join(" | ")}`;
          })
          .join("\n")
      : "- No recorded steps were provided.";

  return [
    "You are editing an existing Next.js app for Hirexa apply automation/site-strategy flows.",
    "Preserve existing working code, audit logging, popout behavior, and history behavior.",
    "Make minimal targeted edits and do not rewrite the apply engine from scratch.",
    "",
    "Context",
    `- Hostname: ${context.hostname}`,
    `- Stopped URL: ${context.stoppedUrl || "(not provided)"}`,
    `- Stop reason: ${context.stopReason || "(not provided)"}`,
    `- Last action: ${context.lastAction || "(not provided)"}`,
    `- Error message: ${context.errorMessage || "(not provided)"}`,
    `- Last trained URL: ${context.lastTrainedUrl || "(not provided)"}`,
    "",
    "Notes",
    `- Instructions: ${context.instructions || "(none)"}`,
    `- Selector notes: ${context.selectorNotes || "(none)"}`,
    "",
    "Recorded steps",
    stepLines,
    "",
    "[1/6] File discovery",
    "- Search for Teach this page, Save strategy, Review and Retry, Detected stop reason, HUMAN_INTERVENTION_REQUIRED, and Apply Now.",
    "- Find the existing strategy save API, Playwright apply runtime, and strategy replay start logic before editing.",
    "",
    "[2/6] Strategy save + prompt generation",
    "- Keep strategy saving behavior intact.",
    "- Add server-side OpenAI generation that returns aiSummary and generatedCodexPrompt immediately after save.",
    "",
    "[3/6] Fresh teach mode",
    "- Teach opens fresh by default using only stop context fields (URL, hostname, stop reason, error message, last action).",
    "- Only load prior recorded steps/instructions/selectors in explicit review mode.",
    "",
    "[4/6] Review vs retry split",
    "- Add clear actions for Review Previous Attempt and Retry with Fresh Session.",
    "- Do not silently reuse stale current URL/session for retry.",
    "",
    "[5/6] Fresh runtime",
    "- Keep audit/history/popout records unchanged.",
    "- Run Apply Now in a fresh browser/storage context each attempt.",
    "",
    "[6/6] Verify",
    "- Run targeted checks/tests and confirm existing flows still work.",
    "",
    "Acceptance checklist",
    "- Save strategy still succeeds.",
    "- Save strategy now returns and displays a generated Codex prompt.",
    "- Teach opens fresh by default without stale recorded steps.",
    "- Review Previous Attempt and Retry with Fresh Session are separate actions.",
    "- Apply Now keeps audit/history/popout behavior while using a fresh runtime session.",
  ].join("\n");
}

export function buildStrategyPromptModelInput(input: StrategyPromptInput) {
  const context = normalizeStrategyPromptContext(input);

  return {
    context,
    system:
      "You write concise engineering strategy prompts for Codex in VS Code. Return strict JSON with keys summary and codexPrompt.",
    user: JSON.stringify(
      {
        task: "Generate a Codex-ready implementation prompt for an existing apply automation workflow.",
        requirements: [
          "Preserve existing working code and behavior unless explicitly changed.",
          "Use minimal targeted edits.",
          "Do file discovery first before implementation.",
          "Include explicit step-by-step progress markers in the prompt.",
          "Include an acceptance checklist in the prompt.",
          "Keep context grounded in apply automation and site-strategy workflows.",
        ],
        context,
      },
      null,
      2,
    ),
  };
}

function parseGeneratedFields(content: string) {
  try {
    const parsed = JSON.parse(content) as {
      summary?: unknown;
      codexPrompt?: unknown;
    };

    return {
      summary: normalizeMultilineText(
        typeof parsed.summary === "string" ? parsed.summary : "",
        2000,
      ),
      codexPrompt: normalizeMultilineText(
        typeof parsed.codexPrompt === "string" ? parsed.codexPrompt : "",
        16000,
      ),
    };
  } catch {
    return {
      summary: "",
      codexPrompt: "",
    };
  }
}

export async function generateStrategyPrompt(
  input: StrategyPromptInput,
): Promise<GeneratedStrategyPrompt> {
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const generatedAt = new Date().toISOString();
  const modelInput = buildStrategyPromptModelInput(input);
  const fallbackSummary = buildFallbackSummary(modelInput.context);
  const fallbackPrompt = buildFallbackCodexPrompt(modelInput.context);

  if (!process.env.OPENAI_API_KEY) {
    return {
      aiSummary: fallbackSummary,
      generatedCodexPrompt: fallbackPrompt,
      promptGeneratedAt: generatedAt,
      promptModel: "fallback-template",
      source: "fallback",
    };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: modelInput.system,
        },
        {
          role: "user",
          content: modelInput.user,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = parseGeneratedFields(content);

    return {
      aiSummary: parsed.summary || fallbackSummary,
      generatedCodexPrompt: parsed.codexPrompt || fallbackPrompt,
      promptGeneratedAt: generatedAt,
      promptModel: model,
      source: "openai",
    };
  } catch {
    return {
      aiSummary: fallbackSummary,
      generatedCodexPrompt: fallbackPrompt,
      promptGeneratedAt: generatedAt,
      promptModel: `${model}:fallback`,
      source: "fallback",
    };
  }
}

export type { StrategyPromptInput };
