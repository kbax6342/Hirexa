import type {
  StaffingContactMethod,
  StaffingExperience,
  StaffingLeadDraft,
  StaffingPositionType,
  StaffingShift,
  StaffingStartAvailability,
  StaffingTransportation,
  StaffingWorkType,
} from "@/app/types/staffing-screening";
import {
  STAFFING_CONTACT_METHOD_OPTIONS,
  STAFFING_EXPERIENCE_OPTIONS,
  STAFFING_POSITION_TYPE_OPTIONS,
  STAFFING_SHIFT_OPTIONS,
  STAFFING_START_AVAILABILITY_OPTIONS,
  STAFFING_TRANSPORTATION_OPTIONS,
  STAFFING_WORK_TYPE_OPTIONS,
} from "@/app/types/staffing-screening";

type RawStaffingLeadDraft = {
  firstName?: unknown;
  lastName?: unknown;
  fullName?: unknown;
  candidateName?: unknown;
  phone?: unknown;
  email?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  preferredContactMethod?: unknown;
  desiredWorkTypes?: unknown;
  desiredJobType?: unknown;
  preferredShift?: unknown;
  shiftAvailability?: unknown;
  startAvailability?: unknown;
  transportationStatus?: unknown;
  workAuthorization?: unknown;
  workAuthorizationStatus?: unknown;
  experience?: unknown;
  workExperienceSummary?: unknown;
  resumeUploadOrWorkHistorySummary?: unknown;
  resumeUrl?: unknown;
  linkedinUrl?: unknown;
  certifications?: unknown;
  desiredPay?: unknown;
  desiredPayRange?: unknown;
  startDate?: unknown;
  previousEmployer?: unknown;
  educationLevel?: unknown;
  languagesSpoken?: unknown;
  veteranStatus?: unknown;
  referralSource?: unknown;
  contactConsent?: unknown;
  consentToContact?: unknown;
};

const WORK_TYPE_SYNONYMS: Record<StaffingWorkType, string[]> = {
  Warehouse: ["warehouse", "distribution", "distribution center"],
  Manufacturing: ["manufacturing", "factory", "production"],
  Forklift: ["forklift", "hi-lo", "hilo", "fork truck"],
  "General Labor": ["general labor", "general labour", "labor", "labour"],
  Assembly: ["assembly", "assembler", "assembly line"],
  "Packing / Shipping": [
    "packing",
    "shipping",
    "packaging",
    "packing and shipping",
    "shipping and receiving",
  ],
  "Office / Administrative": [
    "office",
    "administrative",
    "admin",
    "clerical",
    "reception",
    "receptionist",
  ],
  Other: ["other"],
};

const POSITION_TYPE_SYNONYMS: Record<StaffingPositionType, string[]> = {
  Temporary: ["temporary", "temp"],
  "Temp-to-Hire": ["temp to hire", "temp-to-hire", "temp hire"],
  "Full-Time": ["full time", "full-time"],
  "Part-Time": ["part time", "part-time"],
  Seasonal: ["seasonal", "season"],
  "Direct Hire": ["direct hire", "direct-hire"],
  "Open to Anything": ["open to anything", "anything", "open"],
};

const SHIFT_SYNONYMS: Record<StaffingShift, string[]> = {
  "1st Shift": ["1st shift", "first shift", "day shift", "days", "mornings"],
  "2nd Shift": ["2nd shift", "second shift", "evening shift", "afternoons", "evenings"],
  "3rd Shift": ["3rd shift", "third shift", "night shift", "overnight", "nights"],
  Weekends: ["weekend", "weekends"],
  Overtime: ["overtime", "ot"],
  Flexible: ["flexible", "any shift", "open schedule"],
};

const START_SYNONYMS: Record<StaffingStartAvailability, string[]> = {
  Today: ["today", "asap", "immediately", "right away", "now"],
  "This Week": ["this week", "next few days", "soon"],
  "Within 2 Weeks": ["within 2 weeks", "within two weeks", "2 weeks", "two weeks"],
  Later: ["later", "next month", "not right away"],
};

const TRANSPORTATION_SYNONYMS: Record<StaffingTransportation, string[]> = {
  Yes: ["yes", "reliable transportation", "own car", "have a car", "vehicle", "licensed"],
  No: ["no", "no transportation", "no ride", "dont have transportation", "do not have transportation"],
  "Depends on location": ["depends", "depends on location", "depending on location", "bus line"],
};

