import * as cheerio from "cheerio";
import { normalizeJobUrl } from "@/app/lib/jobSources";
import { searchGoogleWithSerpApi } from "@/app/lib/jobs/serpapiSearchProvider";

export type JobSearchResult = {
  title: string;
  url: string;
  snippet?: string;
  displayedUrl?: string;
  position?: number | null;
  source?: string;
};

export type SearchProviderName =
  | "serpapi_google"
  | "duckduckgo_html"
  | "brave"
  | "serpapi"
  | "none";
type SearchProviderPreference = SearchProviderName | "google_first";
const DEFAULT_PROVIDER_ORDER: SearchProviderName[] = [
  "serpapi_google",
  "duckduckgo_html",
];

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SEARCH_TIMEOUT_MS = 12_000;
const TOKEN_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function resolveJobSearchProvider(args?: {
  preferredProvider?: SearchProviderPreference | string | null;
}): SearchProviderName | string {
  const order = resolveJobSearchProviderOrder(args);
  return order[0] ?? "duckduckgo_html";
}

function normalizeProviderName(value: string): SearchProviderName | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "serpapi") return "serpapi_google";
  if (
    normalized === "serpapi_google" ||
    normalized === "duckduckgo_html" ||
    normalized === "brave" ||
    normalized === "none"
  ) {
    return normalized;
  }
  return null;
}

function dedupeProviderOrder(order: SearchProviderName[]) {
  const seen = new Set<SearchProviderName>();
  const deduped: SearchProviderName[] = [];
  for (const provider of order) {
    if (seen.has(provider)) continue;
    seen.add(provider);
    deduped.push(provider);
  }
  return deduped;
}

export function resolveJobSearchProviderOrder(args?: {
  preferredProvider?: SearchProviderPreference | string | null;
}): SearchProviderName[] {
  const preferredProvider = String(args?.preferredProvider ?? "")
    .trim()
    .toLowerCase();
  const envOrder = String(process.env.JOB_SEARCH_PROVIDER_ORDER ?? "")
    .split(",")
    .map((value) => normalizeProviderName(value))
    .filter((value): value is SearchProviderName => Boolean(value));
  const fallbackConfiguredProvider = normalizeProviderName(
    String(process.env.JOB_SEARCH_PROVIDER ?? ""),
  );
  const baseline = dedupeProviderOrder([
    ...(envOrder.length > 0 ? envOrder : DEFAULT_PROVIDER_ORDER),
    ...(fallbackConfiguredProvider ? [fallbackConfiguredProvider] : []),
    ...DEFAULT_PROVIDER_ORDER,
  ]);

  if (preferredProvider === "google_first") {
    return dedupeProviderOrder(["serpapi_google", ...baseline]);
  }

  const preferredAsProvider = normalizeProviderName(preferredProvider);
  if (preferredAsProvider) {
    return dedupeProviderOrder([preferredAsProvider, ...baseline]);
  }

  return baseline.length > 0 ? baseline : [...DEFAULT_PROVIDER_ORDER];
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeoutId);
    },
  };
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrlKey(url: string) {
  const normalizedUrl = normalizeJobUrl(url);
  if (!normalizedUrl) return "";

  try {
    const parsed = new URL(normalizedUrl);
    parsed.hash = "";
    if (parsed.pathname.endsWith("/") && parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    return parsed.toString();
  } catch {
    return normalizedUrl;
  }
}

function unwrapDuckDuckGoUrl(href: string) {
  const trimmed = href.trim();
  if (!trimmed) return "";

  const normalizedHref = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : trimmed.startsWith("/")
      ? `https://duckduckgo.com${trimmed}`
      : trimmed;

  try {
    const parsed = new URL(normalizedHref);
    const unwrapped = parsed.searchParams.get("uddg");
    return normalizeJobUrl(unwrapped ?? normalizedHref);
  } catch {
    return normalizeJobUrl(normalizedHref);
  }
}

async function fetchText(url: string, init?: RequestInit) {
  const timeout = createTimeoutSignal(SEARCH_TIMEOUT_MS);

  try {
    const headers = new Headers(init?.headers);
    headers.set("user-agent", DEFAULT_USER_AGENT);
    headers.set(
      "accept",
      "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5",
    );

    const response = await fetch(url, {
      ...init,
      headers,
      signal: timeout.signal,
    });

    const body = await response.text();
    return { response, body };
  } finally {
    timeout.clear();
  }
}

export function normalizeHostname(value: string) {
  const normalizedUrl = normalizeJobUrl(value);
  if (!normalizedUrl) return "";

  try {
    return new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^www\./, "").trim();
  }
}

