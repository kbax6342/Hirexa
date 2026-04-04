import {
  BoltIcon,
  BriefcaseIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

export const PRIMARY_SUPPORT_OPTIONS = [
  {
    title: "Just show me matches",
    description: "I want to browse jobs myself.",
    icon: BriefcaseIcon,
  },
  {
    title: "Help me tailor applications",
    description: "Suggest better resumes, answers, and outreach.",
    icon: DocumentTextIcon,
  },
  {
    title: "Be my job search copilot",
    description: "Find jobs, draft applications, and help me move faster.",
    icon: BoltIcon,
  },
] as const;

export const DEFAULT_SECONDARY_SUPPORT_OPTIONS = [
  "Resume improvements",
  "Interview prep",
  "LinkedIn/outreach messages",
  "Follow-up reminders",
  "Career coaching",
  "Wage negotiation tips",
] as const;

export type SupportLevel = (typeof PRIMARY_SUPPORT_OPTIONS)[number]["title"];
export type SupportExtra = string;

export function normalizeSupportText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function isSupportLevel(value: string): value is SupportLevel {
  return PRIMARY_SUPPORT_OPTIONS.some((option) => option.title === value);
}

function dedupeSupportExtras(values: string[], maxItems = 8) {
  const seen = new Set<string>();
  const normalized: SupportExtra[] = [];

  for (const item of values) {
    const text = normalizeSupportText(item);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);

    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

export function normalizeSupportExtras(value: unknown, maxItems = 8) {
  return Array.isArray(value) ? dedupeSupportExtras(value, maxItems) : [];
}

export function getSupportExtrasForRole(roleFocus: string) {
  const normalizedRole = normalizeSupportText(roleFocus).toLowerCase();

  if (!normalizedRole) {
    return [...DEFAULT_SECONDARY_SUPPORT_OPTIONS];
  }

  if (
    /(software|engineer|developer|frontend|backend|full stack|data|analyst|qa|devops|designer)/.test(
      normalizedRole
    )
  ) {
    return [
      "Technical interview prep",
      "Portfolio/GitHub feedback",
      "Resume improvements",
      "LinkedIn/outreach messages",
      "Follow-up reminders",
      "Wage negotiation tips",
    ];
  }

  if (
    /(customer support|customer service|support|retail|barista|cashier|server|host|crew|restaurant|food|hospitality|sales|associate)/.test(
      normalizedRole
    )
  ) {
    return [
      "Interview prep",
      "Customer-facing answer practice",
      "Resume improvements",
      "LinkedIn/outreach messages",
      "Follow-up reminders",
      "Wage negotiation tips",
    ];
  }

  if (
    /(warehouse|logistics|delivery|driver|forklift|stock|inventory|fulfillment|manufacturing|picker|packer)/.test(
      normalizedRole
    )
  ) {
    return [
      "Shift-fit job alerts",
      "Commute-aware matching",
      "Resume improvements",
      "Interview prep",
      "Follow-up reminders",
      "Wage negotiation tips",
    ];
  }

  if (
    /(administrative|assistant|office|coordinator|scheduler|receptionist|operations)/.test(
      normalizedRole
    )
  ) {
    return [
      "Resume improvements",
      "Scheduling/workflow positioning",
      "Interview prep",
      "LinkedIn/outreach messages",
      "Follow-up reminders",
      "Career coaching",
    ];
  }

  if (
    /(nurse|medical|healthcare|cna|caregiver|patient|phlebotom|dental|clinic|hospital)/.test(
      normalizedRole
    )
  ) {
    return [
      "Credential positioning",
      "Interview prep",
      "Resume improvements",
      "Follow-up reminders",
      "Career coaching",
      "Wage negotiation tips",
    ];
  }

  if (
    /(electrician|plumber|hvac|maintenance|mechanic|construction|technician|installer|welder|carpenter|trade)/.test(
      normalizedRole
    )
  ) {
    return [
      "Certifications positioning",
      "Interview prep",
      "Resume improvements",
      "Follow-up reminders",
      "Career coaching",
      "Wage negotiation tips",
    ];
  }

  return [...DEFAULT_SECONDARY_SUPPORT_OPTIONS];
}

export function getDisplaySupportExtras(
  roleFocus: string,
  selectedExtras: string[],
  maxItems = 6
) {
  return dedupeSupportExtras(
    [...getSupportExtrasForRole(roleFocus), ...selectedExtras],
    maxItems
  );
}
