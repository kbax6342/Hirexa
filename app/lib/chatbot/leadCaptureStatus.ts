export const LEAD_CAPTURE_STATUS_OPTIONS = [
  {
    value: "New Lead",
    label: "New Lead",
    meaning: "The lead was captured by the chatbot and has not been reviewed yet.",
    badgeClassName: "border-red-300 bg-red-50 text-red-700",
  },
  {
    value: "Needs Follow-Up",
    label: "Needs Follow-Up",
    meaning: "The lead needs a call, text, or email from the staffing agency.",
    badgeClassName: "border-orange-300 bg-orange-50 text-orange-700",
  },
  {
    value: "Contacted",
    label: "Contacted",
    meaning:
      "The staffing agency has already contacted the lead and is waiting on the next step.",
    badgeClassName: "border-yellow-300 bg-yellow-50 text-yellow-700",
  },
  {
    value: "Qualified Lead",
    label: "Qualified Lead",
    meaning:
      "The lead looks like a strong candidate or employer lead and is ready to move forward.",
    badgeClassName: "border-green-300 bg-green-50 text-green-700",
  },
] as const;

export type LeadCaptureStatus =
  (typeof LEAD_CAPTURE_STATUS_OPTIONS)[number]["value"];

export const DEFAULT_LEAD_CAPTURE_STATUS: LeadCaptureStatus = "New Lead";

export function isLeadCaptureStatus(value: unknown): value is LeadCaptureStatus {
  return LEAD_CAPTURE_STATUS_OPTIONS.some((option) => option.value === value);
}

export function normalizeLeadCaptureStatus(value: unknown): LeadCaptureStatus {
  return isLeadCaptureStatus(value) ? value : DEFAULT_LEAD_CAPTURE_STATUS;
}

export function getLeadCaptureStatusOption(value: unknown) {
  const status = normalizeLeadCaptureStatus(value);
  return LEAD_CAPTURE_STATUS_OPTIONS.find((option) => option.value === status)!;
}
