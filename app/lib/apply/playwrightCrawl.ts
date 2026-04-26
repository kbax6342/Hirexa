import type { BrowserContext, Page } from "playwright-core";
import type {
  ApplySessionClickRecord,
  ApplySessionCtaAttemptRecord,
} from "@/app/lib/apply/applySessionStore";
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
  href?: string | null;
  role?: string | null;
  tagName: string;
  score: number;
  reasons: string[];
  matchedText: string;
};

type CandidateSeedHints = {
  preferredTexts?: string[];
  preferredSelectors?: string[];
};

type PageCandidateSnapshot = {
  candidates: CtaCandidate[];
  visibleTexts: string[];
  bodyPreview: string;
  formsFound: number;
  iframeCount: number;
  shadowHostCount: number;
};

type ActionSnapshot = {
  url: string;
  title: string;
  bodyPreview: string;
  formCount: number;
  dialogCount: number;
  ctaFingerprint: string;
};

export type CtaChaseResult =
  | {
      page: Page;
      hopCount: number;
      urlsVisited: string[];
      clicks: ApplySessionClickRecord[];
      attempts: ApplySessionCtaAttemptRecord[];
      attemptedSelectors: string[];
      ctaFound: boolean;
      signals: PageSignals;
      finalReason?: string;
      lastActionText?: string;
      lastActionSelector?: string;
    }
  | {
      page: Page;
      hopCount: number;
      urlsVisited: string[];
      clicks: ApplySessionClickRecord[];
      attempts: ApplySessionCtaAttemptRecord[];
      attemptedSelectors: string[];
      ctaFound: boolean;
      signals: PageSignals;
      unavailable: true;
      finalReason: string;
      lastActionText?: string;
      lastActionSelector?: string;
    };

const HIGH_PRIORITY_TEXT_SCORES: Array<[pattern: string, score: number]> = [
  ["apply", 110],
  ["apply now", 105],
  ["apply for this job", 100],
  ["apply for this position", 96],
  ["continue to application", 92],
  ["continue application", 88],
  ["start application", 88],
  ["start your application", 86],
  ["proceed to application", 84],
  ["view application", 82],
  ["submit application", 80],
  ["apply on company site", 78],
  ["begin", 42],
  ["continue", 34],
  ["next", 28],
  ["submit", 22],
];

const REJECT_TEXT_PATTERNS = [
  "apply filters",
  "filter",
  "search",
  "save job",
  "saved",
  "share",
  "copy link",
  "email job",
  "career coach",
  "sign up for alerts",
  "job alerts",
  "newsletter",
  "accept cookies",
  "reject cookies",
  "manage preferences",
  "cookie preferences",
  "privacy choices",
  "apply coupon",
  "apply credits",
  "subscribe",
  "sign in",
  "log in",
  "login",
] as const;

const HARD_REJECT_TEXT_PATTERNS = [
  "apply filters",
  "apply coupon",
  "apply credits",
  "accept cookies",
  "reject cookies",
  "manage preferences",
  "cookie preferences",
  "privacy choices",
] as const;

const CTA_HREF_PATTERNS = [
  "/apply",
  "/application",
  "/jobs/",
  "/careers/",
  "job_app",
  "greenhouse.io",
  "lever.co",
  "icims.com/jobs/",
  "workdayjobs.com",
  "ashbyhq.com",
  "workable.com",
] as const;

const CTA_SELECTOR = [
  "a",
  "button",
  "input[type='submit']",
  "input[type='button']",
  "[role='button']",
  "[aria-label]",
  "[title]",
  "[data-testid]",
  "[data-qa]",
].join(", ");

const MAX_CTA_HOPS = 10;
const MAX_NO_PROGRESS_ATTEMPTS = 2;

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function readActionSnapshot(page: Page): Promise<ActionSnapshot> {
  return page
    .evaluate(() => {
      const bodyText = document.body?.innerText ?? "";
      const candidateTexts = Array.from(
        document.querySelectorAll("a, button, input[type='submit'], input[type='button']"),
      )
        .map((element) => {
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
        })
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 12)
        .join(" | ");

      return {
        url: window.location.href,
        title: document.title ?? "",
        bodyPreview: bodyText.replace(/\s+/g, " ").trim().slice(0, 400),
        formCount: document.querySelectorAll("form").length,
        dialogCount: document.querySelectorAll("dialog, [role='dialog'], [aria-modal='true']").length,
        ctaFingerprint: candidateTexts,
      };
    })
    .catch(() => ({
      url: page.url(),
      title: "",
      bodyPreview: "",
      formCount: 0,
      dialogCount: 0,
      ctaFingerprint: "",
    }));
}

