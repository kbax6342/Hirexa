import type { UserProfile, ResumeFile } from "@prisma/client";

export type CanonicalFieldKey =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "state"
  | "postalCode"
  | "linkedin"
  | "website";

export type FieldStates = Array<{ path: string; value: unknown; isMissing: boolean }>;

export const REQUIRED_PROFILE_KEYS: CanonicalFieldKey[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "state",
];

export function buildProfileFieldMap(profile: UserProfile, resume: ResumeFile | null) {
  const fields: Record<string, unknown> = {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    postalCode: profile.postalCode ?? "",
    linkedin: profile.linkedinUrl ?? "",
    website: profile.portfolioUrl ?? "",
    resumeUploaded: Boolean(resume),
  };

  return fields;
}

export function computeMissingFromFields(fields: Record<string, unknown>, overrides?: Record<string, unknown>) {
  const merged = { ...fields, ...(overrides ?? {}) };

  const missing = REQUIRED_PROFILE_KEYS.filter((key) => {
    const value = merged[key];
    return String(value ?? "").trim().length === 0;
  });

  const fieldStates: FieldStates = Object.entries(merged).map(([path, value]) => ({
    path,
    value,
    isMissing: missing.includes(path as CanonicalFieldKey),
  }));

  return { missing, fieldStates, merged };
}
