import { expect, test } from "@playwright/test";
import {
  buildApplySiteStrategyCodexPrompt,
  formatStrategyStepForPrompt,
  getPromptGenerationStatus,
  redactStrategyStepValue,
} from "@/app/lib/apply/siteStrategyPrompt";
import type { ApplySiteStrategyRecord } from "@/app/lib/apply/playwrightStrategyTypes";

function buildStrategy(): ApplySiteStrategyRecord {
  return {
    hostname: "maximus.avature.net",
    finalUrl:
      "https://maximus.avature.net/careers/FolderDetail/United-States-Back-End-Developer-Mid-level-JCC2-JCO-BID/38719?source=eQuest",
    lastAction: "Continue to application",
    stopReason: "verification_required",
    supportedReasons: ["verification_required", "external_redirect_needed"],
    status: "tested_once",
    successCount: 1,
    failureCount: 0,
    successfulReplays: 1,
    failedReplays: 0,
    instructions:
      "Follow the Avature handoff until the real registration/apply page appears.",
    selectors:
      'Prefer getByRole("link", { name: /apply/i }) before using brittle CSS selectors.',
    steps: [
      {
        id: "step-1",
        type: "click",
        label: "Apply now",
        selector: "role=link[name*=apply now]",
        text: "Apply now",
        currentUrl:
          "https://maximus.avature.net/careers/FolderDetail/United-States-Back-End-Developer-Mid-level-JCC2-JCO-BID/38719?source=eQuest",
        timestamp: "2026-04-26T18:18:33.000Z",
      },
      {
        id: "step-2",
        type: "fill",
        label: "Email",
        selector: "input[type=email]",
        value: "candidate@example.com",
        currentUrl:
          "https://maximus.avature.net/careers/Register?folderId=38719&source=eQuest",
        timestamp: "2026-04-26T18:18:35.000Z",
      },
    ],
    rawSteps: [
      {
        id: "step-1",
        type: "click",
        label: "Apply now",
        selector: "role=link[name*=apply now]",
        text: "Apply now",
        currentUrl:
          "https://maximus.avature.net/careers/FolderDetail/United-States-Back-End-Developer-Mid-level-JCC2-JCO-BID/38719?source=eQuest",
        timestamp: "2026-04-26T18:18:33.000Z",
      },
      {
        id: "step-2",
        type: "fill",
        label: "Email",
        selector: "input[type=email]",
        value: "candidate@example.com",
        currentUrl:
          "https://maximus.avature.net/careers/Register?folderId=38719&source=eQuest",
        timestamp: "2026-04-26T18:18:35.000Z",
      },
    ],
    aiSummary:
      "Create an improved apply automation strategy for the backend developer position at Maximus while preserving existing behavior.",
    lastTrainedUrl:
      "https://maximus.avature.net/careers/Register?folderId=38719&source=eQuest",
    createdAt: "2026-04-26T18:18:33.000Z",
    updatedAt: "2026-04-26T18:18:33.000Z",
  };
}

test("builds a deterministic codex prompt from a saved strategy", () => {
  const strategy = buildStrategy();
  const prompt = buildApplySiteStrategyCodexPrompt(strategy);

  expect(prompt).toContain(
    "Improve apply automation strategy for maximus.avature.net",
  );
  expect(prompt).toContain("Observed saved strategy");
  expect(prompt).toContain("Last trained URL");
  expect(prompt).toContain("Supported stop reasons");
  expect(prompt).toContain("Strategy status: Tested once (tested_once)");
  expect(prompt).toContain("Replay-safe steps count: 2");
  expect(prompt).toContain("Raw recorded steps count: 2");
  expect(prompt).toContain("Generated summary");
  expect(prompt).toContain("Recorded replay-safe steps");
  expect(prompt).toContain("Recorded raw steps");
  expect(prompt).toContain("1. type: click");
  expect(prompt).toContain("2. type: fill");
  expect(prompt).toContain("label: Apply now");
  expect(prompt).toContain("selector: input[type=email]");
  expect(prompt).toContain("value: [redacted email value]");
  expect(prompt).toContain("Manual verification / stop-point behavior");
  expect(prompt).toContain("Logging requirements");
  expect(prompt).toContain("Files to inspect/edit");
  expect(prompt).toContain("app/lib/apply/playwrightApply.ts");
  expect(prompt).toContain("Acceptance checklist");
});

test("prompt helpers report status and redact user-provided values", () => {
  const strategy = buildStrategy();

  expect(redactStrategyStepValue("candidate@example.com")).toBe(
    "[redacted email value]",
  );
  expect(redactStrategyStepValue("123456")).toBe("[redacted numeric value]");
  expect(redactStrategyStepValue("plain text input")).toBe(
    "[redacted user-provided value]",
  );

  const formatted = formatStrategyStepForPrompt(strategy.steps![1], 1);
  expect(formatted).toContain("2. type: fill");
  expect(formatted).toContain("value: [redacted email value]");

  expect(getPromptGenerationStatus(strategy).label).toBe("Ready");
  expect(
    getPromptGenerationStatus(strategy, {
      generated: true,
    }).label,
  ).toBe("Generated");
  expect(
    getPromptGenerationStatus({
      steps: [],
      rawSteps: [],
      sanitizedSteps: [],
    }).label,
  ).toBe("Needs recorded steps");
});

