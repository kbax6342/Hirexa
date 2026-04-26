import { expect, test } from "@playwright/test";
import {
  getResolvedUrlCompatibility,
  isResolvedUrlCompatibleWithJob,
  isThirdPartyJobSource,
} from "@/app/lib/apply/resolvedUrlCompatibility";

test("rejects RTX URLs for non-RTX jobs", () => {
  const result = getResolvedUrlCompatibility({
    url: "https://careers.rtx.com/global/en",
    companyName: "Maximus",
    jobTitle: "Back End Developer - Mid-level",
    sourceUrl:
      "https://jobs.equest.com/jobs/GA/maximus/back-end-developer---mid-level-456328580.html",
  });

  expect(result.compatible).toBeFalsy();
  expect(result.reason).toBe("company_family_mismatch");
  expect(result.mismatchFamily).toBe("rtx");
  expect(
    isResolvedUrlCompatibleWithJob({
      url: "https://careers.rtx.com/global/en",
      companyName: "Maximus",
      sourceUrl:
        "https://jobs.equest.com/jobs/GA/maximus/back-end-developer---mid-level-456328580.html",
    }),
  ).toBeFalsy();
});

test("accepts RTX URLs for RTX jobs and marks eQuest as third-party", () => {
  expect(
    isThirdPartyJobSource({
      source: "equest",
      url: "https://jobs.equest.com/jobs/GA/maximus/back-end-developer---mid-level-456328580.html",
    }),
  ).toBeTruthy();

  const result = getResolvedUrlCompatibility({
    url: "https://careers.rtx.com/global/en/job/01643055/software-engineer",
    companyName: "RTX Corporation",
    jobTitle: "Software Engineer",
    sourceUrl: "https://careers.rtx.com/global/en/job/01643055/software-engineer",
  });

  expect(result.compatible).toBeTruthy();
});
