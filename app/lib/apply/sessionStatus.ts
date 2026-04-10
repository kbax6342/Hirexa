export const APPLY_SESSION_STATUSES = [
  "STARTING",
  "FINDING_APPLY",
  "OPENING_FORM",
  "FILLING_FORM",
  "SUBMITTING",
  "WAITING_CONFIRMATION",
  "WAITING_HUMAN",
  "SUBMITTED",
  "AUTO_APPLY_UNAVAILABLE",
  "FAILED",
  "RUNNING",
  "DONE",
] as const;

export type ApplySessionStatus = (typeof APPLY_SESSION_STATUSES)[number];

const TERMINAL_STATUSES = new Set<ApplySessionStatus>([
  "SUBMITTED",
  "AUTO_APPLY_UNAVAILABLE",
  "FAILED",
  "DONE",
]);

const SUCCESS_STATUSES = new Set<ApplySessionStatus>(["SUBMITTED", "DONE"]);

export function normalizeApplySessionStatus(
  status: string | null | undefined,
): ApplySessionStatus | null {
  if (!status) return null;

  const normalized = status.trim().toUpperCase();
  return APPLY_SESSION_STATUSES.find((value) => value === normalized) ?? null;
}

export function isApplySessionTerminalStatus(
  status: string | null | undefined,
): boolean {
  const normalized = normalizeApplySessionStatus(status);
  return normalized ? TERMINAL_STATUSES.has(normalized) : false;
}

export function isApplySessionSuccessStatus(
  status: string | null | undefined,
): boolean {
  const normalized = normalizeApplySessionStatus(status);
  return normalized ? SUCCESS_STATUSES.has(normalized) : false;
}

export function toApplySessionDisplayStatus(
  status: string | null | undefined,
): ApplySessionStatus | null {
  const normalized = normalizeApplySessionStatus(status);
  if (!normalized) return null;

  switch (normalized) {
    case "DONE":
      return "SUBMITTED";
    case "RUNNING":
      return "STARTING";
    case "WAITING_HUMAN":
      return "AUTO_APPLY_UNAVAILABLE";
    default:
      return normalized;
  }
}
