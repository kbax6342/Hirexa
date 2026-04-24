import { expect, test } from "@playwright/test";
import { buildFallbackStrategyCodexPrompt } from "@/app/lib/apply/generateStrategyCodexPrompt";

test("builds a detailed RTX codex prompt from recorded evidence", () => {
  const prompt = buildFallbackStrategyCodexPrompt({
    domain: "careers.rtx.com",
    startingUrl:
      "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
    lastSavedUrl:
      "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
    lastTrainedUrl:
      "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
    observedFinalUrl:
      "https://globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway/job/US-IA-CEDAR-RAPIDS-137--855-35Th-St-NE--BLDG-137/Sr-Software-Engineer---Embedded-Communications--Onsite-_01839634/apply?source=REC_UTC_-_Corporation_Career_Site",
    stopReason: "HUMAN_INTERVENTION_REQUIRED",
    replaySafeSteps: [
      {
        action: "goto initial training page",
        selector: "page.goto",
        url: "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
      },
      {
        action: "click Allow",
        selector:
          "html > body:nth-of-type(1) > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > button:nth-of-type(2)",
        text: "Allow",
        url: "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
      },
      {
        action: "click Apply",
        selector:
          "html > body:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)",
        text: "Apply",
        url: "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
      },
    ],
    rawRecordedSteps: [
      {
        action: "goto initial training page",
        selector: "page.goto",
        url: "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
      },
      {
        action: "click Allow",
        selector:
          "html > body:nth-of-type(1) > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > button:nth-of-type(2)",
        text: "Allow",
        url: "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
      },
      {
        action: "click Apply",
        selector:
          "html > body:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)",
        text: "Apply",
        url: "https://careers.rtx.com/global/en/job/01839634/Sr-Software-Engineer-Embedded-Communications-Onsite",
      },
    ],
  });

  expect(prompt).toContain("careers.rtx.com");
  expect(prompt).toContain("RTX");
  expect(prompt).toContain("Workday external apply handoff");
  expect(prompt).toContain(
    "https://globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway",
  );
  expect(prompt).toContain("Action: goto initial training page");
  expect(prompt).toContain("Action: click Allow");
  expect(prompt).toContain("Action: click Apply");
  expect(prompt).toContain('getByRole("button", { name: /allow/i })');
  expect(prompt).toContain('getByRole("link", { name: /apply/i })');
  expect(prompt).toContain('getByRole("button", { name: /apply/i })');
  expect(prompt).toContain('getByText(/apply now|apply/i)');
  expect(prompt).toContain("Avoid relying only on brittle full CSS selectors");
  expect(prompt).toContain("Handle same-tab redirect");
  expect(prompt).toContain("Handle popup/new-tab apply pages");
  expect(prompt).toContain("Handle delayed redirect");
  expect(prompt).toContain("Preserve existing verification handling and session polling behavior.");
  expect(prompt).toContain("Files to inspect/edit");
  expect(prompt).toContain("Acceptance criteria");
});
