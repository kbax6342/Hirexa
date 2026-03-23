import {
  decryptString,
  encryptString,
  isEncryptedPayload,
  isEncryptionConfigured,
} from "@/lib/security/encryption";

const isProduction = process.env.NODE_ENV === "production";

let warnedPlaintextPassthrough = false;
let warnedLegacyPlaintextRead = false;

function warnPlaintextPassthroughOnce() {
  if (warnedPlaintextPassthrough) return;
  warnedPlaintextPassthrough = true;
  console.warn(
    "[secureFields] APP_ENCRYPTION_KEY is not configured. Sensitive text will pass through unchanged in non-production only."
  );
}

function warnLegacyPlaintextReadOnce() {
  if (warnedLegacyPlaintextRead) return;
  warnedLegacyPlaintextRead = true;
  console.warn(
    "[secureFields] Reading legacy plaintext sensitive data. Rotate or rewrite these records after APP_ENCRYPTION_KEY is configured."
  );
}

export function protectSensitiveText(value: string | null | undefined) {
  if (value == null) return null;
  if (value.length === 0) return value;
  if (isEncryptedPayload(value)) return value;

  if (isEncryptionConfigured()) {
    return encryptString(value);
  }

  if (isProduction) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be configured in production before storing protected fields."
    );
  }

  // Local development may keep plaintext to avoid blocking existing workflows.
  warnPlaintextPassthroughOnce();
  return value;
}

export function revealSensitiveText(value: string | null | undefined) {
  if (value == null) return null;
  if (value.length === 0) return value;

  if (isEncryptedPayload(value)) {
    return decryptString(value);
  }

  // Legacy plaintext values remain readable so existing rows keep working.
  warnLegacyPlaintextReadOnce();
  return value;
}

