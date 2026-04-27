export type AtsJobUrlProvider =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "unknown";

export type AtsJobUrlIdentity = {
  provider: AtsJobUrlProvider;
  token?: string | null;
  board?: string | null;
  host?: string | null;
};

export type AtsJobIdentityComparison = {
  comparable: boolean;
  matches: boolean;
  reason:
    | "same_ats_token"
    | "different_ats_token"
    | "different_provider"
    | "missing_token"
    | "unknown_provider";
  expected: AtsJobUrlIdentity;
  actual: AtsJobUrlIdentity;
};

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function cleanPathSegments(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => decodeURIComponent(segment).trim())
    .filter(Boolean);
}

export function extractAtsJobIdentityFromUrl(
  value: string | null | undefined,
): AtsJobUrlIdentity {
  try {
    const url = new URL(String(value ?? ""));
    const host = normalizeHost(url.hostname);
    const segments = cleanPathSegments(url.pathname);

    if (host.includes("greenhouse.io")) {
      const token =
        url.searchParams.get("token") ??
        segments[segments.findIndex((segment) => segment === "jobs") + 1] ??
        null;
      const board =
        url.searchParams.get("for") ??
        (segments[0] && segments[0] !== "jobs" && segments[0] !== "embed"
          ? segments[0]
          : null);

      return {
        provider: "greenhouse",
        token,
        board,
        host,
      };
    }

    if (host === "jobs.lever.co" || host.endsWith(".lever.co")) {
      return {
        provider: "lever",
        board: segments[0] ?? null,
        token: segments[1] ?? null,
        host,
      };
    }

    if (host.includes("ashbyhq.com")) {
      return {
        provider: "ashby",
        board: segments[1] ?? segments[0] ?? null,
        token: segments.at(-1) ?? null,
        host,
      };
    }

    if (host.includes("workable.com")) {
      const viewIndex = segments.findIndex((segment) => segment === "view");
      return {
        provider: "workable",
        board: segments[0] ?? null,
        token: viewIndex >= 0 ? segments[viewIndex + 1] ?? null : segments.at(-1) ?? null,
        host,
      };
    }

    return { provider: "unknown", host };
  } catch {
    return { provider: "unknown", host: null };
  }
}

export function compareAtsJobIdentityFromUrls(
  expectedUrl: string | null | undefined,
  actualUrl: string | null | undefined,
): AtsJobIdentityComparison {
  const expected = extractAtsJobIdentityFromUrl(expectedUrl);
  const actual = extractAtsJobIdentityFromUrl(actualUrl);

  if (expected.provider === "unknown" || actual.provider === "unknown") {
    return {
      comparable: false,
      matches: true,
      reason: "unknown_provider",
      expected,
      actual,
    };
  }

  if (expected.provider !== actual.provider) {
    return {
      comparable: true,
      matches: false,
      reason: "different_provider",
      expected,
      actual,
    };
  }

  if (!expected.token || !actual.token) {
    return {
      comparable: false,
      matches: true,
      reason: "missing_token",
      expected,
      actual,
    };
  }

  return {
    comparable: true,
    matches: expected.token === actual.token,
    reason: expected.token === actual.token ? "same_ats_token" : "different_ats_token",
    expected,
    actual,
  };
}
