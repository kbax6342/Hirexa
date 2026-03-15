import "server-only";

import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v1";
const POSTGRES_HEX_PREFIX = /^\\x[0-9a-fA-F]{2,}$/;
const STRING_SENSITIVE_PROFILE_FIELDS = [
  "address",
  "city",
  "postalCode",
  "state",
] as const;
const DATE_SENSITIVE_PROFILE_FIELDS = ["dob"] as const;

type MaybeRecord = Record<string, unknown>;

let warnedMissingEncryptionKey = false;
let warnedLegacyEncryptionKeyFallback = false;
let warnedDecryptFailure = false;

function shouldDecodeHexTextLayer(decoded: string) {
  if (!decoded) return false;
  if (decoded.includes("\uFFFD")) return false;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(decoded)) return false;
  return true;
}

function getProfileEncryptionKey() {
  const profileKey = process.env.PROFILE_ENCRYPTION_KEY?.trim();
  const fallbackKey = process.env.ENCRYPTION_KEY?.trim();
  const rawKey = profileKey || fallbackKey;

  if (!rawKey) {
    if (!warnedMissingEncryptionKey) {
      warnedMissingEncryptionKey = true;
      console.warn(
        "[profileEncryption] Neither PROFILE_ENCRYPTION_KEY nor ENCRYPTION_KEY is set; sensitive profile fields will pass through unchanged."
      );
    }
    return null;
  }

  if (!profileKey && fallbackKey && !warnedLegacyEncryptionKeyFallback) {
    warnedLegacyEncryptionKeyFallback = true;
    console.warn(
      "[profileEncryption] Using ENCRYPTION_KEY fallback for profile encryption. Set PROFILE_ENCRYPTION_KEY to make the profile key explicit."
    );
  }

  return crypto.createHash("sha256").update(rawKey).digest();
}

function isEncryptedValue(value: string) {
  return value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

export function normalizeEncryptedValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  let current = value.trim();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!POSTGRES_HEX_PREFIX.test(current) || (current.length - 2) % 2 !== 0) {
      break;
    }

    const decoded = Buffer.from(current.slice(2), "hex").toString("utf8");
    if (!shouldDecodeHexTextLayer(decoded) || decoded === current) {
      break;
    }

    current = decoded.trim();
  }

  return current;
}

export function encryptProfileField(value: unknown) {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return value;
  if (value.length === 0) return value;
  if (isEncryptedValue(value)) return value;

  const key = getProfileEncryptionKey();
  if (!key) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptProfileField(value: unknown) {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return value;
  const normalizedValue = normalizeEncryptedValue(value);
  if (typeof normalizedValue !== "string" || !isEncryptedValue(normalizedValue)) {
    return normalizedValue;
  }

  const key = getProfileEncryptionKey();
  if (!key) return null;

  const parts = normalizedValue.split(":");
  if (parts.length !== 5) return null;

  try {
    const [, , iv, authTag, ciphertext] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch (error) {
    if (!warnedDecryptFailure) {
      warnedDecryptFailure = true;
      console.error("[profileEncryption] Failed to decrypt a sensitive profile field.", error);
    }
    return null;
  }
}

export function encryptSensitiveUserProfileFields<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => encryptSensitiveUserProfileFields(item)) as T;
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const clone: MaybeRecord = { ...(input as MaybeRecord) };

  for (const field of STRING_SENSITIVE_PROFILE_FIELDS) {
    if (field in clone) {
      clone[field] = encryptProfileField(clone[field]);
    }
  }

  for (const field of DATE_SENSITIVE_PROFILE_FIELDS) {
    if (field in clone) {
      clone[field] = clone[field];
    }
  }

  return clone as T;
}

export function decryptSensitiveUserProfileFields<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => decryptSensitiveUserProfileFields(item)) as T;
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const clone: MaybeRecord = { ...(input as MaybeRecord) };

  for (const field of STRING_SENSITIVE_PROFILE_FIELDS) {
    if (field in clone) {
      clone[field] = decryptProfileField(clone[field]);
    }
  }

  return clone as T;
}
