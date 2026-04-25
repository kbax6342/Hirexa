import type { ApplyStopClassification } from "@/app/lib/apply/stopClassification";

export const APPLY_AUTOMATION_ERROR_CODES = [
  "WRONG_EMPLOYER_DOMAIN",
  "REAL_POSTING_NOT_FOUND",
  "REMOTE_PROVIDER_UNAVAILABLE",
  "REMOTE_SESSION_DISCONNECTED",
  "REMOTE_SESSION_EXPIRED",
] as const;

export type ApplyAutomationErrorCode =
  (typeof APPLY_AUTOMATION_ERROR_CODES)[number];

export function isApplyAutomationErrorCode(
  value: string | null | undefined,
): value is ApplyAutomationErrorCode {
  return APPLY_AUTOMATION_ERROR_CODES.includes(
    String(value ?? "").trim().toUpperCase() as ApplyAutomationErrorCode,
  );
}

export function normalizeApplyAutomationErrorCode(
  value: string | null | undefined,
): ApplyAutomationErrorCode | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return isApplyAutomationErrorCode(normalized) ? normalized : null;
}

export function getApplyAutomationErrorMessage(code: ApplyAutomationErrorCode) {
  switch (code) {
    case "WRONG_EMPLOYER_DOMAIN":
      return "The selected URL belongs to a different employer than this job.";
    case "REAL_POSTING_NOT_FOUND":
      return "Hirexa could not confirm a real employer job posting URL.";
    case "REMOTE_PROVIDER_UNAVAILABLE":
      return "The configured remote browser provider is unavailable.";
    case "REMOTE_SESSION_DISCONNECTED":
      return "The remote browser session disconnected before completion.";
    case "REMOTE_SESSION_EXPIRED":
      return "The remote browser session expired and cannot be resumed.";
    default:
      return "Auto apply could not continue.";
  }
}

export function inferApplyAutomationErrorCode(args: {
  errorCode?: string | null;
  stopClassification?: ApplyStopClassification | null;
  status?: string | null;
  message?: string | null;
  finalReason?: string | null;
}) {
  const explicit = normalizeApplyAutomationErrorCode(args.errorCode);
  if (explicit) return explicit;

  if (args.stopClassification?.reason === "wrong_employer_domain") {
    return "WRONG_EMPLOYER_DOMAIN" as const;
  }

  if (args.stopClassification?.reason === "real_posting_not_found") {
    return "REAL_POSTING_NOT_FOUND" as const;
  }

  const text = [args.message, args.finalReason, args.status]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLowerCase();

  if (
    text.includes("wrong_employer_domain") ||
    text.includes("wrong employer domain")
  ) {
    return "WRONG_EMPLOYER_DOMAIN" as const;
  }

  if (
    text.includes("real_posting_not_found") ||
    text.includes("real posting not found")
  ) {
    return "REAL_POSTING_NOT_FOUND" as const;
  }

  if (
    text.includes("remote browser requested without a configured provider") ||
    ((text.includes("missing required env var") ||
      text.includes("missing environment variable")) &&
      (text.includes("remote_browser_provider") ||
        text.includes("browserbase") ||
        text.includes("openclaw") ||
        text.includes("scrapfly")))
  ) {
    return "REMOTE_PROVIDER_UNAVAILABLE" as const;
  }

  if (
    text.includes("session expired") ||
    text.includes("session not found") ||
    text.includes("no resumable scrapfly session")
  ) {
    return "REMOTE_SESSION_EXPIRED" as const;
  }

  if (
    text.includes("session disconnected") ||
    text.includes("browser has been closed") ||
    text.includes("target page, context or browser has been closed") ||
    text.includes("websocket is not open") ||
    text.includes("connection closed")
  ) {
    return "REMOTE_SESSION_DISCONNECTED" as const;
  }

  return null;
}

export function prefixErrorCodeInMessage(args: {
  errorCode?: string | null;
  message?: string | null;
}) {
  const normalizedCode = normalizeApplyAutomationErrorCode(args.errorCode);
  const message = String(args.message ?? "").trim();
  if (!normalizedCode) return message || null;
  if (!message) return normalizedCode;
  if (message.toUpperCase().includes(normalizedCode)) return message;
  return `${normalizedCode}: ${message}`;
}
