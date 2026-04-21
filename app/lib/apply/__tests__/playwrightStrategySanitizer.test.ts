import { expect, test } from "@playwright/test";
import { sanitizePlaywrightStrategySteps } from "@/app/lib/apply/playwrightStrategySanitizer";
import type { ApplySiteStrategyStep } from "@/app/lib/apply/playwrightStrategyTypes";

const rawSteps: ApplySiteStrategyStep[] = [
  {
    id: "1",
    type: "goto",
    currentUrl: "https://www.google.com/search?q=rtx+careers",
    timestamp: "2026-04-20T12:00:00.000Z",
  },
  {
    id: "2",
    type: "click",
    label: "Verify you are human",
    currentUrl: "https://careers.rtx.com/challenge",
    timestamp: "2026-04-20T12:00:01.000Z",
  },
  {
    id: "3",
    type: "click",
    label: "Apply on company site",
    currentUrl: "https://www.adzuna.com/details/123",
    timestamp: "2026-04-20T12:00:02.000Z",
  },
  {
    id: "4",
    type: "fill",
    selector: "#firstName",
    value: "Kev",
    currentUrl: "https://careers.rtx.com/job/123/apply",
    timestamp: "2026-04-20T12:00:03.000Z",
  },
  {
    id: "5",
    type: "fill",
    selector: "#firstName",
    value: "Kevin",
    currentUrl: "https://careers.rtx.com/job/123/apply",
    timestamp: "2026-04-20T12:00:04.000Z",
  },
];

test("sanitizer removes search, verification, and noisy repeated edits", () => {
  const result = sanitizePlaywrightStrategySteps({
    steps: rawSteps,
    sourceHost: "www.adzuna.com",
    destinationHost: "careers.rtx.com",
  });

  expect(result.sanitizedSteps.map((step) => step.id)).toEqual(["3", "5"]);
  expect(result.destinationHost).toBe("careers.rtx.com");
});
