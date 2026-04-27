import { expect, test } from "@playwright/test";
import {
  compareAtsJobIdentityFromUrls,
  extractAtsJobIdentityFromUrl,
} from "@/app/lib/apply/atsUrlIdentity";
import {
  buildJobIdentitySnapshot,
  compareJobIdentitySnapshots,
} from "@/app/lib/jobs/jobIdentity";
import { isSavedStrategyCompatibleWithSelectedJob } from "@/app/lib/apply/savedStrategyCompatibility";

test("allows matching selected and auto-apply job identities", () => {
  const selected = buildJobIdentitySnapshot({
    source: "adzuna",
    sourceJobId: "5705905217",
    title: "Senior Software Engineer, Windows/Desktop Applications - Savannah, GA, USA",
    company: "Speechify",
    location: "Savannah, GA",
  });
  const actual = buildJobIdentitySnapshot({
    source: "adzuna",
    sourceJobId: "adzuna:5705905217",
    title: "Senior Software Engineer, Windows/Desktop Applications - Savannah, GA, USA",
    company: "Speechify",
    location: "Savannah, GA",
  });

  expect(compareJobIdentitySnapshots(selected, actual).matches).toBe(true);
});

test("blocks mismatched source job ids before auto apply starts", () => {
  const selected = buildJobIdentitySnapshot({
    source: "adzuna",
    sourceJobId: "5705905217",
    title: "Senior Software Engineer, Windows/Desktop Applications - Savannah, GA, USA",
    company: "Speechify",
  });
  const actual = buildJobIdentitySnapshot({
    source: "adzuna",
    sourceJobId: "5706004022",
    title: "Software Engineer, Data Infrastructure & Acquisition - Savannah, GA, USA",
    company: "Speechify",
  });

  const result = compareJobIdentitySnapshots(selected, actual);
  expect(result.matches).toBe(false);
  expect(result.mismatches).toContainEqual({
    field: "sourceJobId",
    expected: "5705905217",
    actual: "5706004022",
    severity: "block",
  });
});

test("rejects existing application reuse when identity belongs to another source job", () => {
  const selected = buildJobIdentitySnapshot({
    source: "adzuna",
    sourceJobId: "5705905217",
    title: "Senior Software Engineer, Windows/Desktop Applications - Savannah, GA, USA",
    company: "Speechify",
  });
  const existingApplication = buildJobIdentitySnapshot({
    source: "adzuna",
    sourceJobId: "5706004022",
    title: "Software Engineer, Data Infrastructure & Acquisition - Savannah, GA, USA",
    company: "Speechify",
    resolvedApplyUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
  });

  expect(compareJobIdentitySnapshots(selected, existingApplication).matches).toBe(false);
});

test("extracts Greenhouse job tokens from direct and embed URLs", () => {
  expect(
    extractAtsJobIdentityFromUrl(
      "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    ),
  ).toMatchObject({
    provider: "greenhouse",
    board: "speechify",
    token: "5975356004",
  });
  expect(
    extractAtsJobIdentityFromUrl(
      "https://boards.greenhouse.io/embed/job_app?for=speechify&token=5975356004",
    ),
  ).toMatchObject({
    provider: "greenhouse",
    board: "speechify",
    token: "5975356004",
  });
});

test("allows saved strategy URLs when Greenhouse tokens match", () => {
  const result = compareAtsJobIdentityFromUrls(
    "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    "https://boards.greenhouse.io/embed/job_app?for=speechify&token=5975009004",
  );

  expect(result).toMatchObject({
    comparable: true,
    matches: true,
    reason: "same_ats_token",
  });
});

test("rejects stale saved strategy URLs on the same Greenhouse host when tokens differ", () => {
  const result = compareAtsJobIdentityFromUrls(
    "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
  );

  expect(result).toMatchObject({
    comparable: true,
    matches: false,
    reason: "different_ats_token",
    expected: {
      provider: "greenhouse",
      board: "speechify",
      token: "5975009004",
    },
    actual: {
      provider: "greenhouse",
      board: "speechify",
      token: "5975356004",
    },
  });
});

test("rejects RTX Workday strategy for Speechify Greenhouse job", () => {
  const selectedJobIdentity = buildJobIdentitySnapshot({
    source: "adzuna",
    sourceJobId: "5705905217",
    title: "Senior Software Engineer, Windows/Desktop Applications - Savannah, GA, USA",
    company: "Speechify",
    resolvedApplyUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
  });

  const result = isSavedStrategyCompatibleWithSelectedJob({
    selectedJobIdentity,
    resolvedDirectUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    companyName: "Speechify",
    jobTitle: "Senior Software Engineer, Windows/Desktop Applications - Savannah, GA, USA",
    applyProvider: "greenhouse",
    strategyStartUrl: "https://careers.rtx.com/global/en",
    strategy: {
      id: "cmo83hrxg000lus1giov7wkl8",
      hostname: "rtx.com",
      sourceHost: "rtx.com",
      destinationHost: "globalhr.wd5.myworkdayjobs.com",
      strategyType: "direct_apply",
      pageType: "employer_site",
      finalUrl: "https://careers.rtx.com/global/en",
      lastAction: "no_apply_cta",
      stopReason: "HUMAN_INTERVENTION_REQUIRED",
      status: "working",
      successCount: 1,
      failureCount: 0,
      successfulReplays: 1,
      failedReplays: 0,
      instructions: "",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  });

  expect(result).toMatchObject({
    compatible: false,
    reason: "company_family_mismatch",
    severity: "reject",
    selectedProvider: "greenhouse",
  });
});
