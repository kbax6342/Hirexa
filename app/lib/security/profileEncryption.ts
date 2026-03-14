import "server-only";

import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v1";
const STRING_SENSITIVE_PROFILE_FIELDS = [
  "address",
  "city",
  "postalCode",
  "state",
] as const;
const DATE_SENSITIVE_PROFILE_FIELDS = ["dob"] as const;

type MaybeRecord = Record<string, unknown>;

let warnedMissingEncryptionKey = false;
let warnedDecryptFailure = false;

function getProfileEncryptionKey() {
  const rawKey = process.env.PROFILE_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    if (!warnedMissingEncryptionKey) {
      warnedMissingEncryptionKey = true;
      console.warn(
        "[profileEncryption] PROFILE_ENCRYPTION_KEY is not set; sensitive profile fields will pass through unchanged."
      );
    }
    return null;
  }

  return crypto.createHash("sha256").update(rawKey).digest();
}

function isEncryptedValue(value: string) {
  return value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

function encryptFieldOperation(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "set" in value
  ) {
    return {
      ...(value as MaybeRecord),
      set: encryptProfileField((value as { set?: unknown }).set),
    };
  }

  return encryptProfileField(value);
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
  if (!isEncryptedValue(value)) return value;

  const key = getProfileEncryptionKey();
  if (!key) return value;

  const parts = value.split(":");
  if (parts.length !== 5) return value;

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
    return value;
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
      clone[field] = encryptFieldOperation(clone[field]);
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
