import { expect, test } from "@playwright/test";
import {
  matchPlaywrightStrategy,
  resolveRuntimeStrategyStartUrl,
} from "@/app/lib/apply/playwrightStrategyMatcher";
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

test("runtime strategy start prefers greenhouse direct apply target over a weak board-page strategy", () => {
  const weakGreenhouseStrategy: ApplySiteStrategyRecord = {
    id: "strategy-3",
    strategyKey: "greenhouse::weak",
    hostname: "job-boards.greenhouse.io",
    sourceHost: "job-boards.greenhouse.io",
    destinationHost: "job-boards.greenhouse.io",
    strategyType: "generic_navigation",
    pageType: "employer_site",
    finalUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    lastAction: "verification_required",
    stopReason: "HUMAN_INTERVENTION_REQUIRED",
    supportedReasons: ["verification_required"],
    status: "draft",
    successCount: 0,
    failureCount: 0,
    successfulReplays: 0,
    failedReplays: 0,
    instructions: "",
    steps: [
      {
        id: "step-1",
        type: "goto",
        label: "Initial training page",
        selector: "page.goto",
        text: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        timestamp: "2026-04-26T15:00:00.000Z",
      },
    ],
    rawSteps: [
      {
        id: "step-1",
        type: "goto",
        label: "Initial training page",
        selector: "page.goto",
        text: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        timestamp: "2026-04-26T15:00:00.000Z",
      },
    ],
    sanitizedSteps: [
      {
        id: "step-1",
        type: "goto",
        label: "Initial training page",
        selector: "page.goto",
        text: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        timestamp: "2026-04-26T15:00:00.000Z",
      },
    ],
    createdAt: "2026-04-26T15:00:00.000Z",
    updatedAt: "2026-04-26T15:00:00.000Z",
  };

  const decision = resolveRuntimeStrategyStartUrl({
    strategy: weakGreenhouseStrategy,
    preferredTargetUrl:
      "https://job-boards.greenhouse.io/embed/job_app?for=speechify&token=5975356004",
  });

  expect(decision.action).toBe("converted");
  expect(decision.reason).toBe("greenhouse_direct_apply_target_preferred");
  expect(decision.selectedUrl).toContain("/embed/job_app?for=speechify&token=5975356004");
});

test("runtime strategy start keeps a strategy url when the saved strategy has meaningful steps", () => {
  const strongerGreenhouseStrategy: ApplySiteStrategyRecord = {
    id: "strategy-4",
    strategyKey: "greenhouse::strong",
    hostname: "job-boards.greenhouse.io",
    sourceHost: "job-boards.greenhouse.io",
    destinationHost: "job-boards.greenhouse.io",
    strategyType: "direct_apply",
    pageType: "employer_site",
    finalUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    lastAction: "Apply for this job",
    stopReason: "HUMAN_INTERVENTION_REQUIRED",
    supportedReasons: ["verification_required"],
    status: "tested_once",
    successCount: 1,
    failureCount: 0,
    successfulReplays: 1,
    failedReplays: 0,
    instructions: "",
    steps: [
      {
        id: "step-1",
        type: "goto",
        label: "Initial training page",
        selector: "page.goto",
        text: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        timestamp: "2026-04-26T15:00:00.000Z",
      },
      {
        id: "step-2",
        type: "click",
        label: "Apply for this job",
        selector: "a[href*='job_app']",
        text: "Apply for this job",
        currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        timestamp: "2026-04-26T15:00:02.000Z",
      },
    ],
    rawSteps: [],
    sanitizedSteps: [
      {
        id: "step-1",
        type: "goto",
        label: "Initial training page",
        selector: "page.goto",
        text: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        timestamp: "2026-04-26T15:00:00.000Z",
      },
      {
        id: "step-2",
        type: "click",
        label: "Apply for this job",
        selector: "a[href*='job_app']",
        text: "Apply for this job",
        currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
        timestamp: "2026-04-26T15:00:02.000Z",
      },
    ],
    createdAt: "2026-04-26T15:00:00.000Z",
    updatedAt: "2026-04-26T15:00:00.000Z",
  };

  const decision = resolveRuntimeStrategyStartUrl({
    strategy: strongerGreenhouseStrategy,
    preferredTargetUrl:
      "https://job-boards.greenhouse.io/embed/job_app?for=speechify&token=5975356004",
  });

  expect(decision.action).toBe("replayed");
  expect(decision.selectedUrl).toBe(
    "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
  );
});