async function collectUniversalCtaCandidates(
  page: Page,
  seedHints?: CandidateSeedHints,
): Promise<PageCandidateSnapshot> {
  return page
    .evaluate(
      ({
        selector,
        highPriorityTextScores,
        rejectTextPatterns,
        hardRejectTextPatterns,
        hrefPatterns,
        seedHints,
      }) => {
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

        function isEnabled(element: Element) {
          return (
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

            const currentTagName = current.tagName;
            const siblings = Array.from(parent.children).filter(
              (child): child is Element => child instanceof Element,
            ).filter(
              (child) => child.tagName === currentTagName,
            );
            const index = siblings.indexOf(current) + 1;
            segments.unshift(`${tagName}:nth-of-type(${index})`);
            current = parent;
          }

          return segments.join(" > ");
        }

        function getPrimaryText(element: Element) {
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

        function hasCookieContext(element: Element) {
          const cookieContainer = element.closest(
            '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [data-testid*="cookie"], [data-testid*="consent"], [aria-label*="cookie" i], [aria-label*="consent" i]',
          );
          if (!cookieContainer) return false;
          const text = (cookieContainer.textContent ?? "").toLowerCase();
          return (
            text.includes("cookie") ||
            text.includes("consent") ||
            text.includes("privacy") ||
            text.includes("preferences")
          );
        }

        function normalize(value: string | null | undefined) {
          return String(value ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
        }

        function findMatchedText(combinedText: string) {
          for (const [pattern] of highPriorityTextScores) {
            if (combinedText.includes(pattern)) {
              return pattern;
            }
          }
          return combinedText.slice(0, 80);
        }

        const preferredTexts = (seedHints?.preferredTexts ?? [])
          .map((value) => normalize(value))
          .filter(Boolean);
        const preferredSelectors = (seedHints?.preferredSelectors ?? [])
          .map((value) => normalize(value))
          .filter(Boolean);
        const nodes = Array.from(document.querySelectorAll(selector));
        const seen = new Set<string>();
        const candidates: Array<CtaCandidate & { score: number }> = [];

        for (const node of nodes) {
          if (!isVisible(node) || !isEnabled(node)) continue;
          if (node.closest("header, nav, footer, [role='navigation']")) continue;
          if (hasCookieContext(node)) continue;

          const selectorValue = buildCssPath(node);
          const primaryText = getPrimaryText(node).replace(/\s+/g, " ").trim();
          const ariaLabel = node.getAttribute("aria-label") ?? "";
          const title = node.getAttribute("title") ?? "";
          const dataTestId = node.getAttribute("data-testid") ?? "";
          const dataQa = node.getAttribute("data-qa") ?? "";
          const elementId = node.getAttribute("id") ?? "";
          const className =
            node instanceof HTMLElement ? node.className?.toString?.() ?? "" : "";
          const href = node instanceof HTMLAnchorElement ? node.href : null;
          const tagName = node.tagName.toLowerCase();
          const role = node.getAttribute("role");
          const combinedText = normalize(
            [
              primaryText,
              ariaLabel,
              title,
              dataTestId,
              dataQa,
              elementId,
              className,
              href ?? "",
            ].join(" "),
          );

          if (!combinedText) continue;

          const signature = `${selectorValue}::${primaryText}::${href ?? ""}`;
          if (seen.has(signature)) continue;
          seen.add(signature);

          const reasons: string[] = [];
          let score = 0;
          let rejectedReason: string | null = null;

          for (const pattern of hardRejectTextPatterns) {
            if (combinedText.includes(pattern)) {
              rejectedReason = `rejected:${pattern}`;
              break;
            }
          }

          if (rejectedReason) continue;

          for (const pattern of rejectTextPatterns) {
            if (combinedText.includes(pattern)) {
              const stillLooksApply =
                combinedText.includes("apply") ||
                combinedText.includes("application") ||
                combinedText.includes("continue to application");
              if (!stillLooksApply) {
                rejectedReason = `rejected:${pattern}`;
                break;
              }
            }
          }

          if (rejectedReason) continue;

          for (const [pattern, bonus] of highPriorityTextScores) {
            if (combinedText === pattern) {
              score += bonus + 16;
              reasons.push(`exact_text:${pattern}`);
              continue;
            }
            if (combinedText.includes(pattern)) {
              score += bonus;
              reasons.push(`text:${pattern}`);
            }
          }

          if (combinedText.includes("apply")) {
            score += 22;
            reasons.push("contains_apply");
          }
          if (combinedText.includes("application")) {
            score += 12;
            reasons.push("contains_application");
          }
          if (combinedText.includes("continue")) {
            score += 8;
            reasons.push("contains_continue");
          }
          if (combinedText.includes("submit")) {
            score += 8;
            reasons.push("contains_submit");
          }

          if (href) {
            for (const pattern of hrefPatterns) {
              if (href.toLowerCase().includes(pattern)) {
                score += pattern === "/apply" || pattern === "/application" ? 30 : 12;
                reasons.push(`href:${pattern}`);
              }
            }
          }

          const contextContainer = node.closest(
            "main, article, [role='main'], form, [class*='job' i], [id*='job' i], [class*='apply' i], [id*='apply' i]",
          );
          if (contextContainer) {
            score += 14;
            reasons.push("job_content_container");
          }

          const rect =
            node instanceof HTMLElement
              ? node.getBoundingClientRect()
              : { top: Number.MAX_SAFE_INTEGER };
          if (rect.top < window.innerHeight) {
            score += 9;
            reasons.push("above_fold");
          }
          if (rect.top < 320) {
            score += 4;
            reasons.push("high_priority_position");
          }

          if (tagName === "button") {
            score += 5;
            reasons.push("button");
          } else if (tagName === "a") {
            score += 4;
            reasons.push("link");
          } else if (tagName === "input") {
            score += 4;
            reasons.push("input_button");
          }

          const selectorContext = normalize(
            `${selectorValue} ${dataTestId} ${dataQa} ${elementId} ${className}`,
          );
          if (
            selectorContext.includes("apply") ||
            selectorContext.includes("application") ||
            selectorContext.includes("continue")
          ) {
            score += 12;
            reasons.push("selector_apply_hint");
          }

          for (const preferredText of preferredTexts) {
            if (!preferredText) continue;
            if (combinedText === preferredText) {
              score += 40;
              reasons.push(`strategy_text_exact:${preferredText}`);
              continue;
            }
            if (combinedText.includes(preferredText) || preferredText.includes(combinedText)) {
              score += 24;
              reasons.push(`strategy_text:${preferredText}`);
            }
          }

          for (const preferredSelector of preferredSelectors) {
            if (!preferredSelector) continue;
            if (
              selectorContext.includes(preferredSelector) ||
              preferredSelector.includes(selectorContext)
            ) {
              score += 24;
              reasons.push(`strategy_selector:${preferredSelector}`);
            }
          }

          if (
            !combinedText.includes("apply") &&
            !combinedText.includes("continue") &&
            !combinedText.includes("next") &&
            !combinedText.includes("submit") &&
            !combinedText.includes("application") &&
            !(href && hrefPatterns.some((pattern) => href.toLowerCase().includes(pattern)))
          ) {
            continue;
          }

          candidates.push({
            selector: selectorValue,
            text: primaryText || ariaLabel || title || dataTestId || elementId || tagName,
            href,
            role,
            tagName,
            score,
            reasons,
            matchedText: findMatchedText(combinedText),
          });
        }

        candidates.sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return left.selector.localeCompare(right.selector);
        });

        const visibleTexts = Array.from(
          document.querySelectorAll("a, button, input[type='submit'], input[type='button']"),
        )
          .map((element) => getPrimaryText(element).replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, 30);

        const bodyPreview = (document.body?.innerText ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);

        const shadowHostCount = Array.from(document.querySelectorAll("*")).filter((element) =>
          Boolean((element as HTMLElement).shadowRoot),
        ).length;

        return {
          candidates,
          visibleTexts,
          bodyPreview,
          formsFound: document.querySelectorAll("form").length,
          iframeCount: document.querySelectorAll("iframe").length,
          shadowHostCount,
        };
      },
      {
        selector: CTA_SELECTOR,
        highPriorityTextScores: HIGH_PRIORITY_TEXT_SCORES,
        rejectTextPatterns: [...REJECT_TEXT_PATTERNS],
        hardRejectTextPatterns: [...HARD_REJECT_TEXT_PATTERNS],
        hrefPatterns: [...CTA_HREF_PATTERNS],
        seedHints,
      },
    )
    .catch(() => ({
      candidates: [],
      visibleTexts: [],
      bodyPreview: "",
      formsFound: 0,
      iframeCount: 0,
      shadowHostCount: 0,
    }));
}

