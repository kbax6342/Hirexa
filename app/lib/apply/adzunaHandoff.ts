import type { Page } from "playwright-core";

const ADZUNA_CTA_TEXT_PATTERNS = [
  "view ad",
  "view job",
  "apply",
  "apply now",
  "continue",
  "continue to application",
  "go to company site",
  "visit employer site",
] as const;

export type AdzunaHandoffUrlState = {
  isAdzunaUrl: boolean;
  isLandAdUrl: boolean;
  isTokenizedInterstitial: boolean;
  tokenizedParamsPresent: string[];
  isAuthUrl: boolean;
  isStillHandoff: boolean;
};

export type AdzunaHandoffSignals = AdzunaHandoffUrlState & {
  currentUrl: string;
  pageTitle?: string;
  likelyCtas: string[];
  bodySnippet?: string;
};

function safeParseUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function isAppcastTrackingUrl(rawUrl: string) {
  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return false;
  const hostname = parsed.hostname.toLowerCase();
  return hostname === "click.appcast.io" || hostname.endsWith(".appcast.io");
}

export function isAdzunaUrl(rawUrl: string) {
  const parsed = safeParseUrl(rawUrl);
  return Boolean(parsed?.hostname.toLowerCase().includes("adzuna"));
}

export function isAdzunaLandAdUrl(rawUrl: string) {
  const parsed = safeParseUrl(rawUrl);
  if (!parsed || !parsed.hostname.toLowerCase().includes("adzuna")) {
    return false;
  }

  return normalizePathname(parsed.pathname).includes("/land/ad");
}

export function isLikelyDownstreamApplicationUrl(rawUrl: string) {
  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return false;
  if (!/^https?:$/i.test(parsed.protocol)) return false;
  if (isAdzunaUrl(rawUrl) || isAppcastTrackingUrl(rawUrl)) {
    return false;
  }

  return Boolean(parsed.hostname.trim());
}

export function classifyAdzunaHandoffUrl(rawUrl: string): AdzunaHandoffUrlState {
  const parsed = safeParseUrl(rawUrl);
  if (!parsed) {
    return {
      isAdzunaUrl: false,
      isLandAdUrl: false,
      isTokenizedInterstitial: false,
      tokenizedParamsPresent: [],
      isAuthUrl: false,
      isStillHandoff: false,
    };
  }

  const isAdzunaHost = parsed.hostname.toLowerCase().includes("adzuna");
  const pathname = normalizePathname(parsed.pathname);
  const tokenizedParamsPresent = [
    parsed.searchParams.get("aztt")?.trim() ? "aztt" : null,
    parsed.searchParams.get("from_adp")?.trim() ? "from_adp" : null,
    parsed.searchParams.get("v")?.trim() ? "v" : null,
  ].filter((value): value is string => Boolean(value));
  const isLandAdUrl = isAdzunaHost && pathname.includes("/land/ad");
  const isAuthUrl =
    isAdzunaHost &&
    (pathname === "/authenticate" || pathname.startsWith("/authenticate/"));
  const isTokenizedInterstitial =
    isLandAdUrl &&
    (tokenizedParamsPresent.includes("aztt") ||
      tokenizedParamsPresent.includes("from_adp"));

  return {
    isAdzunaUrl: isAdzunaHost,
    isLandAdUrl,
    isTokenizedInterstitial,
    tokenizedParamsPresent,
    isAuthUrl,
    isStillHandoff: isLandAdUrl || isAuthUrl || isAppcastTrackingUrl(rawUrl),
  };
}

export async function extractAdzunaHandoffSignals(
  page: Page,
): Promise<AdzunaHandoffSignals> {
  const currentUrl = page.url();
  const urlState = classifyAdzunaHandoffUrl(currentUrl);
  const pageTitle = (await page.title().catch(() => "")).trim() || undefined;
  const snapshot = await page
    .evaluate((patterns) => {
      function isVisible(element: Element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      const likelyCtas = Array.from(
        document.querySelectorAll(
          "a[href], button, input[type='submit'], input[type='button'], [role='button']",
        ),
      )
        .filter(isVisible)
        .map((element) => {
          const rawText =
            element instanceof HTMLInputElement
              ? element.value
              : element.textContent ??
                element.getAttribute("aria-label") ??
                element.getAttribute("title") ??
                "";
          return rawText.replace(/\s+/g, " ").trim();
        })
        .filter((text) =>
          patterns.some((pattern) => text.toLowerCase().includes(pattern)),
        )
        .slice(0, 8);

      const bodySnippet = (document.body?.innerText ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 320);

      return {
        likelyCtas,
        bodySnippet: bodySnippet || undefined,
      };
    }, [...ADZUNA_CTA_TEXT_PATTERNS])
    .catch(
      () =>
        ({
          likelyCtas: [],
          bodySnippet: undefined,
        }) as { likelyCtas: string[]; bodySnippet?: string },
    );

  return {
    currentUrl,
    pageTitle,
    likelyCtas: snapshot.likelyCtas,
    bodySnippet: snapshot.bodySnippet,
    ...urlState,
  };
}
