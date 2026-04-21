import { expect, test } from "@playwright/test";
import {
  buildPlaywrightAutomationPrompt,
  derivePlaywrightStrategyInstruction,
} from "@/app/lib/apply/playwrightStrategyPrompt";

test("prompt generation stays deterministic for aggregator handoff lessons", () => {
  const instruction = derivePlaywrightStrategyInstruction({
    sourceHost: "www.adzuna.com",
    destinationHost: "careers.rtx.com",
    pageType: "aggregator",
    strategyType: "aggregator_handoff",
  });

  const prompt = buildPlaywrightAutomationPrompt({
    sourceHost: "www.adzuna.com",
    destinationHost: "careers.rtx.com",
    pageType: "aggregator",
    strategyType: "aggregator_handoff",
    derivedInstruction: instruction,
  });

  expect(instruction).toContain(
    "continue only on the resolved employer/ATS posting page",
  );
  expect(prompt).toContain("Current page classification: Aggregator");
  expect(prompt).toContain("Source host: adzuna.com");
  expect(prompt).toContain("Destination host: careers.rtx.com");
  expect(prompt).toContain("do not use Google/Bing");
  expect(prompt).toContain("do not replay CAPTCHA");
});
