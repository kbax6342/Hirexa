export type ApplyStopReason =
  | "no_apply_cta"
  | "adzuna_rate_limited"
  | "login_required"
  | "verification_required"
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

export const APPLY_STOP_REASONS: ApplyStopReason[] = [
  "no_apply_cta",
  "adzuna_rate_limited",
  "login_required",
  "verification_required",
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
  applyCtaFound?: boolean;
  applyCtaClicked?: boolean;
  hopCount?: number;
  submitButtonFound?: boolean;
  submitButtonClicked?: boolean;
  confirmationTextFound?: boolean;
  verificationSignals?: string[];
  status?: string | null;
  needsHuman?: boolean;
  hasPasswordField?: boolean;
  pageText?: string | null;
  finalReason?: string | null;
  message?: string | null;
  lastAction?: string | null;
  formDetected?: boolean;
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
  const applyCtaMissing =
    args.applyCtaFound === false ||
    (args.applyCtaClicked !== true && hopCount === 0);
  const hasVerificationSignals =
    args.needsHuman === true ||
    normalizedStatus === "VERIFICATION_REQUIRED" ||
    normalizedStatus === "WAITING_HUMAN" ||
    args.lastAction === "verification_required" ||
    (Array.isArray(args.verificationSignals) &&
      args.verificationSignals.length > 0) ||
    includesAnySignal(signalText, VERIFICATION_KEYWORDS);
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

  if (hasVerificationSignals) {
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
    case "adzuna_rate_limited":
      return "Adzuna rate-limited handoff";
    case "login_required":
      return "Sign-in required";
    case "verification_required":
      return "Verification required";
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
