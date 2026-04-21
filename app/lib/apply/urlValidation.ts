import { isAggregatorHandoffUrl, normalizeJobUrl } from "@/app/lib/jobSources";

export type AutomationStartUrlInvalidReason =
  | "empty_url"
  | "invalid_url"
  | "search_engine_challenge_page"
  | "favicon_asset"
  | "static_asset_extension"
  | "known_asset_host"
  | "aggregator_url"
  | "search_engine_results_page"
  | "non_html_document";

export type AutomationStartUrlValidation = {
  rawUrl: string;
  normalizedUrl: string;
  hostname: string;
  pathname: string;
  isValid: boolean;
  reason?: AutomationStartUrlInvalidReason;
  isAggregator: boolean;
  isStaticAsset: boolean;
  isKnownAssetHost: boolean;
  isSearchEngine: boolean;
  isSearchEngineChallenge: boolean;
  likelyHtmlDocument: boolean;
};

const STATIC_ASSET_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "svg",
  "webp",
  "ico",
  "gif",
  "bmp",
  "avif",
  "css",
  "js",
  "mjs",
  "map",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "pdf",
  "json",
  "xml",
  "txt",
]);

const HTML_DOCUMENT_EXTENSIONS = new Set([
  "html",
  "htm",
  "php",
  "asp",
  "aspx",
  "jsp",
]);

const KNOWN_ASSET_HOST_FRAGMENTS = [
  "zunastatic",
  "kxcdn.com",
  "cloudfront.net",
  "akamaihd.net",
  "fastly.net",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
] as const;

const AGGREGATOR_HOST_FRAGMENTS = [
  "adzuna",
  "appcast.io",
  "indeed.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "monster.com",
  "simplyhired.com",
  "talent.com",
  "jobrapido.com",
  "jobg8.com",
  "lensa.com",
  "talroo.com",
  "dice.com",
] as const;

const SEARCH_ENGINE_HOST_FRAGMENTS = [
  "ecosia.org",
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
] as const;

const SEARCH_ENGINE_CHALLENGE_PATTERNS = [
  "/sorry",
  "/captcha",
  "challenge",
  "verify",
  "verification",
  "cf_chl",
  "areyouhuman",
] as const;

