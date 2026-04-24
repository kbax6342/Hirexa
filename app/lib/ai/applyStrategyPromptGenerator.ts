import "server-only";

import OpenAI from "openai";
import {
  resolveStrategyPromptModelConfig,
  type StrategyPromptReasoningEffort,
} from "@/app/lib/ai/strategyPromptModel";
import {
  buildFallbackStrategyCodexPrompt,
  buildStrategyPromptSummary,
  buildStrategyPromptSystemInstruction,
  buildStrategyPromptUserPayload,
  parseGeneratedStrategyPrompt,
  type RecordedStep,
  type StrategyPromptInput as CodexPromptInput,
} from "@/app/lib/apply/generateStrategyCodexPrompt";
import type { ApplySiteStrategyStep } from "@/app/lib/apply/playwrightStrategyTypes";

type StrategyPromptInput = {
  hostname?: string | null;
  stoppedUrl?: string | null;
  lastSavedUrl?: string | null;
  observedFinalUrl?: string | null;
  stopReason?: string | null;
  lastAction?: string | null;
  errorMessage?: string | null;
  instructions?: string | null;
  selectorNotes?: string | null;
  recordedSteps?: ApplySiteStrategyStep[] | null;
  replaySafeSteps?: ApplySiteStrategyStep[] | null;
  rawRecordedSteps?: ApplySiteStrategyStep[] | null;
  lastTrainedUrl?: string | null;
};

export type GeneratedStrategyPrompt = {
  aiSummary: string;
  generatedCodexPrompt: string;
  promptGeneratedAt: string;
  promptModel: string;
  promptReasoningEffort: StrategyPromptReasoningEffort;
  promptWarning?: string;
  source: "openai" | "fallback";
};

const STRATEGY_PROMPT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
    },
    codexPrompt: {
      type: "string",
      minLength: 1,
      maxLength: 32000,
    },
  },
  required: ["summary", "codexPrompt"],
  additionalProperties: false,
} as const;

