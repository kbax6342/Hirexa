import "server-only";

import { Prisma } from "@prisma/client";

import {
  decryptProfileField,
  encryptProfileField,
  normalizeEncryptedValue,
} from "@/app/lib/security/profileEncryption";

const MAX_ADDRESS_LENGTH = 160;
const MAX_CITY_LENGTH = 80;
const MAX_STATE_LENGTH = 80;
const MAX_POSTAL_CODE_LENGTH = 20;
const ENCRYPTED_PREFIX = "enc:v1:";
const POSTGRES_HEX_PREFIX = /^\\x[0-9a-fA-F]{2,}$/;
const BLOB_LIKE_VALUE = /^[A-Za-z0-9+/_=-]{64,}$/;
const US_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;

type SearchLocationFields = {
  citySearch: string | null;
  stateSearch: string | null;
  postalCodeSearch: string | null;
};

type PrivateProfileFieldInput = {
  address?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  dob?: unknown;
};

type StoredProfileLocationFields = {
  city?: unknown;
  citySearch?: unknown;
  state?: unknown;
  stateSearch?: unknown;
  postalCode?: unknown;
  postalCodeSearch?: unknown;
};

type StoredPrivateProfileFields = StoredProfileLocationFields & {
  id?: string;
  address?: unknown;
  addressEncrypted?: unknown;
  cityEncrypted?: unknown;
  dob?: unknown;
  dobEncrypted?: unknown;
  postalCodeEncrypted?: unknown;
  stateEncrypted?: unknown;
};

type PrivateProfileFieldQueryable = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

export type RawPrivateProfileFieldRecord = {
  id: string;
  address: string | null;
  addressEncrypted: string | null;
  city: string | null;
  cityEncrypted: string | null;
  citySearch: string | null;
  state: string | null;
  stateEncrypted: string | null;
  stateSearch: string | null;
  postalCode: string | null;
  postalCodeEncrypted: string | null;
  postalCodeSearch: string | null;
  addressLegacyDecrypted?: string | null;
  cityLegacyDecrypted?: string | null;
  stateLegacyDecrypted?: string | null;
  postalCodeLegacyDecrypted?: string | null;
  dob: string | null;
  dobEncrypted: string | null;
};

export class PrivateProfileFieldValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivateProfileFieldValidationError";
  }
}

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function previewValue(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 24) : null;
}

function readOptionalText(value: unknown) {
  const text = collapseWhitespace(String(value ?? ""));
  return text.length > 0 ? text : null;
}

export function sanitizeProfileDisplayText(value: unknown) {
  const text = readOptionalText(normalizeEncryptedValue(value));
  if (!text) return null;
  if (text.includes("\uFFFD")) return null;
  if (looksLikeEncryptedOrEncodedBlob(text)) return null;
  return text;
}

function resolvePrivateDisplayText(value: unknown) {
  return sanitizeProfileDisplayText(decryptProfileField(value));
}

function resolvePreferredPrivateDisplayText(params: {
  fieldName?: string;
  legacyDecryptedValue?: unknown;
  plainValue?: unknown;
  encryptedValue?: unknown;
}) {
  const preferredEncryptedText = resolvePrivateDisplayText(params.encryptedValue);
  if (preferredEncryptedText) {
    return preferredEncryptedText;
  }

  const plainText = sanitizeProfileDisplayText(params.plainValue);
  if (plainText) {
    return plainText;
  }

  const legacyDecryptedText = sanitizeProfileDisplayText(params.legacyDecryptedValue);
  if (legacyDecryptedText) {
    return legacyDecryptedText;
  }

  const decryptedPlainText = resolvePrivateDisplayText(params.plainValue);
  if (decryptedPlainText) {
    return decryptedPlainText;
  }

  return null;
}

export function looksLikeEncryptedOrEncodedBlob(value: unknown) {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(ENCRYPTED_PREFIX)) return true;
  if (POSTGRES_HEX_PREFIX.test(trimmed)) return true;

  const compact = trimmed.replace(/\s+/g, "");
  return compact.length >= 64 && BLOB_LIKE_VALUE.test(compact);
}

function ensureReasonableText(params: {
  value: string;
  maxLength: number;
  message: string;
}) {
  if (params.value.length > params.maxLength) {
    throw new PrivateProfileFieldValidationError(params.message);
  }

  if (looksLikeEncryptedOrEncodedBlob(params.value) || /[\u0000-\u001F]/.test(params.value)) {
    throw new PrivateProfileFieldValidationError(params.message);
  }
}

