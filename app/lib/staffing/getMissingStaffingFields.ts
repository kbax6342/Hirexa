import type {
  StaffingLeadDraft,
} from "@/app/types/staffing-screening";

export const STAFFING_REQUIRED_FIELDS = [
  "candidateName",
  "phone",
  "email",
  "city",
  "state",
  "zipCode",
  "preferredContactMethod",
  "desiredWorkTypes",
  "desiredJobType",
  "shiftAvailability",
  "startAvailability",
  "transportationStatus",
  "workAuthorizationStatus",
  "experience",
  "resumeUploadOrWorkHistorySummary",
  "linkedinUrl",
  "certifications",
  "desiredPayRange",
  "startDate",
  "previousEmployer",
  "educationLevel",
  "languagesSpoken",
  "veteranStatus",
  "referralSource",
  "consentToContact",
] as const satisfies ReadonlyArray<keyof StaffingLeadDraft>;

export type StaffingRequiredField = (typeof STAFFING_REQUIRED_FIELDS)[number];

export const STAFFING_FIELD_LABELS: Record<StaffingRequiredField, string> = {
  candidateName: "Name",
  phone: "Phone",
  email: "Email",
  city: "City",
  state: "State",
  zipCode: "Zip code",
  preferredContactMethod: "Preferred contact method",
  desiredWorkTypes: "Desired work type",
  desiredJobType: "Desired job type",
  shiftAvailability: "Shift availability",
  startAvailability: "Start availability",
  transportationStatus: "Transportation",
  workAuthorizationStatus: "Work authorization",
  experience: "Experience",
  resumeUploadOrWorkHistorySummary: "Resume or work history",
  linkedinUrl: "LinkedIn URL",
  certifications: "Certifications",
  desiredPayRange: "Desired pay",
  startDate: "Start date",
  previousEmployer: "Previous employer",
  educationLevel: "Education level",
  languagesSpoken: "Languages spoken",
  veteranStatus: "Veteran status",
  referralSource: "Referral source",
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

function isValidEmail(value: string | undefined) {
  return Boolean(value?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function isValidPhone(value: string | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function isValidZipCode(value: string | undefined) {
  return Boolean(value?.trim() && /^\d{5}$/.test(value.trim()));
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

  if (field === "email") {
    return isValidEmail(leadDraft.email);
  }

  if (field === "phone") {
    return isValidPhone(leadDraft.phone);
  }

  if (field === "zipCode") {
    return isValidZipCode(leadDraft.zipCode);
  }

  if (field === "workAuthorizationStatus") {
    return Boolean(
      leadDraft.workAuthorizationStatus?.trim() ||
        leadDraft.workAuthorization?.trim()
    );
  }

  if (field === "resumeUploadOrWorkHistorySummary") {
    return Boolean(
      leadDraft.resumeUploadOrWorkHistorySummary?.trim() ||
        leadDraft.resumeUrl?.trim() ||
        leadDraft.workExperienceSummary?.trim()
    );
  }

  if (field === "desiredPayRange") {
    return Boolean(leadDraft.desiredPayRange?.trim() || leadDraft.desiredPay?.trim());
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
