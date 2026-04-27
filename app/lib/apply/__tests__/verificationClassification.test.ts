import { expect, test } from "@playwright/test";
import { collectVerificationSignals } from "@/app/lib/apply/playwrightSignals";
import {
  deriveStopClassification,
  shouldAllowVerificationRequired,
} from "@/app/lib/apply/stopClassification";

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

test("missing required fields do not collapse into verification required", () => {
  const stop = deriveStopClassification({
    targetUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    finalUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    status: "WAITING_HUMAN",
    needsHuman: true,
    formDetected: true,
    applyCtaFound: true,
    applyCtaClicked: true,
    hopCount: 1,
    submitButtonFound: true,
    finalReason: "missing_required_fields",
    message: "Missing required fields: Work authorization",
  });

  expect(stop.reason).toBe("missing_required_fields");
  expect(stop.pageType).toBe("application_form");
  expect(stop.suggestedAction).toBe("review_and_retry");
});

test("no-cta classification requires evidence that the universal scan actually ran", () => {
  const stop = deriveStopClassification({
    targetUrl: "https://careers.example.com/job/123",
    finalUrl: "https://careers.example.com/job/123",
    currentUrl: "https://careers.example.com/job/123",
    applyCtaFound: false,
    applyCtaClicked: false,
    hopCount: 0,
    attemptedSelectors: [],
  });

  expect(stop.reason).not.toBe("no_apply_cta");
});

test("verification required is blocked without concrete verification evidence", () => {
  const allowed = shouldAllowVerificationRequired(
    {
      status: "VERIFICATION_REQUIRED",
      verificationSignals: [],
      needsHuman: true,
    },
    {
      attemptedSelectors: [],
      applyCtaFound: false,
      applyCtaClicked: false,
      hopCount: 0,
      formScanAttempted: false,
      formFound: false,
      formFillAttempted: false,
      verificationEvidence: { detected: false },
    },
  );

  expect(allowed).toBe(false);

  const stop = deriveStopClassification({
    targetUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    finalUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    status: "VERIFICATION_REQUIRED",
    applyCtaFound: false,
    applyCtaClicked: false,
    hopCount: 0,
    attemptedSelectors: [],
    verificationEvidence: { detected: false },
  });

  expect(stop.reason).not.toBe("verification_required");
});

test("verification required is allowed for a real pre-form CAPTCHA blocker", () => {
  expect(
    shouldAllowVerificationRequired(
      {
        status: "VERIFICATION_REQUIRED",
        verificationSignals: ["recaptcha"],
        needsHuman: true,
      },
      {
        attemptedSelectors: [],
        applyCtaFound: false,
        applyCtaClicked: false,
        hopCount: 0,
        formScanAttempted: false,
        formFound: false,
        formFillAttempted: false,
        verificationEvidence: {
          detected: true,
          matchedPattern: "recaptcha",
          selector: "iframe[src*='recaptcha']",
        },
      },
    ),
  ).toBe(true);
});

test("post-submit uncertainty is not classified as human verification", () => {
  const stop = deriveStopClassification({
    targetUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    finalUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    status: "WAITING_FOR_CONFIRMATION",
    formDetected: true,
    applyCtaFound: true,
    applyCtaClicked: true,
    submitButtonFound: true,
    submitButtonClicked: true,
    confirmationTextFound: false,
    verificationSignals: [],
    missingRequiredFields: [],
  });

  expect(stop.reason).toBe("submission_status_unclear");
  expect(stop.pageType).toBe("post_submit_unknown");
  expect(stop.suggestedAction).toBe("check_confirmation_tab_or_email");
});

test("post-submit validation errors outrank generic missing fields", () => {
  const stop = deriveStopClassification({
    targetUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    finalUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    currentUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    status: "NEEDS_USER_ANSWERS",
    formDetected: true,
    applyCtaFound: true,
    applyCtaClicked: true,
    submitButtonFound: true,
    submitButtonClicked: true,
    confirmationTextFound: false,
    finalReason: "submit_blocked_by_validation_errors",
    message:
      "Submit blocked by validation errors. Greenhouse returned validation errors after submit.",
    missingRequiredFields: ["Please select a location. — Where are you located?"],
  });

  expect(stop.reason).toBe("submit_blocked_by_validation_errors");
  expect(stop.pageType).toBe("application_form");
  expect(stop.suggestedAction).toBe("review_validation_errors");
});
