function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeDecodeURIComponent(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return normalizeText(decoded) || value;
  } catch {
    return value;
  }
}

function readUrlPathCandidate(value: string) {
  try {
    const parsed = new URL(value);
    if (!parsed.hostname.toLowerCase().includes("adzuna")) {
      return "";
    }

    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const detailsIndex = pathSegments.findIndex(
      (segment) => segment.toLowerCase() === "details",
    );
    if (detailsIndex >= 0 && pathSegments[detailsIndex + 1]) {
      return pathSegments[detailsIndex + 1] ?? "";
    }

    return pathSegments.at(-1) ?? "";
  } catch {
    return "";
  }
}

function decodeBase64UrlCandidate(value: string) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "=",
    );
    const decoded = Buffer.from(padded, "base64").toString("utf8").trim();
    if (!decoded) {
      return "";
    }

    if (decoded.includes("::")) {
      return normalizeText(decoded.split("::").find(Boolean) ?? "");
    }

    return decoded;
  } catch {
    return "";
  }
}

function sanitizeCandidate(value: string) {
  const trimmed = normalizeText(value)
    .replace(/^adzuna:/i, "")
    .replace(/[\u0000-\u001F\u007F\uFFFD]/g, "")
    .trim();
  if (!trimmed) {
    return "";
  }

  const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  const withoutSlash = withoutQuery.split("/").filter(Boolean).at(-1) ?? withoutQuery;

  return withoutSlash
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9._~-]/g, "")
    .trim();
}

export function normalizeAdzunaProviderId(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) {
    return null;
  }

  const candidates = new Set<string>();
  const push = (candidate: unknown) => {
    const normalized = normalizeText(candidate);
    if (normalized) {
      candidates.add(normalized);
    }
  };

  push(raw);
  push(raw.replace(/^adzuna:/i, ""));

  const decodedOnce = safeDecodeURIComponent(raw);
  push(decodedOnce);
  const decodedTwice = safeDecodeURIComponent(decodedOnce);
  push(decodedTwice);

  for (const candidate of [...candidates]) {
    push(readUrlPathCandidate(candidate));
    push(decodeBase64UrlCandidate(candidate));
  }

  const sanitized = [...candidates]
    .map((candidate) => sanitizeCandidate(candidate))
    .filter(Boolean);

  const numericCandidate = sanitized.find((candidate) => /^\d+$/.test(candidate));
  if (numericCandidate) {
    return numericCandidate;
  }

  const safeCandidate = sanitized.find((candidate) =>
    /^[A-Za-z0-9._~-]+$/.test(candidate),
  );
  return safeCandidate ?? null;
}

export function buildAdzunaDetailsUrl(value: unknown): string | null {
  const providerId = normalizeAdzunaProviderId(value);
  return providerId
    ? `https://www.adzuna.com/details/${encodeURIComponent(providerId)}`
    : null;
}
