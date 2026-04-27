// my-app/app/lib/greenhouse/mapProfileToForm.ts
import type { UserProfile } from "@prisma/client";
import type { GhField } from "@/app/lib/greenhouse/parseGreenhouseForm";
import { classifyApplicationField } from "@/app/lib/apply/applicationFieldClassifier";
import { detectCountryFieldKind } from "@/app/lib/greenhouse/countryFields";
import {
  isPreferNotEquivalent,
  isPreferNotToAnswer,
} from "@/app/lib/profile/voluntarySelfIdOptions";

export type AuditItem = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  reason: string;
  options?: Array<{ value: string; label: string }>;
};

export type MappedFormValues = {
  prefillValues: Record<string, string>;
};

type ProfileWithCountry = UserProfile & { countryCode?: string | null; country?: string | null };

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return normalize(value).toLowerCase();
}

function yesNo(value: string | null | undefined) {
  const normalized = lower(value);
  if (!normalized) return "";
  if (["yes", "y", "true", "authorized", "authorized to work in us"].includes(normalized)) return "Yes";
  if (["no", "n", "false", "not authorized"].includes(normalized)) return "No";
  return "";
}

function matchesKeyword(input: string, keywords: string[]) {
  const normalized = input.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function looksLikeCountryField(field: GhField) {
  const target = `${field.name} ${field.label}`.toLowerCase();
  return target.includes("country") && !target.includes("phone");
}

function looksLikeCountryCodeField(field: GhField) {
  const target = `${field.name} ${field.label}`.toLowerCase();
  return (
    target.includes("country_code") ||
    target.includes("phone_country") ||
    (target.includes("phone") && target.includes("country"))
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function applicationAnswerPreferences(profile: UserProfile) {
  return record(record(profile.keyQuestions).applicationAnswerPreferences);
}

function voluntarySelfId(profile: UserProfile) {
  return record(applicationAnswerPreferences(profile).voluntarySelfId);
}

function workAuthorizationPrefs(profile: UserProfile) {
  return record(applicationAnswerPreferences(profile).workAuthorization);
}

function resolvePhoneCountryCode(profile: ProfileWithCountry) {
  const prefs = applicationAnswerPreferences(profile);
  const saved = normalize(prefs.phoneCountryCode) || normalize(profile.countryCode);
  if (saved) return saved;
  const country = `${normalize(profile.country)} ${normalize(profile.city)} ${normalize(profile.state)}`.toLowerCase();
  if (!country || /\b(us|usa|united states|america)\b/.test(country)) return "+1";
  return "";
}

function inferProfileValue(field: GhField, profile: ProfileWithCountry): string {
  const target = `${field.name} ${field.label}`.toLowerCase();
  const classification = classifyApplicationField({
    label: field.label,
    name: field.name,
    type: field.type,
    options: field.options,
  });
  const appPrefs = applicationAnswerPreferences(profile);
  const workAuth = workAuthorizationPrefs(profile);
  const voluntary = voluntarySelfId(profile);

  // --- COUNTRY (explicit rule requested) ---
  // COUNTRY
  if (looksLikeCountryField(field)) return normalize(profile.country);

  // PHONE COUNTRY CODE
  if (looksLikeCountryCodeField(field) || classification === "phone_country_code") {
    return resolvePhoneCountryCode(profile);
  }

  // If you have a more precise detector, keep it as a fallback
  const countryFieldKind = detectCountryFieldKind(field);
  if (countryFieldKind === "countryCode") return resolvePhoneCountryCode(profile);
  if (countryFieldKind === "country") return normalize(profile.country);

  // --- BASIC PROFILE ---
  if (matchesKeyword(target, ["first name", "firstname", "given name"])) return normalize(profile.firstName);
  if (matchesKeyword(target, ["last name", "lastname", "family name", "surname"])) return normalize(profile.lastName);
  if (matchesKeyword(target, ["email", "e-mail"])) return normalize(profile.email);
  if (matchesKeyword(target, ["phone", "mobile", "telephone"])) return normalize(profile.phone);

  if (matchesKeyword(target, ["address", "street"])) return normalize(profile.address);
  if (matchesKeyword(target, ["city", "town", "location"])) return normalize(profile.city);
  if (matchesKeyword(target, ["zip", "postal"])) return normalize(profile.postalCode);
  if (matchesKeyword(target, ["state", "province", "region"])) return normalize(profile.state);
  if (matchesKeyword(target, ["linkedin"])) return normalize(profile.linkedinUrl);
  if (matchesKeyword(target, ["website", "portfolio", "personal site", "url"])) return normalize(profile.portfolioUrl);

  if (matchesKeyword(target, ["authorized", "work authorization"])) {
    return yesNo(normalize(workAuth.authorizedUS) || profile.authorizedUS);
  }
  if (matchesKeyword(target, ["sponsorship", "sponsor", "visa"])) {
    return yesNo(normalize(workAuth.requiresSponsorship) || profile.sponsorship);
  }

  if (classification === "voluntary_self_id") {
    console.log("[VOLUNTARY_SELF_ID_FORM_FIELD_DETECTED]", {
      label: field.label,
      provider: "greenhouse",
      required: field.required,
      hasSavedAnswer: Boolean(
        normalize(voluntary.gender) ||
          normalize(voluntary.hispanicLatino) ||
          normalize(voluntary.raceEthnicity) ||
          normalize(voluntary.veteranStatus) ||
          normalize(voluntary.disabilityStatus),
      ),
    });
  }

  if (matchesKeyword(target, ["gender"]) && matchesKeyword(target, ["self describe", "self-describe", "specify"])) {
    return normalize(voluntary.genderSelfDescribe);
  }
  if (matchesKeyword(target, ["gender"])) return normalize(voluntary.gender);
  if (matchesKeyword(target, ["pronouns", "pronoun"])) return normalize(voluntary.pronouns);
  if (matchesKeyword(target, ["hispanic", "latino"])) return normalize(voluntary.hispanicLatino);
  if (matchesKeyword(target, ["ethnicity", "race"]) && matchesKeyword(target, ["self describe", "self-describe", "specify"])) {
    return normalize(voluntary.raceEthnicitySelfDescribe);
  }
  if (matchesKeyword(target, ["ethnicity", "race"])) return normalize(voluntary.raceEthnicity);
  if (matchesKeyword(target, ["veteran"])) return normalize(voluntary.veteranStatus);
  if (matchesKeyword(target, ["disability"])) return normalize(voluntary.disabilityStatus);

  if (classification === "compensation") return normalize(appPrefs.minimumSalary) || normalize(profile.minCompensation);
  if (classification === "job_preference") {
    return (
      normalize(appPrefs.availability) ||
      normalize(appPrefs.employmentType) ||
      normalize(appPrefs.seniorityLevel) ||
      normalize(appPrefs.targetRole)
    );
  }

  return "";
}

function resolveSelectValue(value: string, options: Array<{ value: string; label: string }> | undefined) {
  if (!value || !options?.length) return "";

  const v = value.toLowerCase();

  if (isPreferNotToAnswer(value)) {
    const preferNot = options.find((option) =>
      isPreferNotEquivalent(`${option.label} ${option.value}`),
    );
    if (preferNot?.value) return preferNot.value;
  }

  // 1) exact match against option.value or option.label
  const exact = options.find(
    (option) => option.value.toLowerCase() === v || option.label.toLowerCase() === v
  );
  if (exact?.value) return exact.value;

  // 2) "contains" match (helps for values like "United States" vs "United States of America")
  const contains = options.find(
    (option) => option.label.toLowerCase().includes(v) || v.includes(option.label.toLowerCase())
  );
  return contains?.value ?? "";
}

export function mapProfileToForm(fields: GhField[], profile: UserProfile): MappedFormValues {
  const enhancedProfile = profile as ProfileWithCountry;
  const prefillValues: Record<string, string> = {};

  for (const field of fields) {
    if (field.type === "file") continue;

    const inferred = inferProfileValue(field, enhancedProfile);
    const mappedValue = field.type === "select" ? resolveSelectValue(inferred, field.options) : inferred;

    if (mappedValue) {
      prefillValues[field.name] = mappedValue;
    }
  }

  return { prefillValues };
}
