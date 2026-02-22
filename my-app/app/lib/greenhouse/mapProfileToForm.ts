import type { UserProfile } from "@prisma/client";
import type { GhField } from "@/app/lib/greenhouse/parseGreenhouseForm";

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

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function yesNo(value: string | null | undefined) {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return "";
  if (["yes", "y", "true", "authorized", "authorized to work in us"].includes(normalized)) return "Yes";
  if (["no", "n", "false", "not authorized"].includes(normalized)) return "No";
  return "";
}

function matchesKeyword(input: string, keywords: string[]) {
  const normalized = input.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function inferProfileValue(field: GhField, profile: UserProfile): string {
  const target = `${field.name} ${field.label}`.toLowerCase();

  if (matchesKeyword(target, ["first name", "firstname", "given name"])) return normalize(profile.firstName);
  if (matchesKeyword(target, ["last name", "lastname", "family name", "surname"])) return normalize(profile.lastName);
  if (matchesKeyword(target, ["email", "e-mail"])) return normalize(profile.email);
  if (matchesKeyword(target, ["phone", "mobile", "telephone"])) return normalize(profile.phone);
  if (matchesKeyword(target, ["country"])) return "";
  if (matchesKeyword(target, ["address", "street"])) return normalize(profile.address);
  if (matchesKeyword(target, ["city", "town", "location"])) return normalize(profile.city);
  if (matchesKeyword(target, ["zip", "postal"])) return normalize(profile.postalCode);
  if (matchesKeyword(target, ["state", "province", "region"])) return normalize(profile.state);
  if (matchesKeyword(target, ["linkedin"])) return normalize(profile.linkedinUrl);
  if (matchesKeyword(target, ["website", "portfolio", "personal site", "url"])) return normalize(profile.portfolioUrl);

  if (matchesKeyword(target, ["authorized", "work authorization"])) return yesNo(profile.authorizedUS);
  if (matchesKeyword(target, ["sponsorship", "sponsor", "visa"])) return yesNo(profile.sponsorship);

  if (matchesKeyword(target, ["gender"])) return normalize(profile.gender);
  if (matchesKeyword(target, ["pronouns", "pronoun"])) return normalize(profile.pronouns);
  if (matchesKeyword(target, ["ethnicity", "race"])) return normalize(profile.ethnicity);
  if (matchesKeyword(target, ["veteran"])) return normalize(profile.veteran);
  if (matchesKeyword(target, ["disability"])) return normalize(profile.disability);

  return "";
}

function resolveSelectValue(value: string, options: Array<{ value: string; label: string }> | undefined) {
  if (!value || !options?.length) return "";
  const exact = options.find(
    (option) => option.value.toLowerCase() === value.toLowerCase() || option.label.toLowerCase() === value.toLowerCase()
  );
  return exact?.value ?? "";
}

export function mapProfileToForm(fields: GhField[], profile: UserProfile): MappedFormValues {
  const prefillValues: Record<string, string> = {};

  for (const field of fields) {
    if (field.type === "file") continue;

    const inferred = inferProfileValue(field, profile);
    const mappedValue = field.type === "select" ? resolveSelectValue(inferred, field.options) : inferred;

    if (mappedValue) {
      prefillValues[field.name] = mappedValue;
    }
  }

  return { prefillValues };
}
