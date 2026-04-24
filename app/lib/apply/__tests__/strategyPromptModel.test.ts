import { expect, test } from "@playwright/test";
import { resolveStrategyPromptModelConfig } from "@/app/lib/ai/strategyPromptModel";

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

test("strategy prompt model defaults to gpt-5.4 with high reasoning effort", () => {
  const originalModel = process.env.OPENAI_MODEL;
  const originalStrategyModel = process.env.OPENAI_STRATEGY_PROMPT_MODEL;
  const originalReasoning = process.env.OPENAI_STRATEGY_PROMPT_REASONING_EFFORT;

  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_STRATEGY_PROMPT_MODEL;
  delete process.env.OPENAI_STRATEGY_PROMPT_REASONING_EFFORT;

  const config = resolveStrategyPromptModelConfig();

  expect(config.model).toBe("gpt-5.4");
  expect(config.reasoningEffort).toBe("high");

  restoreEnv("OPENAI_MODEL", originalModel);
  restoreEnv("OPENAI_STRATEGY_PROMPT_MODEL", originalStrategyModel);
  restoreEnv("OPENAI_STRATEGY_PROMPT_REASONING_EFFORT", originalReasoning);
});

test("strategy-specific env overrides generic model and reasoning settings", () => {
  const originalModel = process.env.OPENAI_MODEL;
  const originalStrategyModel = process.env.OPENAI_STRATEGY_PROMPT_MODEL;
  const originalReasoning = process.env.OPENAI_STRATEGY_PROMPT_REASONING_EFFORT;

  process.env.OPENAI_MODEL = "gpt-4.1-mini";
  process.env.OPENAI_STRATEGY_PROMPT_MODEL = "gpt-5.4";
  process.env.OPENAI_STRATEGY_PROMPT_REASONING_EFFORT = "high";

  const config = resolveStrategyPromptModelConfig();

  expect(config.model).toBe("gpt-5.4");
  expect(config.reasoningEffort).toBe("high");

  restoreEnv("OPENAI_MODEL", originalModel);
  restoreEnv("OPENAI_STRATEGY_PROMPT_MODEL", originalStrategyModel);
  restoreEnv("OPENAI_STRATEGY_PROMPT_REASONING_EFFORT", originalReasoning);
});
