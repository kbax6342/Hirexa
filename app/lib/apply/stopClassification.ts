export type ApplyStopReason =
  | "no_apply_cta"
  | "apply_cta_click_failed"
  | "adzuna_rate_limited"
  | "login_required"
  | "account_required"
  | "verification_required"
  | "real_verification_required"
  | "ai_form_answers_generated"
  | "ai_form_autofill_completed"
  | "user_review_required_for_form_fields"
  | "missing_required_answers_after_ai"
  | "missing_required_fields"
  | "unsupported_required_field"
  | "form_not_found_after_apply"
  | "user_review_required"
  | "human_verification_required"
  | "wrong_employer_domain"
  | "invalid_start_url"
  | "real_posting_not_found"
  | "search_results_no_strong_match"
  | "candidate_needs_review"
  | "aggregator_no_cta"
  | "external_redirect_needed"
  | "unknown_human_intervention";

export type ApplyStopPageType =
  | "human_verification_gate"
  | "adzuna_rate_limited"
  | "adzuna_login_continue_gate"
  | "search"
  | "job_posting_candidate"
  | "aggregator"
  | "resolver_failure"
  | "employer_site"
  | "auth_gate"
  | "handoff_page"
  | "job_page"
  | "application_form"
  | "unknown";

export type ApplyStopSuggestedAction =
  | "open_original_job_site"
  | "try_again_later_or_employer_direct_search"
  | "open_real_job_posting"
  | "review_possible_real_posting"
  | "sign_in_and_retry"
  | "login_to_continue"
  | "complete_verification"
  | "teach_this_page"
  | "review_and_retry";

export type ApplyStopClassification = {
  reason: ApplyStopReason;
  pageType: ApplyStopPageType;
  suggestedAction: ApplyStopSuggestedAction;
};

export type VerificationEvidence = {
  detected: boolean;
  matchedPattern?: string;
  textSnippet?: string | null;
  selector?: string;
  url?: string;
  title?: string;
};

export const APPLY_STOP_REASONS: ApplyStopReason[] = [
  "no_apply_cta",
  "apply_cta_click_failed",
  "adzuna_rate_limited",
  "login_required",
  "account_required",
  "verification_required",
  "real_verification_required",
  "ai_form_answers_generated",
  "ai_form_autofill_completed",
  "user_review_required_for_form_fields",
  "missing_required_answers_after_ai",
  "missing_required_fields",
  "unsupported_required_field",
  "form_not_found_after_apply",
  "user_review_required",
  "human_verification_required",
  "wrong_employer_domain",
  "invalid_start_url",
  "real_posting_not_found",
  "search_results_no_strong_match",
  "candidate_needs_review",
  "aggregator_no_cta",
  "external_redirect_needed",
  "unknown_human_intervention",
];

type StopClassificationInput = {
  targetUrl?: string | null;
  finalUrl?: string | null;
  currentUrl?: string | null;
  attemptedSelectors?: string[] | null;
  applyCtaFound?: boolean;
  applyCtaClicked?: boolean;
  hopCount?: number;
  submitButtonFound?: boolean;
  submitButtonClicked?: boolean;
  confirmationTextFound?: boolean;
  verificationSignals?: string[];
  verificationEvidence?: VerificationEvidence | null;
  status?: string | null;
  needsHuman?: boolean;
  hasPasswordField?: boolean;
  pageText?: string | null;
  finalReason?: string | null;
  message?: string | null;
  lastAction?: string | null;
  formDetected?: boolean;
  formScanAttempted?: boolean;
  formFound?: boolean;
  formFillAttempted?: boolean;
  filledFieldCount?: number;
  requiredFieldCount?: number;
  missingRequiredFields?: string[] | null;
  unsupportedRequiredFields?: string[] | null;
  aiFormAnswerEngineRan?: boolean | null;
  aiFormAnswersGenerated?: boolean | null;
  aiFormAutofillCompleted?: boolean | null;
  aiFormBlockedCount?: number | null;
  aiFormRemainingRequiredFields?: string[] | null;
  aiFormBlockedFields?: Array<{
    fieldId?: string;
    label?: string;
    reason?: string;
    category?: string;
  }> | null;
};

