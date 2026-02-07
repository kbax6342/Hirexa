// /app/lib/security/otp.ts
import crypto from "crypto";

/**
 * Generates a 6-digit numeric OTP as a STRING
 * Example: "042913"
 */
export function generateOtp6(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hashes the OTP so we never store it in plaintext
 */
export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}
