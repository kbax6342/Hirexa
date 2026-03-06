// /app/lib/security/password.ts
import bcrypt from "bcryptjs";

/**
 * Validates password strength.
 * Rules:
 * - at least 8 characters
 * - at least 1 uppercase letter
 * - at least 1 lowercase letter
 * - at least 1 number
 * - at least 1 special character
 */
export function validatePassword(password: string) {
  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const passed = Object.values(rules).filter(Boolean).length;

  return {
    ok: passed >= 4, // allow 4/5 rules to pass
    rules,
  };
}

/**
 * Hashes a password using bcrypt.
 * Safe for production use.
 */
export async function hashPassword(password: string): Promise<string> {
  const SALT_ROUNDS = 12;
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plaintext password with a bcrypt hash.
 * (Used during login)
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