export const APPLY_STOP_AGGREGATOR_HOST_PATTERNS = [
  "adzuna.",
  "indeed.",
  "ziprecruiter.",
  "glassdoor.",
  "simplyhired.",
];

const LOGIN_KEYWORDS = [
  "log in",
  "login",
  "sign in",
  "signin",
  "login to apply",
  "create account to apply",
  "create an account to apply",
  "password",
  "email address",
];

const OAUTH_LOGIN_KEYWORDS = [
  "continue with google",
  "continue with microsoft",
  "continue with linkedin",
  "sign in with google",
  "sign in with microsoft",
  "sign in with linkedin",
] as const;

const VERIFICATION_KEYWORDS = [
  "just a moment",
  "verify you are human",
  "verify you're human",
  "verify that you are human",
  "prove you are human",
  "are you human",
  "human verification",
  "performing security verification",
  "checking your browser",
  "checking if you are human",
  "checking if the site connection is secure",
  "please enable javascript and cookies",
  "press & hold",
  "press and hold",
  "captcha",
  "hcaptcha",
  "recaptcha",
  "turnstile",
  "cloudflare",
  "cf-chl",
  "security check",
  "security verification",
  "complete verification",
  "verification required",
  "verification code",
  "verify your email",
  "email verification",
  "one-time passcode",
  "one time passcode",
  "one-time code",
  "one time code",
  "otp",
  "check your email",
];

const INVALID_START_URL_KEYWORDS = [
  "invalid start url",
  "favicon_asset",
  "static_asset_extension",
  "known_asset_host",
];

const REAL_POSTING_NOT_FOUND_KEYWORDS = [
  "real posting not found",
  "real_posting_not_found",
];

const SEARCH_RESULTS_NO_STRONG_MATCH_KEYWORDS = [
  "search_results_no_strong_match",
  "search results no strong match",
  "no search result met the direct employer posting threshold",
];

const ADZUNA_RATE_LIMIT_KEYWORDS = [
  "adzuna_rate_limited",
  "adzuna handoff rate limited",
  "adzuna_handoff_rate_limited",
  "adzuna rate limited",
  "rate-limited",
  "too many requests",
];

const WRONG_EMPLOYER_DOMAIN_KEYWORDS = [
  "wrong employer domain",
  "wrong_employer_domain",
];

const MISSING_REQUIRED_FIELDS_KEYWORDS = [
  "missing_required_fields",
  "missing_required_answers_after_ai",
  "missing required fields",
  "missing required field",
];

const RTX_RECOVERY_KEYWORDS = [
  "rtx_",
  "rtx_prelude_error",
  "rtx_workday_not_reached",
  "rtx_meaningful_form_control_not_found",
];

function parseHostname(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
  }
}