function sanitizeAddress(value: unknown) {
  const address = readOptionalText(value);
  if (!address) return null;

  ensureReasonableText({
    value: address,
    maxLength: MAX_ADDRESS_LENGTH,
    message: "Please enter a valid address.",
  });

  return address;
}

function sanitizeCity(value: unknown) {
  const city = readOptionalText(value);
  if (!city) return null;

  ensureReasonableText({
    value: city,
    maxLength: MAX_CITY_LENGTH,
    message: "Please enter a valid city.",
  });

  return city;
}

function sanitizeState(value: unknown) {
  const state = readOptionalText(value);
  if (!state) return null;

  ensureReasonableText({
    value: state,
    maxLength: MAX_STATE_LENGTH,
    message: "Please enter a valid state.",
  });

  return state;
}

function sanitizePostalCode(value: unknown) {
  const postalCode = readOptionalText(value);
  if (!postalCode) return null;

  ensureReasonableText({
    value: postalCode,
    maxLength: MAX_POSTAL_CODE_LENGTH,
    message: "Please enter a valid postal code.",
  });

  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,18}[A-Za-z0-9]$/.test(postalCode)) {
    throw new PrivateProfileFieldValidationError("Please enter a valid postal code.");
  }

  return postalCode;
}

function formatDateParts(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function createValidatedDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function normalizeDateParts(year: number, month: number, day: number) {
  const date = createValidatedDate(year, month, day);
  if (!date) {
    throw new PrivateProfileFieldValidationError("Please enter a valid date of birth.");
  }

  const today = new Date();
  const latest = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );

  if (date.getTime() > latest || year < 1900) {
    throw new PrivateProfileFieldValidationError("Please enter a valid date of birth.");
  }

  return formatDateParts(year, month, day);
}

export function normalizeDobForStorage(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new PrivateProfileFieldValidationError("Please enter a valid date of birth.");
    }

    return normalizeDateParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    );
  }

  const text = readOptionalText(value);
  if (!text) return null;
  if (looksLikeEncryptedOrEncodedBlob(text)) {
    throw new PrivateProfileFieldValidationError("Please enter a valid date of birth.");
  }

  const usMatch = text.match(US_DATE_PATTERN);
  if (usMatch) {
    return normalizeDateParts(
      Number(usMatch[3]),
      Number(usMatch[1]),
      Number(usMatch[2])
    );
  }

  const isoMatch = text.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    return normalizeDateParts(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
  }

  throw new PrivateProfileFieldValidationError("Please enter a valid date of birth.");
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePostalCodeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function normalizeLocationSearchValue(
  value: unknown,
  field: "city" | "state" | "postalCode",
  strict: boolean
) {
  const text = readOptionalText(value);
  if (!text) return null;

  const message =
    field === "postalCode"
      ? "Please enter a valid postal code."
      : field === "city"
        ? "Please enter a valid city."
        : "Please enter a valid state.";

  const maxLength =
    field === "postalCode"
      ? MAX_POSTAL_CODE_LENGTH
      : field === "city"
        ? MAX_CITY_LENGTH
        : MAX_STATE_LENGTH;

  if (looksLikeEncryptedOrEncodedBlob(text) || text.length > maxLength) {
    if (strict) {
      throw new PrivateProfileFieldValidationError(message);
    }

    return null;
  }

  if (field === "postalCode") {
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,18}[A-Za-z0-9]$/.test(text)) {
      if (strict) {
        throw new PrivateProfileFieldValidationError(message);
      }

      return null;
    }

    return normalizePostalCodeSearch(text) || null;
  }

  return normalizeSearchText(text) || null;
}

export function deriveSafeLocationSearchFields(
  input: StoredProfileLocationFields
): SearchLocationFields {
  return {
    citySearch:
      normalizeLocationSearchValue(input.citySearch, "city", false) ??
      normalizeLocationSearchValue(input.city, "city", false),
    stateSearch:
      normalizeLocationSearchValue(input.stateSearch, "state", false) ??
      normalizeLocationSearchValue(input.state, "state", false),
    postalCodeSearch:
      normalizeLocationSearchValue(input.postalCodeSearch, "postalCode", false) ??
      normalizeLocationSearchValue(input.postalCode, "postalCode", false),
  };
}

