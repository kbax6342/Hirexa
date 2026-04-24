export type StrategyPromptReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type StrategyPromptModelConfig = {
  model: string;
  reasoningEffort: StrategyPromptReasoningEffort;
};

const DEFAULT_STRATEGY_PROMPT_MODEL = "gpt-5.4";
const DEFAULT_REASONING_EFFORT: StrategyPromptReasoningEffort = "high";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function normalizeReasoningEffort(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase();

  if (
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high" ||
    normalized === "xhigh"
  ) {
    return normalized;
  }

  return DEFAULT_REASONING_EFFORT;
}

export function resolveStrategyPromptModelConfig(): StrategyPromptModelConfig {
  const model =
    normalizeText(process.env.OPENAI_STRATEGY_PROMPT_MODEL) ||
    normalizeText(process.env.OPENAI_MODEL) ||
    DEFAULT_STRATEGY_PROMPT_MODEL;

  const reasoningEffort = normalizeReasoningEffort(
    process.env.OPENAI_STRATEGY_PROMPT_REASONING_EFFORT,
  );

  return {
    model,
    reasoningEffort,
  };
}
