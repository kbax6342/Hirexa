import type {
  StaffingLeadDraft,
  StaffingScreeningLeadInput,
} from "@/app/types/staffing-screening";

export const STAFFING_REQUIRED_FIELDS = [
  "candidateName",
  "phone",
  "email",
  "preferredContactMethod",
  "desiredWorkTypes",
  "desiredJobType",
  "shiftAvailability",
  "startAvailability",
  "transportationStatus",
  "experience",
  "desiredPayRange",
  "consentToContact",
] as const satisfies ReadonlyArray<keyof StaffingScreeningLeadInput>;

export type StaffingRequiredField = (typeof STAFFING_REQUIRED_FIELDS)[number];

export const STAFFING_FIELD_LABELS: Record<StaffingRequiredField, string> = {
  candidateName: "Name",
  phone: "Phone",
  email: "Email",
  preferredContactMethod: "Preferred contact method",
  desiredWorkTypes: "Desired work type",
  desiredJobType: "Desired job type",
  shiftAvailability: "Shift availability",
  startAvailability: "Start availability",
  transportationStatus: "Transportation",
  experience: "Experience",
  desiredPayRange: "Desired pay",
  consentToContact: "Consent",
};

const STAFFING_REQUIRED_FIELD_SET = new Set<string>(STAFFING_REQUIRED_FIELDS);

function hasFirstAndLastName(leadDraft: StaffingLeadDraft) {
  const firstName = leadDraft.firstName?.trim();
  const lastName = leadDraft.lastName?.trim();
  if (firstName && lastName) return true;

  const fullName = leadDraft.fullName?.trim() || leadDraft.candidateName?.trim() || "";
  return fullName.split(/\s+/).filter(Boolean).length >= 2;
}

export function normalizeRequiredStaffingFields(
  requiredFields?: ReadonlyArray<string>
) {
  const normalized = (requiredFields ?? []).filter(
    (field): field is StaffingRequiredField =>
      STAFFING_REQUIRED_FIELD_SET.has(field)
  );

  return normalized.length > 0
    ? [...new Set(normalized)]
    : [...STAFFING_REQUIRED_FIELDS];
}

export function isStaffingFieldComplete(
  leadDraft: StaffingLeadDraft,
  field: StaffingRequiredField
) {
  if (field === "candidateName") {
    return hasFirstAndLastName(leadDraft);
  }

  const value = leadDraft[field];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return true;
  }

  return typeof value === "string" && value.trim().length > 0;
}

export function getMissingStaffingFields(
  leadDraft: StaffingLeadDraft,
  requiredFields?: ReadonlyArray<string>
) {
  return normalizeRequiredStaffingFields(requiredFields).filter(
    (field) => !isStaffingFieldComplete(leadDraft, field)
  );
}

export function getCompletedStaffingFieldCount(
  leadDraft: StaffingLeadDraft,
  requiredFields?: ReadonlyArray<string>
) {
  return normalizeRequiredStaffingFields(requiredFields).filter((field) =>
    isStaffingFieldComplete(leadDraft, field)
  ).length;
}