export function sanitizePrivateProfileFields(input: PrivateProfileFieldInput) {
  const address = sanitizeAddress(input.address);
  const city = sanitizeCity(input.city);
  const state = sanitizeState(input.state);
  const postalCode = sanitizePostalCode(input.postalCode);
  const dob = normalizeDobForStorage(input.dob);
  const encryptedAddress = address ? encryptProfileField(address) : null;
  const encryptedCity = city ? encryptProfileField(city) : null;
  const encryptedState = state ? encryptProfileField(state) : null;
  const encryptedPostalCode = postalCode ? encryptProfileField(postalCode) : null;
  const encryptedDob = dob ? encryptProfileField(dob) : null;

  return {
    address,
    addressEncrypted: typeof encryptedAddress === "string" ? encryptedAddress : null,
    city,
    cityEncrypted: typeof encryptedCity === "string" ? encryptedCity : null,
    state,
    stateEncrypted: typeof encryptedState === "string" ? encryptedState : null,
    postalCode,
    postalCodeEncrypted:
      typeof encryptedPostalCode === "string" ? encryptedPostalCode : null,
    dob,
    dobEncrypted: typeof encryptedDob === "string" ? encryptedDob : null,
    citySearch: normalizeLocationSearchValue(city, "city", true),
    stateSearch: normalizeLocationSearchValue(state, "state", true),
    postalCodeSearch: normalizeLocationSearchValue(postalCode, "postalCode", true),
  };
}

function normalizeLegacyStoredDob(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    return formatDateParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    );
  }

  try {
    return normalizeDobForStorage(value);
  } catch {
    return null;
  }
}

export function getProfileDobValue(profile: {
  dobEncrypted?: unknown;
  dob?: unknown;
}) {
  const decrypted = decryptProfileField(profile.dobEncrypted);
  const normalizedDecrypted = normalizeLegacyStoredDob(decrypted);
  if (normalizedDecrypted) {
    return normalizedDecrypted;
  }

  return normalizeLegacyStoredDob(profile.dob);
}

export function getSafePrivateProfileFields(profile: StoredPrivateProfileFields) {
  return {
    address: resolvePreferredPrivateDisplayText({
      fieldName: "address",
      plainValue: profile.address,
      encryptedValue: profile.addressEncrypted,
      legacyDecryptedValue: (profile as RawPrivateProfileFieldRecord).addressLegacyDecrypted,
    }),
    city: resolvePreferredPrivateDisplayText({
      fieldName: "city",
      plainValue: profile.city,
      encryptedValue: profile.cityEncrypted,
      legacyDecryptedValue: (profile as RawPrivateProfileFieldRecord).cityLegacyDecrypted,
    }),
    state: resolvePreferredPrivateDisplayText({
      fieldName: "state",
      plainValue: profile.state,
      encryptedValue: profile.stateEncrypted,
      legacyDecryptedValue: (profile as RawPrivateProfileFieldRecord).stateLegacyDecrypted,
    }),
    postalCode: resolvePreferredPrivateDisplayText({
      fieldName: "postalCode",
      plainValue: profile.postalCode,
      encryptedValue: profile.postalCodeEncrypted,
      legacyDecryptedValue: (profile as RawPrivateProfileFieldRecord).postalCodeLegacyDecrypted,
    }),
    dob: getProfileDobValue(profile),
  };
}

function getProfileEncryptionSecret() {
  return (
    process.env.PROFILE_ENCRYPTION_KEY?.trim() ||
    process.env.ENCRYPTION_KEY?.trim() ||
    null
  );
}

function shouldAttemptLegacyPgcryptoDecrypt(value: unknown) {
  if (typeof value !== "string") return false;

  const normalized = normalizeEncryptedValue(value);
  if (typeof normalized !== "string") return false;

  return POSTGRES_HEX_PREFIX.test(normalized) || /^ww0[A-Za-z0-9+/=]+$/.test(normalized);
}