export function tokenizeSimilarityInput(value: string | null | undefined) {
  return normalizeText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 2 &&
        !TOKEN_STOP_WORDS.has(token) &&
        !/^\d+$/.test(token),
    );
}

export function scoreTokenSimilarity(
  left: string | string[] | null | undefined,
  right: string | string[] | null | undefined,
) {
  const leftTokens = Array.isArray(left) ? left : tokenizeSimilarityInput(left);
  const rightTokens = Array.isArray(right)
    ? right
    : tokenizeSimilarityInput(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let overlapCount = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlapCount += 1;
    }
  }

  const unionSize = new Set([...leftSet, ...rightSet]).size;
  return unionSize > 0 ? overlapCount / unionSize : 0;
}

export function dedupeJobSearchResults(results: JobSearchResult[]) {
  const seen = new Set<string>();
  const deduped: JobSearchResult[] = [];

  for (const result of results) {
    const key = normalizeUrlKey(result.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      ...result,
      url: normalizeJobUrl(result.url),
    });
  }

  return deduped;
}

async function searchDuckDuckGoHtml(query: string, limit: number) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const { response, body } = await fetchText(url.toString());
  if (!response.ok) {
    throw new Error(`DuckDuckGo HTML search failed (${response.status})`);
  }

  const $ = cheerio.load(body);
  const results: JobSearchResult[] = [];

  $(".result").each((_, element) => {
    if (results.length >= limit) return false;

    const titleLink = $(element).find(".result__title .result__a").first();
    const snippet =
      $(element).find(".result__snippet").first().text().trim() || undefined;
    const title = titleLink.text().trim();
    const href = unwrapDuckDuckGoUrl(titleLink.attr("href") ?? "");

    if (!title || !href) {
      return;
    }

    results.push({
      title,
      url: href,
      snippet,
      source: "duckduckgo_html",
    });
  });

  return results;
}

async function searchDuckDuckGoLite(query: string, limit: number) {
  const url = new URL("https://lite.duckduckgo.com/lite/");
  url.searchParams.set("q", query);

  const { response, body } = await fetchText(url.toString());
  if (!response.ok) {
    throw new Error(`DuckDuckGo Lite search failed (${response.status})`);
  }

  const $ = cheerio.load(body);
  const results: JobSearchResult[] = [];
  const rows = $("tr").toArray();

  for (let index = 0; index < rows.length && results.length < limit; index += 1) {
    const row = rows[index];
    const link = $(row).find("a.result-link").first();
    const title = link.text().trim();
    const href = unwrapDuckDuckGoUrl(link.attr("href") ?? "");

    if (!title || !href) {
      continue;
    }

    const snippet = $(rows[index + 1] ?? "")
      .find(".result-snippet")
      .first()
      .text()
      .trim();

    results.push({
      title,
      url: href,
      snippet: snippet || undefined,
      source: "duckduckgo_lite",
    });
  }

  return results;
}

