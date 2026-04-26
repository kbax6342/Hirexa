import { expect, test } from "@playwright/test";
import {
  isSearchEngineChallengeUrl,
  validateAutomationStartUrl,
} from "@/app/lib/apply/urlValidation";

test("rejects favicon and static asset URLs as automation starts", () => {
  const favicon = validateAutomationStartUrl(
    "https://zunastatic-abf.kxcdn.com/images/global/jobs/favicon.ico",
  );
  const image = validateAutomationStartUrl(
    "https://jobs.example.com/assets/job-banner.png",
  );

  expect(favicon.isValid).toBeFalsy();
  expect(favicon.reason).toBe("favicon_asset");
  expect(image.isValid).toBeFalsy();
  expect(image.reason).toBe("static_asset_extension");
});

test("rejects aggregator URLs and allows direct ATS/job-detail URLs", () => {
  const aggregator = validateAutomationStartUrl(
    "https://www.adzuna.com/details/123456?utm_source=feed",
  );
  const directAts = validateAutomationStartUrl(
    "https://boards.greenhouse.io/example/jobs/1234567",
  );

  expect(aggregator.isValid).toBeFalsy();
  expect(aggregator.reason).toBe("aggregator_url");
  expect(directAts.isValid).toBeTruthy();
});

test("detects search engine challenge URLs", () => {
  const challengeUrl =
    "https://www.ecosia.org/sorry/index?continue=https%3A%2F%2Fwww.ecosia.org%2Fsearch";
  const validation = validateAutomationStartUrl(challengeUrl);

  expect(isSearchEngineChallengeUrl(challengeUrl)).toBeTruthy();
  expect(validation.isValid).toBeFalsy();
  expect(validation.reason).toBe("search_engine_challenge_page");
});

test("rejects non-job posting company pages", () => {
  const benefits = validateAutomationStartUrl(
    "https://jobs.republicservices.com/us/en/about-us/benefits",
  );
  const searchResults = validateAutomationStartUrl(
    "https://careers.rtx.com/global/en/search-results",
  );

  expect(benefits.isValid).toBeFalsy();
  expect(benefits.reason).toBe("non_job_posting_path");
  expect(searchResults.isValid).toBeFalsy();
  expect(searchResults.reason).toBe("non_job_posting_path");
});

test("rejects explicit SERP URLs as automation start pages", () => {
  const urls = [
    "https://www.google.com/search?q=Flight+Management+Systems+Software+Engineer+Kronos+Consulting+Phoenix+AZ",
    "https://serpapi.com/search?q=Flight+Management+Systems+Software+Engineer",
    "https://duckduckgo.com/html/?q=Kronos+Consulting",
    "https://duckduckgo.com/?q=Kronos+Consulting",
    "https://www.bing.com/search?q=Kronos+Consulting",
    "https://search.yahoo.com/search?p=Kronos+Consulting",
  ];

  for (const url of urls) {
    const validation = validateAutomationStartUrl(url);
    expect(validation.isValid).toBeFalsy();
    expect(validation.reason).toBe("search_engine_results_page");
  }
});