function normalizeText(value: string | null | undefined, maxLength = 1400) {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function parseHostname(rawUrl: string) {
  const value = normalizeText(rawUrl, 1800);
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

function toRecordedSteps(steps: ApplySiteStrategyStep[] | null | undefined) {
  if (!Array.isArray(steps)) return [];

  return steps
    .slice(-80)
    .map((step): RecordedStep | null => {
      const action = normalizeText(
        step.label ? `${step.type} ${step.label}` : step.type,
        220,
      );
      const url = normalizeText(step.currentUrl, 1600);

      if (!action || !url) return null;

      return {
        action,
        selector: normalizeText(step.selector, 900) || undefined,
        text: normalizeText(step.text, 700) || undefined,
        url,
        recordedAt: normalizeText(step.timestamp, 80) || undefined,
      };
    })
    .filter((step): step is RecordedStep => Boolean(step));
}

function getResponseText(resp: unknown): string {
  const response = resp as
    | {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
      }
    | undefined;

  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function appearsTooGeneric(prompt: string, stepCount: number) {
  if (stepCount === 0) return false;

  const normalized = normalizeText(prompt, 40000).toLowerCase();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (wordCount < 140) return true;
  if (!normalized.includes("recorded evidence")) return true;
  if (!normalized.includes("acceptance criteria")) return true;
  if (!normalized.includes("suggested implementation")) return true;

  return false;
}

function toCodexPromptInput(args: {
  input: StrategyPromptInput;
  model: string;
  reasoningEffort: StrategyPromptReasoningEffort;
  generatedAt: string;
}): CodexPromptInput {
  const replaySafeSteps = toRecordedSteps(
    args.input.replaySafeSteps ?? args.input.recordedSteps,
  );
  const rawRecordedSteps = toRecordedSteps(
    args.input.rawRecordedSteps ?? args.input.recordedSteps,
  );
  const inferredDomain =
    normalizeText(args.input.hostname, 220) ||
    parseHostname(
      normalizeText(args.input.stoppedUrl, 1200) ||
        normalizeText(args.input.lastSavedUrl, 1200) ||
        normalizeText(args.input.lastTrainedUrl, 1200) ||
        normalizeText(args.input.observedFinalUrl, 1200),
    ) ||
    "unknown-domain";
  const lastSavedUrl =
    normalizeText(args.input.lastSavedUrl, 1600) ||
    normalizeText(args.input.stoppedUrl, 1600);
  const startingUrl = lastSavedUrl;
  const observedFinalUrl =
    normalizeText(args.input.observedFinalUrl, 1600) ||
    normalizeText(args.input.lastTrainedUrl, 1600) ||
    rawRecordedSteps.at(-1)?.url ||
    replaySafeSteps.at(-1)?.url ||
    "";

  return {
    domain: inferredDomain,
    startingUrl,
    lastSavedUrl,
    lastTrainedUrl: normalizeText(args.input.lastTrainedUrl, 1600),
    observedFinalUrl,
    stopReason:
      normalizeText(args.input.stopReason, 260) ||
      normalizeText(args.input.lastAction, 260) ||
      "HUMAN_INTERVENTION_REQUIRED",
    errorMessage: normalizeText(args.input.errorMessage, 1200),
    replaySafeSteps,
    rawRecordedSteps,
    generatedAt: args.generatedAt,
    modelUsed: args.model,
    reasoningEffort: args.reasoningEffort,
  };
}

async function requestStrategyPromptFromOpenAI(args: {
  client: OpenAI;
  model: string;
  reasoningEffort: StrategyPromptReasoningEffort;
  systemInstruction: string;
  userPayload: unknown;
}) {
  const sharedRequest = {
    model: args.model,
    input: [
      {
        role: "system" as const,
        content: [
          {
            type: "input_text" as const,
            text: args.systemInstruction,
          },
        ],
      },
      {
        role: "user" as const,
        content: [
          {
            type: "input_text" as const,
            text: JSON.stringify(args.userPayload, null, 2),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema" as const,
        name: "StrategyCodexPrompt",
        schema: STRATEGY_PROMPT_RESPONSE_SCHEMA,
        strict: true,
      },
    },
    store: false,
  };

  try {
    return await args.client.responses.create({
      ...sharedRequest,
      reasoning: {
        effort: args.reasoningEffort,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const reasoningLikelyUnsupported =
      message.includes("reasoning") ||
      message.includes("effort") ||
      message.includes("unsupported parameter");

    if (!reasoningLikelyUnsupported) {
      throw error;
    }

    return args.client.responses.create(sharedRequest);
  }
}

export async function generateStrategyPrompt(
  input: StrategyPromptInput,
): Promise<GeneratedStrategyPrompt> {
  const { model, reasoningEffort } = resolveStrategyPromptModelConfig();
  const generatedAt = new Date().toISOString();
  const codexPromptInput = toCodexPromptInput({
    input,
    model,
    reasoningEffort,
    generatedAt,
  });
  const fallbackSummary = buildStrategyPromptSummary(codexPromptInput);
  const fallbackPrompt = buildFallbackStrategyCodexPrompt(codexPromptInput);

  if (!process.env.OPENAI_API_KEY) {
    const warning =
      "AI prompt generation failed, so this fallback prompt was generated from recorded evidence.";

    return {
      aiSummary: fallbackSummary,
      generatedCodexPrompt: buildFallbackStrategyCodexPrompt(codexPromptInput, {
        includeFailureWarning: true,
      }),
      promptGeneratedAt: generatedAt,
      promptModel: `${model}:fallback`,
      promptReasoningEffort: reasoningEffort,
      promptWarning: warning,
      source: "fallback",
    };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await requestStrategyPromptFromOpenAI({
      client,
      model,
      reasoningEffort,
      systemInstruction: buildStrategyPromptSystemInstruction(),
      userPayload: buildStrategyPromptUserPayload(codexPromptInput),
    });
    const responseContent = getResponseText(response);
    const parsed = parseGeneratedStrategyPrompt(responseContent);

    if (
      !parsed.codexPrompt ||
      appearsTooGeneric(
        parsed.codexPrompt,
        Math.max(
          codexPromptInput.replaySafeSteps.length,
          codexPromptInput.rawRecordedSteps.length,
        ),
      )
    ) {
      return {
        aiSummary: parsed.summary || fallbackSummary,
        generatedCodexPrompt: buildFallbackStrategyCodexPrompt(codexPromptInput),
        promptGeneratedAt: generatedAt,
        promptModel: `${model}:normalized`,
        promptReasoningEffort: reasoningEffort,
        promptWarning:
          "AI prompt generation was too generic, so a detailed fallback prompt was generated from recorded evidence.",
        source: "fallback",
      };
    }

    return {
      aiSummary: parsed.summary || fallbackSummary,
      generatedCodexPrompt: parsed.codexPrompt || fallbackPrompt,
      promptGeneratedAt: generatedAt,
      promptModel: model,
      promptReasoningEffort: reasoningEffort,
      source: "openai",
    };
  } catch {
    return {
      aiSummary: fallbackSummary,
      generatedCodexPrompt: buildFallbackStrategyCodexPrompt(codexPromptInput, {
        includeFailureWarning: true,
      }),
      promptGeneratedAt: generatedAt,
      promptModel: `${model}:fallback`,
      promptReasoningEffort: reasoningEffort,
      promptWarning:
        "AI prompt generation failed, so this fallback prompt was generated from recorded evidence.",
      source: "fallback",
    };
  }
}

export type { StrategyPromptInput };