async function decryptLegacyPgcryptoValue(params: {
  db: PrivateProfileFieldQueryable;
  profileId: string;
  fieldName: "address" | "city" | "state" | "postalCode";
  value: unknown;
}) {
  const secret = getProfileEncryptionSecret();
  if (!secret) return null;

  const normalized = normalizeEncryptedValue(params.value);
  if (typeof normalized !== "string" || !shouldAttemptLegacyPgcryptoDecrypt(normalized)) {
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[profile] legacy decrypt input", {
      profileId: params.profileId,
      fieldName: params.fieldName,
      rawSourcePrefix: previewValue(params.value),
      normalizedPrefix: previewValue(normalized),
      decryptMode: normalized.startsWith("\\x") ? "hex" : "base64",
    });
  }

  try {
    const rows = normalized.startsWith("\\x")
      ? await params.db.$queryRaw<Array<{ decrypted: string | null }>>(Prisma.sql`
          SELECT pgp_sym_decrypt(decode(substr(${normalized}, 3), 'hex'), ${secret}) AS decrypted
        `)
      : await params.db.$queryRaw<Array<{ decrypted: string | null }>>(Prisma.sql`
          SELECT pgp_sym_decrypt(decode(${normalized}, 'base64'), ${secret}) AS decrypted
        `);

    const decrypted = sanitizeProfileDisplayText(rows[0]?.decrypted ?? null);

    if (process.env.NODE_ENV !== "production") {
      console.info("[profile] legacy decrypt result", {
        profileId: params.profileId,
        fieldName: params.fieldName,
        finalPayloadPrefix: previewValue(normalized),
        decryptSuccess: Boolean(decrypted),
      });
    }

    return decrypted;
  } catch (error) {
    console.error("[profile] legacy decrypt failed", {
      profileId: params.profileId,
      fieldName: params.fieldName,
      finalPayloadPrefix: previewValue(normalized),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

export async function readRawPrivateProfileFieldsByIds(
  db: PrivateProfileFieldQueryable,
  ids: Array<string | null | undefined>
) {
  const uniqueIds = [...new Set(ids.filter((value): value is string => Boolean(value?.trim())))];

  if (uniqueIds.length === 0) {
    return new Map<string, RawPrivateProfileFieldRecord>();
  }

  try {
    const rows = await db.$queryRaw<RawPrivateProfileFieldRecord[]>(Prisma.sql`
      SELECT
        up."id",
        to_jsonb(up) ->> 'address' AS "address",
        to_jsonb(up) ->> 'addressEncrypted' AS "addressEncrypted",
        to_jsonb(up) ->> 'city' AS "city",
        to_jsonb(up) ->> 'cityEncrypted' AS "cityEncrypted",
        to_jsonb(up) ->> 'citySearch' AS "citySearch",
        to_jsonb(up) ->> 'state' AS "state",
        to_jsonb(up) ->> 'stateEncrypted' AS "stateEncrypted",
        to_jsonb(up) ->> 'stateSearch' AS "stateSearch",
        to_jsonb(up) ->> 'postalCode' AS "postalCode",
        to_jsonb(up) ->> 'postalCodeEncrypted' AS "postalCodeEncrypted",
        to_jsonb(up) ->> 'postalCodeSearch' AS "postalCodeSearch",
        to_jsonb(up) ->> 'dob' AS "dob",
        to_jsonb(up) ->> 'dobEncrypted' AS "dobEncrypted"
      FROM "UserProfile" AS up
      WHERE up."id" IN (${Prisma.join(uniqueIds)})
    `);

    await Promise.all(
      rows.map(async (row) => {
        row.addressLegacyDecrypted = await decryptLegacyPgcryptoValue({
          db,
          profileId: row.id,
          fieldName: "address",
          value: row.address,
        });
        row.cityLegacyDecrypted = await decryptLegacyPgcryptoValue({
          db,
          profileId: row.id,
          fieldName: "city",
          value: row.city,
        });
        row.stateLegacyDecrypted = await decryptLegacyPgcryptoValue({
          db,
          profileId: row.id,
          fieldName: "state",
          value: row.state,
        });
        row.postalCodeLegacyDecrypted = await decryptLegacyPgcryptoValue({
          db,
          profileId: row.id,
          fieldName: "postalCode",
          value: row.postalCode,
        });
      })
    );

    return new Map(rows.map((row) => [row.id, row]));
  } catch (error) {
    console.warn("[profile] Failed to read private profile fields safely.", {
      profileCount: uniqueIds.length,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new Map<string, RawPrivateProfileFieldRecord>();
  }
}

export function resolveEncryptedDobValue(profile: {
  dobEncrypted?: unknown;
  dob?: unknown;
}) {
  const existing =
    typeof profile.dobEncrypted === "string" && profile.dobEncrypted.trim().length > 0
      ? profile.dobEncrypted.trim()
      : null;

  if (existing) {
    return existing;
  }

  const legacyDob = normalizeLegacyStoredDob(profile.dob);
  if (!legacyDob) {
    return null;
  }

  const encrypted = encryptProfileField(legacyDob);
  return typeof encrypted === "string" ? encrypted : null;
}
