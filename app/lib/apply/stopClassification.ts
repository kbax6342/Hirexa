export type ApplyStopReason =
  | "no_apply_cta"
  | "login_required"
  | "verification_required"
  | "invalid_start_url"
  | "real_posting_not_found"
  | "aggregator_no_cta"
  | "external_redirect_needed"
  | "unknown_human_intervention";

export type ApplyStopPageType =
  | "aggregator"
  | "employer_site"
  | "auth_gate"
  | "application_form"
  | "unknown";

export type ApplyStopSuggestedAction =
  | "open_original_job_site"
  | "sign_in_and_retry"
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
  "login_required",
  "verification_required",
  "invalid_start_url",
  "real_posting_not_found",
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
  "sign into",
  "create account",
  "sign up",
  "register",
  "password",
  "forgot password",
];

const VERIFICATION_KEYWORDS = [
  "just a moment",
  "verify you are human",
  "human verification",
  "checking your browser",
  "please enable javascript and cookies",
  "press & hold",
  "press and hold",
  "captcha",
  "recaptcha",
  "turnstile",
  "cloudflare",
  "security check",
  "security verification",
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
  const hopCount = typeof args.hopCount === "number" ? args.hopCount : 0;
  const applyCtaMissing =
    args.applyCtaFound === false ||
    (args.applyCtaClicked !== true && hopCount === 0);
  const hasLoginSignals =
    args.lastAction === "login_required" ||
    includesAnySignal(signalText, LOGIN_KEYWORDS);
  const hasVerificationSignals =
    args.lastAction === "verification_required" ||
    (Array.isArray(args.verificationSignals) &&
      args.verificationSignals.length > 0) ||
    includesAnySignal(signalText, VERIFICATION_KEYWORDS);
  const aggregatorHost = isAggregatorStopHostname(activeHostname);
  const hostChanged =
    Boolean(targetHostname) &&
    Boolean(activeHostname) &&
    targetHostname !== activeHostname;

  if (aggregatorHost && applyCtaMissing) {
    return {
      reason: "aggregator_no_cta",
      pageType: "aggregator",
      suggestedAction: "open_original_job_site",
    };
  }

  if (hasLoginSignals && !hasVerificationSignals) {
    return {
      reason: "login_required",
      pageType: "auth_gate",
      suggestedAction: "sign_in_and_retry",
    };
  }

  if (hasVerificationSignals) {
    return {
      reason: "verification_required",
      pageType: "auth_gate",
      suggestedAction: "complete_verification",
    };
  }

  if (includesAnySignal(signalText, REAL_POSTING_NOT_FOUND_KEYWORDS)) {
    return {
      reason: "real_posting_not_found",
      pageType: "aggregator",
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
    case "login_required":
      return "Sign-in required";
    case "verification_required":
      return "Verification required";
    case "invalid_start_url":
      return "Start URL was invalid";
    case "real_posting_not_found":
      return "Real posting was not found";
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
    case "aggregator":
      return "Aggregator";
    case "employer_site":
      return "Employer site";
    case "auth_gate":
      return "Auth gate";
    case "application_form":
      return "Application form";
    case "unknown":
    default:
      return "Unknown";
  }
}

export function getStopSuggestedActionLabel(
  suggestedAction: ApplyStopSuggestedAction,
) {
  switch (suggestedAction) {
    case "open_original_job_site":
      return "Open original job site";
    case "sign_in_and_retry":
      return "Sign in and retry";
    case "complete_verification":
      return "Complete verification";
    case "teach_this_page":
      return "Teach this page";
    case "review_and_retry":
    default:
      return "Review and retry";
  }
}
