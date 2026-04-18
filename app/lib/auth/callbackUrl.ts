const DEFAULT_DEV_AUTH_ORIGIN = "http://localhost:3000";

function normalizeOrigin(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function getAllowedAuthOrigins() {
  const origins = new Set<string>();

  for (const value of [
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
  ]) {
    const origin = normalizeOrigin(value);
    if (origin) {
      origins.add(origin);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add(DEFAULT_DEV_AUTH_ORIGIN);
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

export function getDevAuthOrigin() {
  return normalizeOrigin(process.env.AUTH_URL)
    ?? normalizeOrigin(process.env.NEXTAUTH_URL)
    ?? DEFAULT_DEV_AUTH_ORIGIN;
}

export function toSafeRelativeCallbackUrl(
  value: string | null | undefined,
  fallback: string
) {
  const normalized = value?.trim();
  if (!normalized) return fallback;

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (!getAllowedAuthOrigins().has(parsed.origin)) {
      return fallback;
    }

    const relativePath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return relativePath.startsWith("/") ? relativePath : fallback;
  } catch {
    return fallback;
  }
}
