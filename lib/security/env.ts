const isProduction = process.env.NODE_ENV === "production";

type SecurityEnvValidationOptions = {
  requireAppEncryptionKey?: boolean;
  requireNeonAuth?: boolean;
};

let warnedOptionalNeonAuthEnv = false;

function readTrimmedEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function decodeBase64Key(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    const decoded = Buffer.from(padded, "base64");
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

export function decodeAppEncryptionKey(rawValue: string | null) {
  if (!rawValue) return null;

  if (/^[0-9a-fA-F]{64}$/.test(rawValue)) {
    return Buffer.from(rawValue, "hex");
  }

  const base64Decoded = decodeBase64Key(rawValue);
  if (base64Decoded) {
    return base64Decoded;
  }

  const utf8Decoded = Buffer.from(rawValue, "utf8");
  return utf8Decoded.length === 32 ? utf8Decoded : null;
}

function isPostgresLikeDatabaseUrl(value: string | null) {
  return Boolean(value && /^postgres(?:ql)?:\/\//i.test(value));
}

export function getAppEncryptionKeyEnv() {
  return readTrimmedEnv("APP_ENCRYPTION_KEY");
}

export function getDatabaseUrlEnv() {
  return readTrimmedEnv("DATABASE_URL");
}

export function getNeonAuthBaseUrlEnv() {
  return readTrimmedEnv("NEON_AUTH_BASE_URL");
}

export function getNeonAuthCookieSecretEnv() {
  return readTrimmedEnv("NEON_AUTH_COOKIE_SECRET");
}

export function isAppEncryptionKeyValid() {
  return Boolean(decodeAppEncryptionKey(getAppEncryptionKeyEnv()));
}

export function validateSecurityEnvironment(
  options: SecurityEnvValidationOptions = {}
) {
  const issues: string[] = [];
  const warnings: string[] = [];

  const databaseUrl = getDatabaseUrlEnv();
  if (!databaseUrl) {
    issues.push("DATABASE_URL is required.");
  } else if (
    isProduction &&
    isPostgresLikeDatabaseUrl(databaseUrl) &&
    !/sslmode=require/i.test(databaseUrl)
  ) {
    issues.push(
      "DATABASE_URL must include sslmode=require in production for Postgres/Neon."
    );
  }

  if (options.requireAppEncryptionKey) {
    const key = getAppEncryptionKeyEnv();
    if (!key) {
      issues.push(
        "APP_ENCRYPTION_KEY is required when selective field encryption is enabled."
      );
    } else if (!decodeAppEncryptionKey(key)) {
      issues.push(
        "APP_ENCRYPTION_KEY must decode to exactly 32 bytes (raw, base64/base64url, or 64-char hex)."
      );
    }
  }

  const neonAuthBaseUrl = getNeonAuthBaseUrlEnv();
  const neonAuthCookieSecret = getNeonAuthCookieSecretEnv();

  if (options.requireNeonAuth) {
    if (!neonAuthBaseUrl) {
      issues.push("NEON_AUTH_BASE_URL is required when Neon Auth is enabled.");
    }
    if (!neonAuthCookieSecret) {
      issues.push(
        "NEON_AUTH_COOKIE_SECRET is required when Neon Auth is enabled."
      );
    }
  } else if (
    isProduction &&
    !warnedOptionalNeonAuthEnv &&
    (!neonAuthBaseUrl || !neonAuthCookieSecret)
  ) {
    warnedOptionalNeonAuthEnv = true;
    warnings.push(
      "NEON_AUTH_BASE_URL / NEON_AUTH_COOKIE_SECRET are not configured. This is acceptable only if the deployment is not using Neon Auth-managed cookies."
    );
  }

  if (issues.length > 0 && isProduction) {
    throw new Error(`[security env] ${issues.join(" ")}`);
  }

  for (const warning of warnings) {
    console.warn(`[security env] ${warning}`);
  }

  return { issues, warnings };
}

