export const COOKIE_CONSENT_STORAGE_KEY = "hirexa_cookie_consent";
export const COOKIE_CONSENT_COOKIE_NAME = "hirexa_cookie_consent";
const COOKIE_CONSENT_EVENT = "hirexa:cookie-consent-change";
const COOKIE_CONSENT_MAX_AGE = 60 * 60 * 24 * 365;
let cachedConsentRaw: string | null | undefined;
let cachedConsentValue: CookieConsent | null = null;

export type CookieConsent = {
  necessary: true;
  analytics: boolean;
  version: 1;
  updatedAt: string;
};

function parseStoredConsent(raw: string | null): CookieConsent | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;

    return {
      necessary: true,
      analytics: parsed.analytics === true,
      version: 1,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function readCookieValue(name: string) {
  if (typeof document === "undefined") return null;

  const prefix = `${name}=`;
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) return null;

  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return entry.slice(prefix.length);
  }
}

export function createCookieConsent(args: {
  analytics: boolean;
}): CookieConsent {
  return {
    necessary: true,
    analytics: args.analytics,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function getStoredCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;

  const raw =
    window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) ??
    readCookieValue(COOKIE_CONSENT_COOKIE_NAME);

  if (raw === cachedConsentRaw) {
    return cachedConsentValue;
  }

  cachedConsentRaw = raw;
  cachedConsentValue = parseStoredConsent(raw);
  return cachedConsentValue;
}

export function persistCookieConsent(consent: CookieConsent) {
  if (typeof window === "undefined") return;

  const serialized = JSON.stringify(consent);
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, serialized);
  document.cookie = [
    `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(serialized)}`,
    "path=/",
    `max-age=${COOKIE_CONSENT_MAX_AGE}`,
    "samesite=lax",
  ].join("; ");
  cachedConsentRaw = serialized;
  cachedConsentValue = consent;
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
}

export function hasAnalyticsConsent(consent: CookieConsent | null | undefined) {
  return consent?.analytics === true;
}

export function subscribeToCookieConsent(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleChange = () => {
    onChange();
  };

  window.addEventListener(COOKIE_CONSENT_EVENT, handleChange);
  window.addEventListener("storage", handleChange);

  return () => {
    window.removeEventListener(COOKIE_CONSENT_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

export function getCookieConsentReadySnapshot() {
  return typeof window !== "undefined";
}
