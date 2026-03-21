import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function normalizeToken(token: string) {
  return token.trim();
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(normalizeToken(token)).digest("hex");
}

export function generatePasswordResetToken() {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  };
}