const EXPERIENCE_SYNONYMS: Record<StaffingExperience, string[]> = {
  Forklift: ["forklift", "hi-lo", "hilo", "fork truck"],
  "Assembly Line": ["assembly line", "assembly"],
  "Picking / Packing": ["picking", "packing", "pick pack", "pick and pack"],
  "Shipping / Receiving": ["shipping", "receiving", "shipping and receiving"],
  "Machine Operation": ["machine operation", "machine operator", "operating machines"],
  "Quality Inspection": ["quality inspection", "quality", "inspection", "qa", "qc"],
  "General Labor": ["general labor", "general labour", "labor", "labour"],
  "None Yet": ["none yet", "no experience", "none"],
};

const CONTACT_METHOD_SYNONYMS: Record<StaffingContactMethod, string[]> = {
  Text: ["text", "text me", "sms"],
  "Phone Call": ["phone call", "call", "call me", "phone"],
  Email: ["email", "email me"],
  Any: ["any", "either", "any method", "no preference"],
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeComparable(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9+/#&\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function splitNameParts(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z'-]/gi, ""))
    .filter(Boolean);
}

function dedupeStrings<T extends string>(values: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const normalized = normalizeComparable(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }

  return result;
}

function splitRawValues(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.flatMap((entry) => splitRawValues(entry));
  }

  if (typeof input !== "string") {
    return [];
  }

  return input
    .split(/\s*(?:,|;|\band\b|\n)\s*/i)
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function resolveOption<T extends string>(
  input: string,
  options: readonly T[],
  synonyms: Record<T, string[]>
) {
  const normalizedInput = normalizeComparable(input);
  if (!normalizedInput) return undefined;

  for (const option of options) {
    const variants = [option, ...(synonyms[option] ?? [])];
    if (
      variants.some((variant) => normalizeComparable(variant) === normalizedInput)
    ) {
      return option;
    }
  }

  for (const option of options) {
    const variants = [option, ...(synonyms[option] ?? [])];
    if (
      variants.some((variant) => {
        const normalizedVariant = normalizeComparable(variant);
        return (
          normalizedInput.includes(normalizedVariant) ||
          normalizedVariant.includes(normalizedInput)
        );
      })
    ) {
      return option;
    }
  }

  return undefined;
}

function resolveOptionArray<T extends string>(
  input: unknown,
  options: readonly T[],
  synonyms: Record<T, string[]>
) {
  const rawValues = splitRawValues(input);
  const resolved: T[] = [];

  for (const rawValue of rawValues) {
    const direct = resolveOption(rawValue, options, synonyms);
    if (direct) {
      resolved.push(direct);
      continue;
    }

    const normalized = normalizeComparable(rawValue);
    for (const option of options) {
      const variants = [option, ...(synonyms[option] ?? [])];
      if (
        variants.some((variant) => normalized.includes(normalizeComparable(variant)))
      ) {
        resolved.push(option);
      }
    }
  }

  return dedupeStrings(resolved);
}

function normalizeNamePart(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value).replace(/[^a-z'-]/gi, "");
  if (!normalized || /@/.test(normalized) || /\d{3,}/.test(normalized)) {
    return undefined;
  }

  return titleCase(normalized);
}

function normalizeCandidateName(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parts = splitNameParts(value);
  if (parts.length === 0 || /@/.test(value) || /\d{3,}/.test(value)) {
    return undefined;
  }

  return titleCase(parts.join(" "));
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value);
  const digits = normalized.replace(/\D/g, "");

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return normalized || undefined;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value).toLowerCase();
  return normalized || undefined;
}

function normalizePlainText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value);
  return normalized || undefined;
}

function normalizeTextArray(value: unknown) {
  return dedupeStrings(splitRawValues(value));
}

function normalizeSingleOption<T extends string>(
  input: unknown,
  options: readonly T[],
  synonyms: Record<T, string[]>
) {
  if (typeof input !== "string") return undefined;
  return resolveOption(input, options, synonyms);
}

function normalizeDesiredPayRange(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value);
  return normalized || undefined;
}

