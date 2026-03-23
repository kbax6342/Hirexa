import crypto from "node:crypto";

import {
  decodeAppEncryptionKey,
  getAppEncryptionKeyEnv,
} from "@/lib/security/env";

const ENCRYPTED_PREFIX = "enc:v1";

function getEncryptionKeyOrThrow() {
  const rawKey = getAppEncryptionKeyEnv();
  if (!rawKey) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not configured. Selective field encryption cannot run without a 32-byte key."
    );
  }

  const decoded = decodeAppEncryptionKey(rawKey);
  if (!decoded) {
    throw new Error(
      "APP_ENCRYPTION_KEY is invalid. Provide exactly 32 bytes as raw text, base64/base64url, or 64-character hex."
    );
  }

  return decoded;
}

export function isEncryptionConfigured() {
  return Boolean(decodeAppEncryptionKey(getAppEncryptionKeyEnv()));
}

export function isEncryptedPayload(value: string) {
  return value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

export function encryptString(plaintext: string) {
  const key = getEncryptionKeyOrThrow();
  const iv = crypto.randomBytes(12);
  // AES-GCM requires a unique IV for every encryption operation under the same key.
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptString(payload: string) {
  const key = getEncryptionKeyOrThrow();

  if (!isEncryptedPayload(payload)) {
    throw new Error("Encrypted payload is missing the expected enc:v1 prefix.");
  }

  const parts = payload.split(":");
  if (parts.length !== 5) {
    throw new Error("Encrypted payload is malformed.");
  }

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
}

