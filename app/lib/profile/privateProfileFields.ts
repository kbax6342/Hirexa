import "server-only";

import {
  decryptProfileField,
  encryptProfileField,
} from "@/app/lib/security/profileEncryption";

const MAX_ADDRESS_LENGTH = 160;
const MAX_CITY_LENGTH = 80;
const MAX_STATE_LENGTH = 80;
const MAX_POSTAL_CODE_LENGTH = 20;
const ENCRYPTED_PREFIX = "enc:v1:";
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

export class PrivateProfileFieldValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivateProfileFieldValidationError";
  }
}

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function readOptionalText(value: unknown) {
  const text = collapseWhitespace(String(value ?? ""));
  return text.length > 0 ? text : null;
}

export function looksLikeEncryptedOrEncodedBlob(value: unknown) {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(ENCRYPTED_PREFIX)) return true;

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
  const encryptedDob = dob ? encryptProfileField(dob) : null;

  return {
    address,
    city,
    state,
    postalCode,
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
