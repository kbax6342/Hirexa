import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import { aiChatCompanySettingsSchema } from "@/app/types/ai-chat-settings";
import {
  STAFFING_REQUIRED_FIELDS,
  normalizeRequiredStaffingFields,
} from "@/app/lib/staffing/getMissingStaffingFields";

const MINIMUM_REQUIRED_FIELDS = [
  "candidateName",
  "phone",
  "email",
  "consentToContact",
] as const;

function normalizeString(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeStringArray(values: string[] | undefined) {
  if (!Array.isArray(values)) return undefined;

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const entry = String(value ?? "").trim();
    if (!entry) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
  }

  return normalized;
}

export function normalizeCompanySlug(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCompanyChatSettings(
  input: AiChatCompanySettings
): AiChatCompanySettings {
  const parsed = aiChatCompanySettingsSchema.parse(input);
  const requiredScreeningFields =
    normalizeRequiredStaffingFields(parsed.requiredScreeningFields) ??
    [...STAFFING_REQUIRED_FIELDS];

  return {
    ...parsed,
    companyName: parsed.companyName.trim(),
    companySlug: normalizeCompanySlug(parsed.companySlug),
    companyWebsite: normalizeString(parsed.companyWebsite),
    companyDescription: normalizeString(parsed.companyDescription),
    companyIndustry: normalizeString(parsed.companyIndustry),
    companyLocation: normalizeString(parsed.companyLocation),
    companyLogoUrl: normalizeString(parsed.companyLogoUrl),
    brandPrimaryColor: normalizeString(parsed.brandPrimaryColor),
    hiringFocus: normalizeString(parsed.hiringFocus),
    primaryRoles: normalizeStringArray(parsed.primaryRoles) ?? [],
    industries: normalizeStringArray(parsed.industries) ?? [],
    employmentTypes: normalizeStringArray(parsed.employmentTypes) ?? [],
    shiftOptions: normalizeStringArray(parsed.shiftOptions) ?? [],
    locationCoverage: normalizeStringArray(parsed.locationCoverage),
    desiredExperience: normalizeStringArray(parsed.desiredExperience),
    requiredQualifications: normalizeStringArray(parsed.requiredQualifications),
    preferredQualifications: normalizeStringArray(parsed.preferredQualifications),
    payRange: normalizeString(parsed.payRange),
    startAvailabilityOptions: normalizeStringArray(parsed.startAvailabilityOptions),
    recruiterName: normalizeString(parsed.recruiterName),
    recruiterEmail: normalizeString(parsed.recruiterEmail)?.toLowerCase(),
    recruiterPhone: normalizeString(parsed.recruiterPhone),
    leadNotificationEmail: normalizeString(parsed.leadNotificationEmail)?.toLowerCase(),
    leadPriorityRules: normalizeStringArray(parsed.leadPriorityRules),
    chatDisplayName: parsed.chatDisplayName.trim(),
    welcomeMessage: normalizeString(parsed.welcomeMessage),
    assistantTone: parsed.assistantTone,
    customInstructions: normalizeString(parsed.customInstructions),
    fallbackMessage: normalizeString(parsed.fallbackMessage),
    completionMessage: normalizeString(parsed.completionMessage),
    complianceDisclaimer: normalizeString(parsed.complianceDisclaimer),
    requiredScreeningFields,
    optionalScreeningFields: normalizeStringArray(parsed.optionalScreeningFields),
    knockoutRules: normalizeStringArray(parsed.knockoutRules),
    scoringRules: normalizeStringArray(parsed.scoringRules),
    allowedDomains: normalizeStringArray(parsed.allowedDomains),
    createdAt: normalizeString(parsed.createdAt),
    updatedAt: normalizeString(parsed.updatedAt),
  };
}

export function validateCompanyChatSettings(
  input: AiChatCompanySettings
): { isValid: boolean; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  let normalized: AiChatCompanySettings;

  try {
    normalized = normalizeCompanyChatSettings(input);
  } catch (error) {
    if (error && typeof error === "object" && "flatten" in error) {
      const flattened = (
        error as {
          flatten: () => {
            fieldErrors: Record<string, string[] | undefined>;
          };
        }
      ).flatten();
      for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
        if (messages?.length) {
          fieldErrors[field] = messages;
        }
      }
    } else {
      fieldErrors.settings = ["Invalid AI chat settings payload."];
    }

    return {
      isValid: false,
      fieldErrors,
    };
  }

  if (!normalized.companyName) {
    fieldErrors.companyName = ["Company name is required."];
  }

  if (!normalized.companySlug) {
    fieldErrors.companySlug = ["Company slug is required."];
  }

  if (
    normalized.companySlug &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized.companySlug)
  ) {
    fieldErrors.companySlug = [
      ...(fieldErrors.companySlug ?? []),
      "Company slug must be URL-safe and use lowercase letters, numbers, or hyphens.",
    ];
  }

  if (!normalized.chatDisplayName) {
    fieldErrors.chatDisplayName = ["Chat display name is required."];
  }

  for (const field of MINIMUM_REQUIRED_FIELDS) {
    if (!normalized.requiredScreeningFields.includes(field)) {
      fieldErrors.requiredScreeningFields = [
        ...(fieldErrors.requiredScreeningFields ?? []),
        `Required screening fields must include ${field}.`,
      ];
    }
  }

  if (normalized.publicChatEnabled && !normalized.complianceDisclaimer) {
    fieldErrors.complianceDisclaimer = [
      "A compliance disclaimer is required when public chat is enabled.",
    ];
  }

  if (
    normalized.recruiterEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.recruiterEmail)
  ) {
    fieldErrors.recruiterEmail = ["Enter a valid recruiter email address."];
  }

  if (
    normalized.leadNotificationEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.leadNotificationEmail)
  ) {
    fieldErrors.leadNotificationEmail = [
      "Enter a valid lead notification email address.",
    ];
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}