function includesAnySignal(text: string, checks: readonly string[]) {
  return checks.some((check) => text.includes(check));
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeSignalText(args: StopClassificationInput) {
  return [
    args.targetUrl,
    args.finalUrl,
    args.currentUrl,
    args.finalReason,
    args.message,
    args.lastAction,
    args.pageText,
    ...(args.verificationSignals ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLowerCase();
}

export function shouldAllowVerificationRequired(
  result: {
    status?: string | null;
    lastAction?: string | null;
    verificationSignals?: string[] | null;
    needsHuman?: boolean | null;
  } | null | undefined,
  pageEvidence: {
    attemptedSelectors?: string[] | null;
    applyCtaFound?: boolean | null;
    applyCtaClicked?: boolean | null;
    hopCount?: number | null;
    formScanAttempted?: boolean | null;
    formFound?: boolean | null;
    formFillAttempted?: boolean | null;
    verificationEvidence?: VerificationEvidence | null;
  } | null | undefined,
) {
  const evidence = pageEvidence?.verificationEvidence;
  const hasRealVerificationEvidence =
    evidence?.detected === true &&
    Boolean(evidence.matchedPattern || evidence.selector || evidence.textSnippet);
  if (!hasRealVerificationEvidence) {
    return false;
  }

  const verificationSignalPresent =
    normalizeStatus(result?.status) === "VERIFICATION_REQUIRED" ||
    result?.lastAction === "verification_required" ||
    (Array.isArray(result?.verificationSignals) &&
      result.verificationSignals.length > 0) ||
    result?.needsHuman === true ||
    hasRealVerificationEvidence;
  if (!verificationSignalPresent) {
    return false;
  }

  const attemptedSelectors = pageEvidence?.attemptedSelectors ?? [];
  const hopCount =
    typeof pageEvidence?.hopCount === "number" ? pageEvidence.hopCount : 0;
  const preFormBlocked =
    attemptedSelectors.length === 0 &&
    hopCount === 0 &&
    pageEvidence?.applyCtaFound !== true &&
    pageEvidence?.applyCtaClicked !== true &&
    pageEvidence?.formScanAttempted !== true &&
    pageEvidence?.formFound !== true;
  const attemptedApplicationFlow =
    pageEvidence?.formScanAttempted === true ||
    pageEvidence?.formFillAttempted === true ||
    pageEvidence?.applyCtaClicked === true ||
    hopCount > 0;

  return preFormBlocked || attemptedApplicationFlow;
}

export function isAggregatorStopHostname(hostname: string) {
  return APPLY_STOP_AGGREGATOR_HOST_PATTERNS.some((pattern) =>
    hostname.includes(pattern),
  );
}

export function isApplyStopReason(value: string): value is ApplyStopReason {
  return APPLY_STOP_REASONS.includes(value as ApplyStopReason);
}

export function deriveStopClassification(
  args: StopClassificationInput,
): ApplyStopClassification {
  const targetHostname = parseHostname(args.targetUrl);
  const finalHostname = parseHostname(args.finalUrl);
  const currentHostname = parseHostname(args.currentUrl);
  const activeHostname = currentHostname || finalHostname || targetHostname;
  const signalText = normalizeSignalText(args);
  const normalizedStatus = normalizeStatus(args.status);
  const hopCount = typeof args.hopCount === "number" ? args.hopCount : 0;
  const ctaScanRan =
    Array.isArray(args.attemptedSelectors) &&
    args.attemptedSelectors.length > 0;
  const applyCtaMissing =
    ctaScanRan &&
    (args.applyCtaFound === false ||
      (args.applyCtaClicked !== true && hopCount === 0));
  const hasMissingRequiredFieldSignals =
    args.lastAction === "missing_required_fields" ||
    (Array.isArray(args.missingRequiredFields) &&
      args.missingRequiredFields.length > 0) ||
    (Array.isArray(args.aiFormRemainingRequiredFields) &&
      args.aiFormRemainingRequiredFields.length > 0) ||
    includesAnySignal(signalText, MISSING_REQUIRED_FIELDS_KEYWORDS);
  const hasAiFormReviewSignals =
    args.aiFormAnswerEngineRan === true &&
    ((typeof args.aiFormBlockedCount === "number" && args.aiFormBlockedCount > 0) ||
      (Array.isArray(args.aiFormBlockedFields) &&
        args.aiFormBlockedFields.length > 0) ||
      signalText.includes("user_review_required_for_form_fields"));
  const hasUnsupportedRequiredFieldSignals =
    args.lastAction === "unsupported_required_field" ||
    (Array.isArray(args.unsupportedRequiredFields) &&
      args.unsupportedRequiredFields.length > 0) ||
    signalText.includes("unsupported_required_field") ||
    signalText.includes("unsupported required field");
  const hasVerificationSignals =
    (Array.isArray(args.verificationSignals) &&
      args.verificationSignals.length > 0) ||
    includesAnySignal(signalText, VERIFICATION_KEYWORDS);
  const inferredVerificationEvidence =
    args.verificationEvidence ??
    (hasVerificationSignals
      ? {
          detected: true,
          matchedPattern:
            args.verificationSignals?.[0] ??
            VERIFICATION_KEYWORDS.find((keyword) => signalText.includes(keyword)),
        }
      : null);
  const allowVerificationRequired = shouldAllowVerificationRequired(
    {
      status: normalizedStatus,
      lastAction: args.lastAction,
      verificationSignals: args.verificationSignals,
      needsHuman: args.needsHuman,
    },
    {
      attemptedSelectors: args.attemptedSelectors,
      applyCtaFound: args.applyCtaFound,
      applyCtaClicked: args.applyCtaClicked,
      hopCount,
      formScanAttempted: args.formScanAttempted,
      formFound: args.formFound ?? args.formDetected,
      formFillAttempted: args.formFillAttempted,
      verificationEvidence: inferredVerificationEvidence,
    },
  );
  const hasPasswordSignal =
    args.hasPasswordField === true || signalText.includes("password");
  const hasEmailPasswordSignal =
    signalText.includes("email address") && hasPasswordSignal;
  const hasOauthSignals = includesAnySignal(signalText, OAUTH_LOGIN_KEYWORDS);
  const hasLoginSignals =
    args.lastAction === "login_required" ||
    hasOauthSignals ||
    hasEmailPasswordSignal ||
    (includesAnySignal(signalText, LOGIN_KEYWORDS) &&
      (hasPasswordSignal ||
        signalText.includes("to apply") ||
        signalText.includes("sign in to continue")));
  const adzunaLandAdSignal =
    signalText.includes("adzuna.com/land/ad/") ||
    signalText.includes("/land/ad/");
  const hasAdzunaRateLimitSignals =
    includesAnySignal(signalText, ADZUNA_RATE_LIMIT_KEYWORDS) ||
    (adzunaLandAdSignal && signalText.includes("429")) ||
    (adzunaLandAdSignal && signalText.includes("rate limit"));
  const aggregatorHost = isAggregatorStopHostname(activeHostname);
  const hostChanged =
    Boolean(targetHostname) &&
    Boolean(activeHostname) &&
    targetHostname !== activeHostname;

  if (hasAdzunaRateLimitSignals) {
    return {
      reason: "adzuna_rate_limited",
      pageType: "adzuna_rate_limited",
      suggestedAction: "try_again_later_or_employer_direct_search",
    };
  }

  if (hasVerificationSignals && allowVerificationRequired) {
    return {
      reason: "verification_required",
      pageType: "human_verification_gate",
      suggestedAction: "complete_verification",
    };
  }

  if (hasLoginSignals) {
    return {
      reason: "login_required",
      pageType: "auth_gate",
      suggestedAction: "sign_in_and_retry",
    };
  }

  if (hasAiFormReviewSignals) {
    return {
      reason: "user_review_required_for_form_fields",
      pageType: "application_form",
      suggestedAction: "review_and_retry",
    };
  }

  if (hasMissingRequiredFieldSignals) {
    return {
      reason: args.aiFormAnswerEngineRan
        ? "missing_required_answers_after_ai"
        : "missing_required_fields",
      pageType: "application_form",
      suggestedAction: "review_and_retry",
    };
  }

  if (hasUnsupportedRequiredFieldSignals) {
    return {
      reason: "unsupported_required_field",
      pageType: "application_form",
      suggestedAction: "review_and_retry",
    };
  }

  if (
    args.applyCtaClicked === true &&
    args.formScanAttempted === true &&
    args.formFound === false
  ) {
    return {
      reason: "form_not_found_after_apply",
      pageType: "employer_site",
      suggestedAction: "review_and_retry",
    };
  }

  if (aggregatorHost && applyCtaMissing) {
    return {
      reason: "aggregator_no_cta",
      pageType: "aggregator",
      suggestedAction: "open_original_job_site",
    };
  }

  if (includesAnySignal(signalText, REAL_POSTING_NOT_FOUND_KEYWORDS)) {
    return {
      reason: "real_posting_not_found",
      pageType: "resolver_failure",
      suggestedAction: "open_original_job_site",
    };
  }

  if (includesAnySignal(signalText, SEARCH_RESULTS_NO_STRONG_MATCH_KEYWORDS)) {
    return {
      reason: "search_results_no_strong_match",
      pageType: "resolver_failure",
      suggestedAction: "open_original_job_site",
    };
  }

  if (includesAnySignal(signalText, WRONG_EMPLOYER_DOMAIN_KEYWORDS)) {
    return {
      reason: "wrong_employer_domain",
      pageType: "resolver_failure",
      suggestedAction: "open_original_job_site",
    };
  }

  if (includesAnySignal(signalText, INVALID_START_URL_KEYWORDS)) {
    return {
      reason: "invalid_start_url",
      pageType: "aggregator",
      suggestedAction: "open_original_job_site",
    };
  }

  if (includesAnySignal(signalText, RTX_RECOVERY_KEYWORDS)) {
    return {
      reason: "unknown_human_intervention",
      pageType: args.formDetected ? "application_form" : "employer_site",
      suggestedAction: "review_and_retry",
    };
  }

  if (
    hostChanged &&
    args.applyCtaClicked === true &&
    args.submitButtonClicked !== true &&
    args.confirmationTextFound !== true
  ) {
    return {
      reason: "external_redirect_needed",
      pageType: args.formDetected ? "application_form" : "employer_site",
      suggestedAction: "review_and_retry",
    };
  }

  if (applyCtaMissing) {
    return {
      reason: "no_apply_cta",
      pageType: args.formDetected ? "application_form" : "employer_site",
      suggestedAction: "review_and_retry",
    };
  }

  return {
    reason: "unknown_human_intervention",
    pageType: args.formDetected ? "application_form" : "unknown",
    suggestedAction: "teach_this_page",
  };
}

export function getStopReasonLabel(reason: ApplyStopReason) {
  switch (reason) {
    case "no_apply_cta":
      return "No apply button was found";
    case "apply_cta_click_failed":
      return "Apply button click failed";
    case "adzuna_rate_limited":
      return "Adzuna rate-limited handoff";
    case "login_required":
      return "Sign-in required";
    case "account_required":
      return "Account required";
    case "verification_required":
      return "Verification required";
    case "real_verification_required":
      return "Real verification required";
    case "ai_form_answers_generated":
      return "AI form answers generated";
    case "ai_form_autofill_completed":
      return "AI form autofill completed";
    case "user_review_required_for_form_fields":
      return "User review required for form fields";
    case "missing_required_answers_after_ai":
      return "Missing required answers after AI";
    case "missing_required_fields":
      return "Missing required fields";
    case "unsupported_required_field":
      return "Unsupported required field";
    case "form_not_found_after_apply":
      return "Application form was not found after apply";
    case "user_review_required":
      return "User review required";
    case "human_verification_required":
      return "Human verification required";
    case "wrong_employer_domain":
      return "Wrong employer domain";
    case "invalid_start_url":
      return "Start URL was invalid";
    case "real_posting_not_found":
      return "Real posting was not found";
    case "search_results_no_strong_match":
      return "Search results had no strong employer match";
    case "candidate_needs_review":
      return "A possible job posting needs review";
    case "aggregator_no_cta":
      return "No apply button was found on the aggregator page";
    case "external_redirect_needed":
      return "A redirect to another application page is needed";
    case "unknown_human_intervention":
    default:
      return "Human intervention is required";
  }
}

export function getStopPageTypeLabel(pageType: ApplyStopPageType) {
  switch (pageType) {
    case "human_verification_gate":
      return "Human verification gate";
    case "adzuna_rate_limited":
      return "Adzuna rate-limited handoff";
    case "adzuna_login_continue_gate":
      return "Adzuna login gate";
    case "search":
      return "Search page";
    case "job_posting_candidate":
      return "Job posting candidate";
    case "resolver_failure":
      return "Resolver failure";
    case "handoff_page":
      return "Handoff page";
    case "job_page":
    case "aggregator":
    case "employer_site":
    case "application_form":
      return "Job page";
    case "auth_gate":
      return "Auth gate";
    case "unknown":
    default:
      return "Unknown page";
  }
}

export function getStopSuggestedActionLabel(
  suggestedAction: ApplyStopSuggestedAction,
) {
  switch (suggestedAction) {
    case "open_original_job_site":
      return "Open original job site";
    case "try_again_later_or_employer_direct_search":
      return "Retry later or search employer site";
    case "open_real_job_posting":
      return "Open real job posting";
    case "review_possible_real_posting":
      return "Review possible real posting";
    case "sign_in_and_retry":
      return "Sign in and retry";
    case "login_to_continue":
      return "Login to continue";
    case "complete_verification":
      return "Complete verification";
    case "teach_this_page":
      return "Teach this page";
    case "review_and_retry":
    default:
      return "Review and retry";
  }
}
