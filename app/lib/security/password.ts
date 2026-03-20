// /app/lib/security/password.ts
import bcrypt from "bcryptjs";

export const ACCOUNT_PASSWORD_RULES = [
  "At least 10 characters",
  "At least 1 uppercase letter",
  "At least 1 lowercase letter",
  "At least 1 number",
] as const;

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

export function validateAccountPassword(password: string) {
  const errors: string[] = [];

  if (password.length < 10) {
    errors.push("Password must be at least 10 characters long.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must include at least one uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must include at least one lowercase letter.");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must include at least one number.");
  }

  return {
    ok: errors.length === 0,
    errors,
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