async function clickCandidateAndWaitForProgress(args: {
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
  const beforeSnapshot = await readActionSnapshot(args.page);
  const locator = args.page.locator(args.candidate.selector).first();
  const popupPromise = args.page.waitForEvent("popup", { timeout: 4_000 }).catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_UNIVERSAL_ACTION] clicking", {
    hop: args.hop,
    fromUrl,
    selector: args.candidate.selector,
    text: args.candidate.text,
    href: args.candidate.href ?? null,
    score: args.candidate.score,
    reasons: args.candidate.reasons,
  });

  await locator.click({ timeout: 6_000 }).catch(() =>
    locator.click({ force: true, timeout: 6_000 }),
  );

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

  await nextPage.waitForTimeout(750).catch(() => undefined);
  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  const afterSnapshot = await readActionSnapshot(nextPage);
  const signals = await detectPageSignals(nextPage);
  const progressed =
    afterSnapshot.url !== beforeSnapshot.url ||
    afterSnapshot.formCount !== beforeSnapshot.formCount ||
    afterSnapshot.dialogCount !== beforeSnapshot.dialogCount ||
    afterSnapshot.ctaFingerprint !== beforeSnapshot.ctaFingerprint ||
    afterSnapshot.title !== beforeSnapshot.title ||
    afterSnapshot.bodyPreview !== beforeSnapshot.bodyPreview ||
    signals.formDetected ||
    signals.confirmationDetected ||
    signals.needsHuman;

  return {
    page: nextPage,
    signals,
    progressed,
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

async function resolvePreferredSelectorCandidate(
  page: Page,
  selector: string,
): Promise<CtaCandidate | null> {
  const locator = page.locator(selector).first();
  if ((await locator.count().catch(() => 0)) === 0) return null;
  if (!(await locator.isVisible().catch(() => false))) return null;
  if (!(await locator.isEnabled().catch(() => false))) return null;

  const text =
    (await locator
      .evaluate((element) => {
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
      })
      .catch(() => "")) || selector;
  const href = await locator
    .evaluate((element) =>
      element instanceof HTMLAnchorElement ? element.href : null,
    )
    .catch(() => null);
  const tagName = await locator
    .evaluate((element) => element.tagName.toLowerCase())
    .catch(() => "element");
  const role = await locator.getAttribute("role").catch(() => null);

  return {
    selector,
    text: text.replace(/\s+/g, " ").trim() || selector,
    href,
    role,
    tagName,
    score: 500,
    reasons: ["preferred_selector"],
    matchedText: text.replace(/\s+/g, " ").trim() || selector,
  };
}

export async function runUniversalApplyActionLoop(args: {
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
  applicationId?: string | null;
  preferredTexts?: string[];
  preferredSelectors?: string[];
}): Promise<CtaChaseResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const attemptedSelectors: string[] = [];

  let signals = await detectPageSignals(activePage);
  if (signals.confirmationDetected) {
    return {
      page: activePage,
      hopCount: 0,
      urlsVisited,
      clicks,
      attempts,
      attemptedSelectors,
      ctaFound: false,
      signals,
      finalReason: "Confirmation detected before universal action loop.",
    };
  }

  if (signals.formDetected) {
    return {
      page: activePage,
      hopCount: 0,
      urlsVisited,
      clicks,
      attempts,
      attemptedSelectors,
      ctaFound: false,
      signals,
      finalReason: "Application form detected before universal action loop.",
    };
  }

  if (signals.verificationEvidence.detected) {
    return {
      page: activePage,
      hopCount: 0,
      urlsVisited,
      clicks,
      attempts,
      attemptedSelectors,
      ctaFound: false,
      signals,
      finalReason:
        "Verification requires human completion before universal action loop.",
    };
  }

  let noProgressAttempts = 0;
  let lastActionText: string | undefined;
  let lastActionSelector: string | undefined;
  let ctaFound = false;

  for (let hop = 1; hop <= MAX_CTA_HOPS; hop += 1) {
    await args.onStatus?.({
      status: "FINDING_APPLY",
      lastUrl: activePage.url(),
      viewerUrl: args.viewerUrl,
      openUrl: args.openUrl ?? activePage.url(),
      remoteSessionId: args.remoteSessionId,
    });

    if (hop === 1) {
      for (const preferredSelector of args.preferredSelectors ?? []) {
        const selector = preferredSelector.trim();
        if (!selector) continue;
        attemptedSelectors.push(selector);
        const preferredCandidate = await resolvePreferredSelectorCandidate(
          activePage,
          selector,
        );
        attempts.push({
          phase: "universal",
          action: "scan",
          selector,
          text: preferredCandidate?.text ?? "preferred selector not found",
          matchedText: preferredCandidate?.matchedText ?? "",
          locatorStrategy: "saved_strategy_preferred_selector",
          candidateFound: Boolean(preferredCandidate),
          success: Boolean(preferredCandidate),
          urlBefore: activePage.url(),
          applyCtaFoundAfter: Boolean(preferredCandidate),
        } satisfies ApplySessionCtaAttemptRecord);
        if (!preferredCandidate) continue;

        ctaFound = true;
        const result = await clickCandidateAndWaitForProgress({
          page: activePage,
          context: args.context,
          candidate: preferredCandidate,
          hop,
          onPageReady: args.onPageReady,
        });

        activePage = result.page;
        signals = result.signals;
        clicks.push(result.click);
        lastActionText = preferredCandidate.text;
        lastActionSelector = preferredCandidate.selector;

        attempts.push({
          phase: "universal",
          action: "click",
          selector,
          text: preferredCandidate.text,
          matchedText: preferredCandidate.matchedText,
          locatorStrategy: "saved_strategy_preferred_selector",
          candidateFound: true,
          success: result.progressed,
          urlBefore: result.click.fromUrl,
          urlAfter: result.click.toUrl,
          applyCtaFoundAfter: signals.formDetected || signals.confirmationDetected,
        } satisfies ApplySessionCtaAttemptRecord);

        if (!urlsVisited.includes(activePage.url())) {
          urlsVisited.push(activePage.url());
        }

        if (
          signals.confirmationDetected ||
          signals.formDetected ||
          signals.needsHuman
        ) {
          return {
            page: activePage,
            hopCount: hop,
            urlsVisited,
            clicks,
            attempts,
            attemptedSelectors,
            ctaFound,
            signals,
            finalReason: signals.confirmationDetected
              ? "Confirmation detected after saved strategy apply selector."
              : signals.formDetected
                ? "Application form detected after saved strategy apply selector."
                : signals.needsHuman
                  ? "Verification or account creation requires human completion."
                  : "Saved strategy apply selector made page progress.",
            lastActionText,
            lastActionSelector,
          };
        }
      }
    }

    const snapshot = await collectUniversalCtaCandidates(activePage, {
      preferredTexts: args.preferredTexts,
      preferredSelectors: args.preferredSelectors,
    });
    const scanSelector = `universal_scan:${hop}:${CTA_SELECTOR}`;
    attemptedSelectors.push(scanSelector);

    const topCandidates = snapshot.candidates.slice(0, 8).map((candidate) => ({
      text: candidate.text,
      role: candidate.role,
      tagName: candidate.tagName,
      href: candidate.href ?? null,
      selector: candidate.selector,
      score: candidate.score,
      reason: candidate.reasons.join(", "),
    }));

    console.log("[AUTO_APPLY_UNIVERSAL_ACTION] candidates", {
      applicationId: args.applicationId ?? null,
      currentUrl: activePage.url(),
      title: await activePage.title().catch(() => null),
      candidateCount: snapshot.candidates.length,
      topCandidates,
    });

    if (snapshot.candidates.length === 0) {
      attempts.push({
        phase: "universal",
        action: "scan",
        selector: scanSelector,
        text: "no candidate found",
        matchedText: "",
        locatorStrategy: "universal_candidate_ranker",
        candidateFound: false,
        success: false,
        urlBefore: activePage.url(),
        applyCtaFoundAfter: false,
      } satisfies ApplySessionCtaAttemptRecord);

      const noCandidateSignals = await detectPageSignals(activePage);
      console.log("[AUTO_APPLY_UNIVERSAL_ACTION] no_candidates", {
        applicationId: args.applicationId ?? null,
        currentUrl: activePage.url(),
        title: await activePage.title().catch(() => null),
        visibleTexts: snapshot.visibleTexts,
        bodyPreview: snapshot.bodyPreview,
        formsFound: snapshot.formsFound,
        iframeCount: snapshot.iframeCount,
        shadowHostCount: snapshot.shadowHostCount,
        formDetected: noCandidateSignals.formDetected,
        verificationDetected: noCandidateSignals.needsHuman,
      });

      if (noCandidateSignals.formDetected || noCandidateSignals.confirmationDetected) {
        return {
          page: activePage,
          hopCount: hop - 1,
          urlsVisited,
          clicks,
          attempts,
          attemptedSelectors,
          ctaFound,
          signals: noCandidateSignals,
          finalReason: noCandidateSignals.confirmationDetected
            ? "Confirmation detected after universal scan."
            : "Application form detected after universal scan.",
          lastActionText,
          lastActionSelector,
        };
      }

      if (noCandidateSignals.needsHuman) {
        return {
          page: activePage,
          hopCount: hop - 1,
          urlsVisited,
          clicks,
          attempts,
          attemptedSelectors,
          ctaFound,
          signals: noCandidateSignals,
          finalReason:
            "Security verification or account gate requires manual completion before continuing.",
          lastActionText,
          lastActionSelector,
        };
      }

      return {
        page: activePage,
        hopCount: hop - 1,
        urlsVisited,
        clicks,
        attempts,
        attemptedSelectors,
        ctaFound,
        signals: noCandidateSignals,
        unavailable: true,
        finalReason:
          "No actionable apply, continue, or submit CTA was found on the loaded job/application page.",
        lastActionText,
        lastActionSelector,
      };
    }

    const candidate = snapshot.candidates[0];
    ctaFound = true;
    attempts.push({
      phase: "universal",
      action: "scan",
      selector: candidate.selector,
      text: candidate.text,
      matchedText: candidate.matchedText,
      locatorStrategy: "universal_candidate_ranker",
      candidateFound: true,
      success: true,
      urlBefore: activePage.url(),
      applyCtaFoundAfter: true,
    } satisfies ApplySessionCtaAttemptRecord);

    const result = await clickCandidateAndWaitForProgress({
      page: activePage,
      context: args.context,
      candidate,
      hop,
      onPageReady: args.onPageReady,
    });

    activePage = result.page;
    signals = result.signals;
    clicks.push(result.click);
    lastActionText = candidate.text;
    lastActionSelector = candidate.selector;

    attempts.push({
      phase: "universal",
      action: "click",
      selector: candidate.selector,
      text: candidate.text,
      matchedText: candidate.matchedText,
      locatorStrategy: "universal_candidate_ranker",
      candidateFound: true,
      success: result.progressed,
      urlBefore: result.click.fromUrl,
      urlAfter: result.click.toUrl,
      applyCtaFoundAfter: signals.formDetected || signals.confirmationDetected,
    } satisfies ApplySessionCtaAttemptRecord);

    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    console.log("[AUTO_APPLY_UNIVERSAL_ACTION] landed", {
      applicationId: args.applicationId ?? null,
      hop,
      url: activePage.url(),
      formDetected: signals.formDetected,
      confirmationDetected: signals.confirmationDetected,
      verificationDetected: signals.needsHuman,
      progressed: result.progressed,
    });

    if (signals.confirmationDetected || signals.formDetected || signals.needsHuman) {
      return {
        page: activePage,
        hopCount: hop,
        urlsVisited,
        clicks,
        attempts,
        attemptedSelectors,
        ctaFound,
        signals,
        finalReason: signals.confirmationDetected
          ? "Confirmation detected after universal action loop."
          : signals.formDetected
            ? "Application form detected after universal action loop."
            : "Verification or account creation requires human completion.",
        lastActionText,
        lastActionSelector,
      };
    }

    if (result.progressed) {
      noProgressAttempts = 0;
      continue;
    }

    noProgressAttempts += 1;
    if (noProgressAttempts >= MAX_NO_PROGRESS_ATTEMPTS) {
      return {
        page: activePage,
        hopCount: hop,
        urlsVisited,
        clicks,
        attempts,
        attemptedSelectors,
        ctaFound,
        signals,
        unavailable: true,
        finalReason:
          "The universal apply action loop clicked visible candidates but the page did not make safe progress.",
        lastActionText,
        lastActionSelector,
      };
    }
  }

  return {
    page: activePage,
    hopCount: MAX_CTA_HOPS,
    urlsVisited,
    clicks,
    attempts,
    attemptedSelectors,
    ctaFound,
    signals,
    unavailable: true,
    finalReason:
      "The universal apply action loop reached the hop limit before a form, confirmation, or blocker was found.",
    lastActionText,
    lastActionSelector,
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
  applicationId?: string | null;
  preferredTexts?: string[];
  preferredSelectors?: string[];
}): Promise<CtaChaseResult> {
  return runUniversalApplyActionLoop(args);
}
