import { expect, test } from "@playwright/test";
import { extractAtsJobIdentityFromUrl } from "@/app/lib/apply/atsUrlIdentity";
import {
  buildJobIdentitySnapshot,
  compareJobIdentitySnapshots,
} from "@/app/lib/jobs/jobIdentity";

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
