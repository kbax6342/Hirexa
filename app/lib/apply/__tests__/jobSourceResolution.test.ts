import { expect, test } from "@playwright/test";
import {
  buildEcosiaSearchQuery,
  isAggregatorSourceProvider,
  selectInitialAutomationTarget,
} from "@/app/lib/apply/jobSourceResolution";

test("builds deterministic Ecosia query from title, company, and normalized location", () => {
  const query = buildEcosiaSearchQuery({
    jobTitle: "Software Engineer",
    company: "RTX",
    location: "austin tx",
  });

  expect(query).toBe("Software Engineer RTX Austin, TX");
});

test("routing selection skips invalid aggregator/static URLs and keeps first valid direct target", () => {
  const decision = selectInitialAutomationTarget({
    sourceProvider: "Adzuna",
    candidates: [
      {
        label: "bad_static",
        url: "https://zunastatic-abf.kxcdn.com/images/global/jobs/favicon.ico",
      },
      {
        label: "aggregator_detail",
        url: "https://www.adzuna.com/details/123",
      },
      {
        label: "direct_ats",
        url: "https://boards.greenhouse.io/example/jobs/1234567",
      },
    ],
  });

  expect(decision.selectedFrom).toBe("direct_ats");
  expect(decision.selectedUrl).toContain("boards.greenhouse.io");
  expect(decision.rejectedCandidates.length).toBe(2);
  expect(decision.requiresEcosiaSearch).toBeFalsy();
});

test("routing decision triggers Ecosia when only aggregator/static candidates are present", () => {
  const decision = selectInitialAutomationTarget({
    sourceProvider: "adzuna_external",
    candidates: [
      {
        label: "bad_static",
        url: "https://zunastatic-abf.kxcdn.com/images/global/jobs/favicon.ico",
      },
      {
        label: "adzuna_detail",
        url: "https://www.adzuna.com/details/123456",
      },
    ],
  });

  expect(isAggregatorSourceProvider("adzuna_external")).toBeTruthy();
  expect(decision.aggregatorSourceDetected).toBeTruthy();
  expect(decision.selectedUrl).toBeUndefined();
  expect(decision.requiresEcosiaSearch).toBeTruthy();
});
