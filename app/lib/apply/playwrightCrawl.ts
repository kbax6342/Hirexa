import type { BrowserContext, Page } from "playwright-core";
import type { ApplySessionClickRecord } from "@/app/lib/apply/applySessionStore";
import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";
import {
  detectPageSignals,
  waitForDomAndSettle,
  type PageSignals,
} from "@/app/lib/apply/playwrightSignals";

type StatusUpdate = {
  status: ApplySessionStatus;
  lastUrl?: string;
  viewerUrl?: string;
  openUrl?: string;
  remoteSessionId?: string;
};

type CtaCandidate = {
  selector: string;
  text: string;
};

export type CtaChaseResult =
  | {
      page: Page;
      hopCount: number;
      urlsVisited: string[];
      clicks: ApplySessionClickRecord[];
      signals: PageSignals;
      finalReason?: string;
    }
  | {
      page: Page;
      hopCount: number;
      urlsVisited: string[];
      clicks: ApplySessionClickRecord[];
      signals: PageSignals;
      unavailable: true;
      finalReason: string;
    };

const APPLY_CTA_PATTERNS = [
  "apply now",
  "continue to application",
  "start application",
  "submit application",
  "easy apply",
  "apply on company site",
  "visit site to apply",
  "apply",
  "continue",
  "next",
] as const;

const MAX_CTA_HOPS = 7;

async function findNextApplyCallToAction(page: Page): Promise<CtaCandidate | null> {
  return page
    .evaluate((patterns) => {
      function isVisible(element: Element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-disabled") !== "true"
        );
      }

      function buildCssPath(element: Element) {
        if (element.id) {
          return `#${CSS.escape(element.id)}`;
        }

        const segments: string[] = [];
        let current: Element | null = element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          const tagName = current.tagName.toLowerCase();
          const parent: Element | null = current.parentElement;
          if (!parent) {
            segments.unshift(tagName);
            break;
          }

          const siblings = Array.from(parent.children).filter(
            (child) => (child as Element).tagName === current?.tagName,
          );
          const index = siblings.indexOf(current) + 1;
          segments.unshift(`${tagName}:nth-of-type(${index})`);
          current = parent;
        }

        return segments.join(" > ");
      }

      function getText(element: Element) {
        if (
          element instanceof HTMLInputElement &&
          (element.type === "submit" || element.type === "button")
        ) {
          return element.value ?? "";
        }

        return (
          element.textContent ??
          element.getAttribute("aria-label") ??
          element.getAttribute("title") ??
          ""
        );
      }

      const nodes = Array.from(
        document.querySelectorAll(
          "a, button, input[type='submit'], input[type='button'], [role='button']",
        ),
      );

      const candidates = nodes
        .filter(isVisible)
        .map((element) => {
          const rawText = getText(element).replace(/\s+/g, " ").trim();
          const lowerText = rawText.toLowerCase();
          if (!lowerText) return null;

          const matchingPatterns = patterns.filter((pattern) =>
            lowerText.includes(pattern),
          );
          if (matchingPatterns.length === 0) return null;

          let score = 0;
          for (const pattern of matchingPatterns) {
            score += pattern.length;
            if (lowerText === pattern) score += 40;
            if (lowerText.startsWith(pattern)) score += 15;
          }

          if (lowerText.includes("apply")) score += 25;
          if (lowerText.includes("application")) score += 15;
          if (element.tagName.toLowerCase() === "button") score += 5;

          return {
            selector: buildCssPath(element),
            text: rawText.slice(0, 160),
            score,
          };
        })
        .filter(
          (candidate): candidate is CtaCandidate & { score: number } =>
            candidate !== null,
        );

      candidates.sort((left, right) => right.score - left.score);

      return (candidates[0] as CtaCandidate | undefined) ?? null;
    }, [...APPLY_CTA_PATTERNS])
    .catch(() => null);
}

async function clickApplyCallToAction(args: {
  page: Page;
  context: BrowserContext;
  candidate: CtaCandidate;
  hop: number;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const fromUrl = args.page.url();
  const locator = args.page.locator(args.candidate.selector).first();
  const popupPromise = args.page.waitForEvent("popup", { timeout: 4_000 }).catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_CRAWL] clicking CTA", {
    hop: args.hop,
    fromUrl,
    selector: args.candidate.selector,
    text: args.candidate.text,
  });

  await locator.click({ timeout: 6_000 }).catch(() => locator.click({ force: true, timeout: 6_000 }));

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);

  let nextPage = args.page;
  let navigation: ApplySessionClickRecord["navigation"] = "same-tab";

  if (popupPage) {
    nextPage = popupPage;
    navigation = "popup";
  } else if (contextPage && contextPage !== args.page) {
    nextPage = contextPage;
    navigation = "new-page";
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  return {
    page: nextPage,
    click: {
      hop: args.hop,
      fromUrl,
      toUrl: nextPage.url(),
      selector: args.candidate.selector,
      text: args.candidate.text,
      navigation,
    } satisfies ApplySessionClickRecord,
  };
}

export async function chaseApplyPath(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
  onStatus?: (update: StatusUpdate) => Promise<void> | void;
  viewerUrl?: string;
  remoteSessionId?: string;
  openUrl?: string;
}): Promise<CtaChaseResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];

  let signals = await detectPageSignals(activePage);
  if (signals.confirmationDetected || signals.needsHuman || signals.formDetected) {
    return {
      page: activePage,
      hopCount: 0,
      urlsVisited,
      clicks,
      signals,
      finalReason: signals.confirmationDetected
        ? "Confirmation detected before form fill."
        : signals.needsHuman
          ? "Verification or account creation requires human completion."
          : "Application form detected.",
    };
  }

  for (let hop = 1; hop <= MAX_CTA_HOPS; hop += 1) {
    await args.onStatus?.({
      status: "FINDING_APPLY",
      lastUrl: activePage.url(),
      viewerUrl: args.viewerUrl,
      openUrl: args.openUrl ?? activePage.url(),
      remoteSessionId: args.remoteSessionId,
    });

    const candidate = await findNextApplyCallToAction(activePage);
    if (!candidate) {
      return {
        page: activePage,
        hopCount: hop - 1,
        urlsVisited,
        clicks,
        signals,
        unavailable: true,
        finalReason:
          "Auto apply is not available for this job application because no usable apply button path was found.",
      };
    }

    const result = await clickApplyCallToAction({
      page: activePage,
      context: args.context,
      candidate,
      hop,
      onPageReady: args.onPageReady,
    });

    activePage = result.page;
    clicks.push(result.click);

    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    signals = await detectPageSignals(activePage);

    console.log("[AUTO_APPLY_CRAWL] landed after CTA", {
      hop,
      url: activePage.url(),
      formDetected: signals.formDetected,
      confirmationDetected: signals.confirmationDetected,
      verificationDetected: signals.needsHuman,
    });

    if (signals.confirmationDetected || signals.needsHuman || signals.formDetected) {
      return {
        page: activePage,
        hopCount: hop,
        urlsVisited,
        clicks,
        signals,
        finalReason: signals.confirmationDetected
          ? "Confirmation detected after CTA chase."
          : signals.needsHuman
            ? "Verification or account creation requires human completion."
            : "Application form detected after CTA chase.",
      };
    }
  }

  return {
    page: activePage,
    hopCount: MAX_CTA_HOPS,
    urlsVisited,
    clicks,
    signals,
    unavailable: true,
    finalReason:
      "Auto apply is not available for this job application because the apply-button chase reached the hop limit.",
  };
}
