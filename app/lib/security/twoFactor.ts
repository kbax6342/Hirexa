import "server-only";

import crypto from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

import {
  protectSensitiveText,
  revealSensitiveText,
} from "@/lib/security/secureFields";

const TWO_FACTOR_COOKIE = "hirexa_2fa_verified";
const TWO_FACTOR_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5;

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

function getSigningSecret() {
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.APP_ENCRYPTION_KEY?.trim();

  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for 2FA cookies.");
  }

  return secret;
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseBase64UrlJson(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as
      | Record<string, unknown>
      | null;
  } catch {
    return null;
  }
}

function signPayload(payload: string) {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getCookieValue(reader: CookieReader, names: string[]) {
  for (const name of names) {
    const value = reader.get(name)?.value;
    if (value) return value;
  }

  return null;
}

export function getTwoFactorCookieName() {
  return TWO_FACTOR_COOKIE;
}

export function getAuthSessionBinding(reader: CookieReader) {
  const sessionCookie = getCookieValue(reader, [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ]);

  if (!sessionCookie) return null;

  return crypto.createHash("sha256").update(sessionCookie).digest("base64url");
}

export function createTwoFactorVerifiedCookieValue(params: {
  userId: string;
  sessionBinding: string | null;
}) {
  const exp = Math.floor(Date.now() / 1000) + TWO_FACTOR_COOKIE_MAX_AGE_SECONDS;
  const payload = base64UrlJson({
    userId: params.userId,
    sessionBinding: params.sessionBinding,
    exp,
  });

  return `${payload}.${signPayload(payload)}`;
}

export function isTwoFactorCookieVerified(params: {
  value: string | null | undefined;
  userId: string;
  sessionBinding: string | null;
}) {
  if (!params.value) return false;

  const [payload, signature] = params.value.split(".");
  if (!payload || !signature || !safeEqual(signPayload(payload), signature)) {
    return false;
  }

  const parsed = parseBase64UrlJson(payload);
  if (!parsed) return false;

  const exp = typeof parsed.exp === "number" ? parsed.exp : 0;
  const userId = typeof parsed.userId === "string" ? parsed.userId : null;
  const sessionBinding =
    typeof parsed.sessionBinding === "string" ? parsed.sessionBinding : null;

  return (
    userId === params.userId &&
    sessionBinding === params.sessionBinding &&
    exp > Math.floor(Date.now() / 1000)
  );
}

export function getTwoFactorCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  };
}

export function generateTwoFactorSecret() {
  return generateSecret();
}

export function encryptTwoFactorSecret(secret: string) {
  return protectSensitiveText(secret);
}

export function decryptTwoFactorSecret(secret: string | null | undefined) {
  return revealSensitiveText(secret);
}

export function verifyTotpCode(params: {
  secret: string | null | undefined;
  code: string;
}) {
  const secret = params.secret?.trim();
  const code = normalizeTwoFactorCode(params.code);
  if (!secret || code.length !== 6) return false;

  const result = verifySync({
    secret,
    token: code,
    strategy: "totp",
    digits: 6,
    period: 30,
    epochTolerance: 30,
  });

  return Boolean(result.valid);
}

export function normalizeTwoFactorCode(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export function normalizeBackupCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function hashBackupCode(code: string) {
  return crypto
    .createHash("sha256")
    .update(`${normalizeBackupCode(code)}:${getSigningSecret()}`)
    .digest("hex");
}

export function generateBackupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(BACKUP_CODE_BYTES).toString("base64url").toUpperCase();
    const normalized = normalizeBackupCode(raw).slice(0, 10).padEnd(10, "X");
    return `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
  });
}

export async function createTotpSetupPayload(params: {
  secret: string;
  email: string;
}) {
  const service = "Hirexa AI";
  const label = `${service}:${params.email}`;
  const otpauthUrl = generateURI({
    issuer: service,
    label: params.email,
    secret: params.secret,
    strategy: "totp",
    digits: 6,
    period: 30,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    margin: 1,
    width: 220,
  });

  return {
    issuer: service,
    label,
    otpauthUrl,
    qrCodeDataUrl,
    manualEntryKey: params.secret,
  };
}