function normalizeConsentToContact(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = normalizeComparable(value);
  if (
    normalized.includes("yes") ||
    normalized.includes("i agree") ||
    normalized.includes("you can contact me") ||
    normalized.includes("okay to contact")
  ) {
    return true;
  }

  if (
    normalized === "no" ||
    normalized.includes("do not agree") ||
    normalized.includes("dont contact") ||
    normalized.includes("do not contact")
  ) {
    return false;
  }

  return undefined;
}

function mergeUniqueArray<T extends string>(
  current: T[] | undefined,
  incoming: T[]
) {
  const merged = dedupeStrings([...(current ?? []), ...incoming]);

  if (merged.includes("None Yet" as T) && merged.length > 1) {
    return merged.filter((value) => value !== ("None Yet" as T));
  }

  return merged;
}

export function mergeStaffingLeadDraft(
  currentDraft: StaffingLeadDraft,
  incomingDraft: RawStaffingLeadDraft
): StaffingLeadDraft {
  const nextDraft: StaffingLeadDraft = {
    ...currentDraft,
  };

  const incomingFullName = normalizeCandidateName(
    incomingDraft.fullName ?? incomingDraft.candidateName
  );
  const incomingFullNameParts = incomingFullName
    ? splitNameParts(incomingFullName)
    : [];
  const incomingFirstName =
    normalizeNamePart(incomingDraft.firstName) ??
    (incomingFullNameParts.length > 0
      ? titleCase(incomingFullNameParts[0])
      : undefined);
  const incomingLastName =
    normalizeNamePart(incomingDraft.lastName) ??
    (incomingFullNameParts.length > 1
      ? titleCase(incomingFullNameParts.slice(1).join(" "))
      : undefined);

  if (incomingFirstName) {
    nextDraft.firstName = incomingFirstName;
  }

  if (incomingLastName) {
    nextDraft.lastName = incomingLastName;
  }

  if (nextDraft.firstName && nextDraft.lastName) {
    const fullName = `${nextDraft.firstName} ${nextDraft.lastName}`;
    nextDraft.fullName = fullName;
    nextDraft.candidateName = fullName;
  } else if (incomingFullName && incomingFullNameParts.length >= 2) {
    nextDraft.fullName = incomingFullName;
    nextDraft.candidateName = incomingFullName;
  }

  const phone = normalizePhone(incomingDraft.phone);
  if (phone) {
    nextDraft.phone = phone;
  }

  const email = normalizeEmail(incomingDraft.email);
  if (email) {
    nextDraft.email = email;
  }

  const city = normalizePlainText(incomingDraft.city);
  if (city) {
    nextDraft.city = city;
  }

  const state = normalizePlainText(incomingDraft.state);
  if (state) {
    nextDraft.state = state;
  }

  const zipCode = normalizePlainText(incomingDraft.zipCode);
  if (zipCode) {
    nextDraft.zipCode = zipCode;
  }

  const preferredContactMethod = normalizeSingleOption(
    incomingDraft.preferredContactMethod,
    STAFFING_CONTACT_METHOD_OPTIONS,
    CONTACT_METHOD_SYNONYMS
  );
  if (preferredContactMethod) {
    nextDraft.preferredContactMethod = preferredContactMethod;
  }

  const desiredWorkTypes = resolveOptionArray(
    incomingDraft.desiredWorkTypes,
    STAFFING_WORK_TYPE_OPTIONS,
    WORK_TYPE_SYNONYMS
  );
  if (desiredWorkTypes.length > 0) {
    nextDraft.desiredWorkTypes = mergeUniqueArray(
      nextDraft.desiredWorkTypes,
      desiredWorkTypes
    );
  }

  const desiredJobType = normalizeSingleOption(
    incomingDraft.desiredJobType,
    STAFFING_POSITION_TYPE_OPTIONS,
    POSITION_TYPE_SYNONYMS
  );
  if (desiredJobType) {
    nextDraft.desiredJobType = desiredJobType;
  }

  const preferredShift = normalizePlainText(incomingDraft.preferredShift);
  if (preferredShift) {
    nextDraft.preferredShift = preferredShift;
  }

  const shiftAvailability = resolveOptionArray(
    incomingDraft.shiftAvailability,
    STAFFING_SHIFT_OPTIONS,
    SHIFT_SYNONYMS
  );
  if (shiftAvailability.length > 0) {
    nextDraft.shiftAvailability = mergeUniqueArray(
      nextDraft.shiftAvailability,
      shiftAvailability
    );
  }

  const startAvailability = normalizeSingleOption(
    incomingDraft.startAvailability,
    STAFFING_START_AVAILABILITY_OPTIONS,
    START_SYNONYMS
  );
  if (startAvailability) {
    nextDraft.startAvailability = startAvailability;
  }

  const transportationStatus = normalizeSingleOption(
    incomingDraft.transportationStatus,
    STAFFING_TRANSPORTATION_OPTIONS,
    TRANSPORTATION_SYNONYMS
  );
  if (transportationStatus) {
    nextDraft.transportationStatus = transportationStatus;
  }

  const workAuthorization = normalizePlainText(
    incomingDraft.workAuthorizationStatus ?? incomingDraft.workAuthorization
  );
  if (workAuthorization) {
    nextDraft.workAuthorization = workAuthorization;
    nextDraft.workAuthorizationStatus = workAuthorization;
  }

  const experience = resolveOptionArray(
    incomingDraft.experience,
    STAFFING_EXPERIENCE_OPTIONS,
    EXPERIENCE_SYNONYMS
  );
  if (experience.length > 0) {
    nextDraft.experience = mergeUniqueArray(nextDraft.experience, experience);
  }

  const workExperienceSummary = normalizePlainText(
    incomingDraft.workExperienceSummary
  );
  if (workExperienceSummary) {
    nextDraft.workExperienceSummary = workExperienceSummary;
  }

  const resumeUploadOrWorkHistorySummary = normalizePlainText(
    incomingDraft.resumeUploadOrWorkHistorySummary
  );
  if (resumeUploadOrWorkHistorySummary) {
    nextDraft.resumeUploadOrWorkHistorySummary =
      resumeUploadOrWorkHistorySummary;
  }

  const resumeUrl = normalizePlainText(incomingDraft.resumeUrl);
  if (resumeUrl) {
    nextDraft.resumeUrl = resumeUrl;
  }

  const linkedinUrl = normalizePlainText(incomingDraft.linkedinUrl);
  if (linkedinUrl) {
    nextDraft.linkedinUrl = linkedinUrl;
  }

  const certifications = normalizeTextArray(incomingDraft.certifications);
  if (certifications.length > 0) {
    nextDraft.certifications = dedupeStrings([
      ...(nextDraft.certifications ?? []),
      ...certifications,
    ]);
  }

  const desiredPay = normalizePlainText(incomingDraft.desiredPay);
  if (desiredPay) {
    nextDraft.desiredPay = desiredPay;
    if (!nextDraft.desiredPayRange) {
      nextDraft.desiredPayRange = desiredPay;
    }
  }

  const desiredPayRange = normalizeDesiredPayRange(incomingDraft.desiredPayRange);
  if (desiredPayRange) {
    nextDraft.desiredPayRange = desiredPayRange;
  }

  const startDate = normalizePlainText(incomingDraft.startDate);
  if (startDate) {
    nextDraft.startDate = startDate;
  }

  const previousEmployer = normalizePlainText(incomingDraft.previousEmployer);
  if (previousEmployer) {
    nextDraft.previousEmployer = previousEmployer;
  }

  const educationLevel = normalizePlainText(incomingDraft.educationLevel);
  if (educationLevel) {
    nextDraft.educationLevel = educationLevel;
  }

  const languagesSpoken = normalizeTextArray(incomingDraft.languagesSpoken);
  if (languagesSpoken.length > 0) {
    nextDraft.languagesSpoken = dedupeStrings([
      ...(nextDraft.languagesSpoken ?? []),
      ...languagesSpoken,
    ]);
  }

  const veteranStatus = normalizePlainText(incomingDraft.veteranStatus);
  if (veteranStatus) {
    nextDraft.veteranStatus = veteranStatus;
  }

  const referralSource = normalizePlainText(incomingDraft.referralSource);
  if (referralSource) {
    nextDraft.referralSource = referralSource;
  }

  const consentToContact = normalizeConsentToContact(
    incomingDraft.contactConsent ?? incomingDraft.consentToContact
  );
  if (typeof consentToContact === "boolean") {
    nextDraft.contactConsent = consentToContact;
    nextDraft.consentToContact = consentToContact;
  }

  return nextDraft;
}