function normalizeHost(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function parseAutomationUrl(rawUrl: string) {
  const normalizedUrl = normalizeJobUrl(rawUrl);
  if (!normalizedUrl) {
    return {
      normalizedUrl,
      parsed: null,
      reason: "empty_url" as const,
    };
  }

  try {
    return {
      normalizedUrl,
      parsed: new URL(normalizedUrl),
      reason: undefined,
    };
  } catch {
    return {
      normalizedUrl,
      parsed: null,
      reason: "invalid_url" as const,
    };
  }
}

function getPathExtension(pathname: string) {
  const match = pathname.toLowerCase().match(/\.([a-z0-9]{1,8})$/i);
  return match?.[1] ?? "";
}

function hasStaticAssetExtension(pathname: string) {
  const extension = getPathExtension(pathname);
  return extension ? STATIC_ASSET_EXTENSIONS.has(extension) : false;
}

function isLikelyHtmlDocumentPath(pathname: string) {
  const extension = getPathExtension(pathname);
  if (!extension) return true;

  return HTML_DOCUMENT_EXTENSIONS.has(extension);
}

function hostMatches(hostname: string, fragments: readonly string[]) {
  return fragments.some(
    (fragment) => hostname === fragment || hostname.endsWith(`.${fragment}`),
  );
}

export function isKnownAssetHostname(hostname: string) {
  const normalized = normalizeHost(hostname);

  if (!normalized) return false;

  if (hostMatches(normalized, KNOWN_ASSET_HOST_FRAGMENTS)) {
    return true;
  }

  return normalized.startsWith("static.") || normalized.startsWith("assets.");
}

export function isKnownAggregatorHostname(hostname: string) {
  const normalized = normalizeHost(hostname);
  if (!normalized) return false;

  return hostMatches(normalized, AGGREGATOR_HOST_FRAGMENTS);
}

export function isSearchEngineHostname(hostname: string) {
  const normalized = normalizeHost(hostname);
  if (!normalized) return false;

  return hostMatches(normalized, SEARCH_ENGINE_HOST_FRAGMENTS);
}

export function isSearchEngineChallengeUrl(rawUrl: string | null | undefined) {
  const { parsed } = parseAutomationUrl(String(rawUrl ?? ""));
  if (!parsed) return false;

  if (!isSearchEngineHostname(parsed.hostname)) {
    return false;
  }

  const challengeSource = `${parsed.pathname}${parsed.search}`.toLowerCase();
  return SEARCH_ENGINE_CHALLENGE_PATTERNS.some((pattern) =>
    challengeSource.includes(pattern),
  );
}

export function validateAutomationStartUrl(
  rawUrl: string | null | undefined,
  options?: {
    rejectAggregator?: boolean;
    rejectSearchEngine?: boolean;
  },
): AutomationStartUrlValidation {
  const parsedResult = parseAutomationUrl(String(rawUrl ?? ""));
  const rejectAggregator = options?.rejectAggregator !== false;
  const rejectSearchEngine = options?.rejectSearchEngine !== false;

  if (!parsedResult.parsed) {
    return {
      rawUrl: String(rawUrl ?? ""),
      normalizedUrl: parsedResult.normalizedUrl,
      hostname: "",
      pathname: "",
      isValid: false,
      reason: parsedResult.reason,
      isAggregator: false,
      isStaticAsset: false,
      isKnownAssetHost: false,
      isSearchEngine: false,
      isSearchEngineChallenge: false,
      likelyHtmlDocument: false,
    };
  }

  const parsed = parsedResult.parsed;
  const normalizedUrl = parsedResult.normalizedUrl;
  const hostname = normalizeHost(parsed.hostname);
  const pathname = parsed.pathname || "/";
  const lowerPath = pathname.toLowerCase();
  const isFavicon = lowerPath.endsWith("/favicon.ico") || lowerPath === "/favicon.ico";
  const isStaticAsset = hasStaticAssetExtension(pathname) || isFavicon;
  const isKnownAssetHost = isKnownAssetHostname(hostname);
  const isAggregator =
    isAggregatorHandoffUrl(normalizedUrl) || isKnownAggregatorHostname(hostname);
  const isSearchEngine = isSearchEngineHostname(hostname);
  const isSearchEngineChallenge = isSearchEngineChallengeUrl(normalizedUrl);
  const likelyHtmlDocument = isLikelyHtmlDocumentPath(pathname);

  let reason: AutomationStartUrlInvalidReason | undefined;

  if (isSearchEngineChallenge) {
    reason = "search_engine_challenge_page";
  } else if (isFavicon) {
    reason = "favicon_asset";
  } else if (isStaticAsset) {
    reason = "static_asset_extension";
  } else if (isKnownAssetHost) {
    reason = "known_asset_host";
  } else if (rejectAggregator && isAggregator) {
    reason = "aggregator_url";
  } else if (rejectSearchEngine && isSearchEngine) {
    reason = "search_engine_results_page";
  } else if (!likelyHtmlDocument) {
    reason = "non_html_document";
  }

  return {
    rawUrl: String(rawUrl ?? ""),
    normalizedUrl,
    hostname,
    pathname,
    isValid: !reason,
    reason,
    isAggregator,
    isStaticAsset,
    isKnownAssetHost,
    isSearchEngine,
    isSearchEngineChallenge,
    likelyHtmlDocument,
  };
}

export function isValidAutomationStartUrl(
  rawUrl: string | null | undefined,
  options?: {
    rejectAggregator?: boolean;
    rejectSearchEngine?: boolean;
  },
) {
  return validateAutomationStartUrl(rawUrl, options).isValid;
}