async function searchDuckDuckGo(query: string, limit: number) {
  try {
    const htmlResults = await searchDuckDuckGoHtml(query, limit);
    if (htmlResults.length > 0) {
      return htmlResults;
    }
  } catch (error) {
    console.warn("[JOB_SEARCH_PROVIDER] DuckDuckGo HTML search failed", {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return searchDuckDuckGoLite(query, limit);
}

async function searchBrave(query: string, limit: number) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY is not configured.");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));

  const timeout = createTimeoutSignal(SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
        "x-subscription-token": apiKey,
        "user-agent": DEFAULT_USER_AGENT,
      },
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`Brave search failed (${response.status})`);
    }

    const data = (await response.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };

    return (data.web?.results ?? [])
      .map((result) => ({
        title: String(result.title ?? "").trim(),
        url: normalizeJobUrl(String(result.url ?? "").trim()),
        snippet: String(result.description ?? "").trim() || undefined,
        source: "brave",
      }))
      .filter((result) => result.title && result.url)
      .slice(0, limit);
  } finally {
    timeout.clear();
  }
}

async function searchSerpApi(
  query: string,
  limit: number,
  location?: string | null,
) {
  const results = await searchGoogleWithSerpApi({
    query,
    location,
    limit,
  });
  return results.map((result) => ({
    title: result.title,
    url: normalizeJobUrl(result.url),
    snippet: result.snippet ?? undefined,
    displayedUrl: result.displayedUrl ?? undefined,
    position: result.position ?? null,
    source: "serpapi_google",
  }));
}

async function searchSingleQuery(
  provider: SearchProviderName | string,
  query: string,
  limit: number,
  location?: string | null,
) {
  switch (provider) {
    case "serpapi_google":
      return searchSerpApi(query, limit, location);
    case "duckduckgo_html":
      return searchDuckDuckGo(query, limit);
    case "brave":
      return searchBrave(query, limit);
    case "serpapi":
      return searchSerpApi(query, limit, location);
    case "none":
      console.warn("[JOB_SEARCH_PROVIDER] Search provider disabled", {
        query,
      });
      return [];
    default:
      console.warn("[JOB_SEARCH_PROVIDER] Unsupported search provider", {
        provider,
        query,
      });
      return [];
  }
}

export async function searchJobPages(args: {
  queries: string[];
  location?: string | null;
  limit?: number;
  preferredProvider?: SearchProviderPreference | string | null;
}): Promise<JobSearchResult[]> {
  const queries = args.queries
    .map((query) => query.trim())
    .filter(Boolean);
  const limit = Math.max(1, Math.min(args.limit ?? 8, 24));

  if (queries.length === 0) {
    return [];
  }

  const providers = resolveJobSearchProviderOrder({
    preferredProvider: args.preferredProvider,
  });
  const perQueryLimit = Math.max(3, Math.ceil(limit / queries.length) + 2);
  const combinedResults: JobSearchResult[] = [];

  console.info("[JOB_SEARCH_PROVIDER] Step 1 completed: existing direct resolver/search provider flow inspected");
  console.info("[JOB_SEARCH_PROVIDER] provider order", {
    providers,
  });
  console.info(
    "[JOB_SEARCH_PROVIDER] Step 3 completed: SerpAPI-first provider order implemented",
  );

  for (const provider of providers) {
    console.info("[JOB_SEARCH_PROVIDER] search start", {
      provider,
      queryCount: queries.length,
      limit,
    });

    const results = await Promise.allSettled(
      queries.map((query) =>
        searchSingleQuery(provider, query, perQueryLimit, args.location),
      ),
    );

    const providerCombined: JobSearchResult[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        providerCombined.push(...result.value);
        return;
      }

      console.warn("[JOB_SEARCH_PROVIDER] query failed", {
        provider,
        query: queries[index],
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    });

    const providerDeduped = dedupeJobSearchResults(providerCombined);
    combinedResults.push(...providerDeduped);

    console.info("[JOB_SEARCH_PROVIDER] search completed", {
      provider,
      queryCount: queries.length,
      resultCount: providerDeduped.length,
    });
  }

  const maxResults = Math.max(limit, limit * Math.max(providers.length, 1));
  return dedupeJobSearchResults(combinedResults).slice(0, maxResults);
}
