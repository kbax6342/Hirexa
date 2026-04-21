import { expect, test } from "@playwright/test";
import { matchPlaywrightStrategy } from "@/app/lib/apply/playwrightStrategyMatcher";
import type { ApplySiteStrategyRecord } from "@/app/lib/apply/playwrightStrategyTypes";

const aggregatorStrategy: ApplySiteStrategyRecord = {
  id: "strategy-1",
  strategyKey: "adzuna::rtx",
  hostname: "www.adzuna.com",
  sourceHost: "www.adzuna.com",
  destinationHost: "careers.rtx.com",
  strategyType: "aggregator_handoff",
  pageType: "aggregator",
  finalUrl: "https://careers.rtx.com/job/123",
  lastAction: "no_apply_cta",
  stopReason: "HUMAN_INTERVENTION_REQUIRED",
  supportedReasons: ["aggregator_no_cta"],
  status: "working",
  successCount: 3,
  failureCount: 0,
  successfulReplays: 3,
  failedReplays: 0,
  instructions: "Open the employer page directly.",
  steps: [],
  rawSteps: [],
  sanitizedSteps: [],
  derivedInstruction: "Use the employer page directly.",
  automationPrompt: "Source host: www.adzuna.com",
  promptGenerationSucceeded: true,
  createdAt: "2026-04-20T12:00:00.000Z",
  updatedAt: "2026-04-20T12:00:00.000Z",
};

const genericStrategy: ApplySiteStrategyRecord = {
  ...aggregatorStrategy,
  id: "strategy-2",
  strategyKey: "generic",
  destinationHost: "jobs.example.com",
  strategyType: "generic_navigation",
  pageType: "employer_site",
  successCount: 1,
  successfulReplays: 1,
  automationPrompt: "Source host: jobs.example.com",
};

test("matcher prefers the most successful exact host strategy", () => {
  const match = matchPlaywrightStrategy({
    strategies: [genericStrategy, aggregatorStrategy],
    sourceHost: "https://www.adzuna.com/details/123",
    destinationHost: "https://careers.rtx.com/job/123",
    pageType: "aggregator",
    strategyType: "aggregator_handoff",
  });

  expect(match.strategy?.id).toBe("strategy-1");
  expect(match.score).toBeGreaterThan(100);
});
