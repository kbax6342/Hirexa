import { expect, test } from "@playwright/test";
import { collectVerificationSignals } from "@/app/lib/apply/playwrightSignals";
import { deriveStopClassification } from "@/app/lib/apply/stopClassification";

test("normal RTX apply CTA copy does not trigger verification signals", () => {
  const signals = collectVerificationSignals([
    "Apply Now",
    "Accept Cookies",
    "Apply Manually",
    "Continue to application",
  ]);

  expect(signals).toEqual([]);
});

test.describe("verification signal detection", () => {
  test("detects just a moment challenge", () => {
    const signals = collectVerificationSignals([
      "Just a moment...",
      "Checking your browser before accessing careers.rtx.com",
    ]);

    expect(signals).toContain("just a moment");
    expect(signals).toContain("checking your browser");
  });

  test("detects press and hold challenge", () => {
    const signals = collectVerificationSignals([
      "Press & Hold to confirm you are human",
    ]);

    expect(signals).toContain("press & hold");
  });

  test("detects verify-you-are-human challenge", () => {
    const signals = collectVerificationSignals([
      "Verify you are human to continue",
    ]);

    expect(signals).toContain("verify you are human");
  });

  test("detects performing-security-verification challenge", () => {
    const signals = collectVerificationSignals([
      "Performing security verification. Please wait.",
    ]);

    expect(signals).toContain("performing security verification");
  });
});

test("verification classification wins over aggregator no-cta outcome", () => {
  const stop = deriveStopClassification({
    targetUrl: "https://www.adzuna.com/jobs/details/123",
    finalUrl: "https://www.adzuna.com/jobs/details/123",
    currentUrl: "https://www.adzuna.com/jobs/details/123",
    applyCtaFound: false,
    applyCtaClicked: false,
    hopCount: 0,
    pageText: "Just a moment... checking your browser",
  });

  expect(stop.reason).toBe("verification_required");
  expect(stop.suggestedAction).toBe("complete_verification");
});

test("verification classification wins over generic no-cta outcome", () => {
  const stop = deriveStopClassification({
    targetUrl: "https://careers.rtx.com/job/456",
    finalUrl: "https://careers.rtx.com/job/456",
    currentUrl: "https://careers.rtx.com/job/456",
    applyCtaFound: false,
    applyCtaClicked: false,
    hopCount: 0,
    pageText: "Press & Hold to continue",
  });

  expect(stop.reason).toBe("verification_required");
  expect(stop.pageType).toBe("human_verification_gate");
  expect(stop.suggestedAction).toBe("complete_verification");
});

test("workable verification pages map to human verification gate", () => {
  const stop = deriveStopClassification({
    targetUrl:
      "https://jobs.workable.com/view/5qhr2iJshD2kD9o5jvZnDM/hybrid-qa-engineer-in-sandy-at-faircom",
    finalUrl:
      "https://jobs.workable.com/view/5qhr2iJshD2kD9o5jvZnDM/hybrid-qa-engineer-in-sandy-at-faircom",
    currentUrl:
      "https://jobs.workable.com/view/5qhr2iJshD2kD9o5jvZnDM/hybrid-qa-engineer-in-sandy-at-faircom",
    needsHuman: true,
    verificationSignals: ["Human verification required"],
    pageText: "Verify you are human",
  });

  expect(stop.reason).toBe("verification_required");
  expect(stop.pageType).toBe("human_verification_gate");
  expect(stop.suggestedAction).toBe("complete_verification");
  expect(stop.pageType).not.toBe("auth_gate");
});

test("login pages still classify as auth gates", () => {
  const stop = deriveStopClassification({
    targetUrl: "https://jobs.workable.com/login",
    finalUrl: "https://jobs.workable.com/login",
    currentUrl: "https://jobs.workable.com/login",
    pageText:
      "Sign in to continue. Email address Password Continue with Google Login to apply",
    hasPasswordField: true,
    applyCtaFound: false,
    applyCtaClicked: false,
    hopCount: 0,
  });

  expect(stop.reason).toBe("login_required");
  expect(stop.pageType).toBe("auth_gate");
  expect(stop.suggestedAction).toBe("sign_in_and_retry");
});
