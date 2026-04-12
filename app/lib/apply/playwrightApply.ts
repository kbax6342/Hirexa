import { chromium, type BrowserContext, type Page } from "playwright-core";
import {
  closeRemoteSession,
  createRemoteSession,
  shouldUseRemoteBrowser,
} from "@/app/lib/apply/remoteBrowser";
import {
  findMatchingLocator,
  extractLocatorText,
} from "@/app/lib/apply/formFieldLocators";
import {
  chaseApplyPath,
  type CtaChaseResult,
} from "@/app/lib/apply/playwrightCrawl";
import {
  detectPageSignals,
  waitForDomAndSettle,
} from "@/app/lib/apply/playwrightSignals";
import {
  deriveStopClassification,
  type ApplyStopClassification,
} from "@/app/lib/apply/stopClassification";
import type {
  ApplySessionClickRecord,
  ApplySessionDebug,
} from "@/app/lib/apply/applySessionStore";
import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";

export type PlaywrightApplyResult = {
  ok: boolean;
  status: ApplySessionStatus;
  finalUrl?: string;
  needsHuman?: boolean;
  unavailable?: boolean;
  openUrl?: string;
  viewerUrl?: string;
  message?: string;
  debug?: {
    attemptedSelectors: string[];
    missingNames: string[];
    finalUrl?: string;
    submitSelectorUsed?: string | null;
    verificationSignals: string[];
    confirmationSignals: string[];
    pageText?: string;
    pageHtml?: string;
    sessionId?: string;
    viewerUrl?: string;
    targetUrl?: string;
    applyCtaFound: boolean;
    applyCtaClicked: boolean;
    urlBeforeClick?: string;
    urlAfterClick?: string;
    currentUrl?: string;
    submitButtonFound: boolean;
    submitButtonClicked: boolean;
    confirmationTextFound: boolean;
    confirmationTextSnippet?: string | null;
    successUrlPatternMatched: boolean;
    submissionConfirmed: boolean;
    finalStatus: ApplySessionStatus;
    success: boolean;
    needsHuman: boolean;
    unavailable: boolean;
    hopCount: number;
    urlsVisited: string[];
    clicks: ApplySessionClickRecord[];
    formDetected: boolean;
    confirmationDetected: boolean;
    verificationDetected: boolean;
    finalReason?: string;
    stopClassification?: ApplyStopClassification;
    resolverAttemptedLinks?: string[];
    resolverSelectedLink?: string;
    resolverSuccess?: boolean;
    resolverNewUrl?: string;
  };
};

type AnswerValue = string | string[];
type ApplyStatusUpdate = {
  status: ApplySessionStatus;
  lastUrl?: string;
  error?: string;
  message?: string;
  viewerUrl?: string;
  openUrl?: string;
  remoteSessionId?: string;
};

function asArray(value: AnswerValue) {
  return Array.isArray(value)
    ? value.map((item) => String(item))
    : [String(value ?? "")];
}

function parseBooleanEnv(value: string | undefined) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return null;
}

function resolveLocalHeadless(mode: "AUTO" | "HUMAN_ASSIST" | undefined) {
  const requested = parseBooleanEnv(process.env.PLAYWRIGHT_HEADLESS);

  if (requested === false && process.env.NODE_ENV === "production") {
    console.warn(
      "[AUTO_APPLY_PLAYWRIGHT] ignoring PLAYWRIGHT_HEADLESS=false in production; forcing headless mode",
    );
    return true;
  }

  if (requested !== null) {
    return requested;
  }

  return mode === "HUMAN_ASSIST" ? false : true;
}

function shouldUseCdp(connectUrl: string) {
  return connectUrl.startsWith("http://") || connectUrl.startsWith("https://");
}

type PlaywrightEvidence = {
  attemptedSelectors: string[];
  applyCtaFound: boolean;
  applyCtaClicked: boolean;
  urlBeforeClick?: string;
  urlAfterClick?: string;
  currentUrl: string;
  hopCount: number;
  submitButtonFound: boolean;
  submitButtonClicked: boolean;
  confirmationTextFound: boolean;
  confirmationTextSnippet?: string | null;
  successUrlPatternMatched: boolean;
  finalStatus: ApplySessionStatus;
  submissionConfirmed: boolean;
};

type ApplySourceCandidate = {
  href: string;
  score: number;
};

type ApplySourceResolverResult = {
  attemptedLinks: string[];
  selectedLink?: string;
  success: boolean;
  newUrl?: string;
};

const APPLY_SOURCE_RESOLVER_KEYWORDS = [
  "apply",
  "job",
  "jobs",
  "career",
  "careers",
  "external",
] as const;

function buildDebugPayload(args: {
  attemptedSelectors: string[];
  missingNames: string[];
  finalUrl?: string;
  submitSelectorUsed?: string | null;
  verificationSignals?: string[];
  confirmationSignals?: string[];
  pageText?: string;
  pageHtml?: string;
  sessionId?: string;
  viewerUrl?: string;
  targetUrl?: string;
  applyCtaFound: boolean;
  applyCtaClicked: boolean;
  urlBeforeClick?: string;
  urlAfterClick?: string;
  currentUrl?: string;
  submitButtonFound: boolean;
  submitButtonClicked: boolean;
  confirmationTextFound: boolean;
  confirmationTextSnippet?: string | null;
  successUrlPatternMatched: boolean;
  submissionConfirmed: boolean;
  finalStatus: ApplySessionStatus;
  success: boolean;
  needsHuman: boolean;
  unavailable: boolean;
  hopCount: number;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  formDetected: boolean;
  confirmationDetected: boolean;
  verificationDetected: boolean;
  finalReason?: string;
  stopClassification?: ApplyStopClassification;
  resolverAttemptedLinks?: string[];
  resolverSelectedLink?: string;
  resolverSuccess?: boolean;
  resolverNewUrl?: string;
}) {
  return {
    attemptedSelectors: args.attemptedSelectors,
    missingNames: args.missingNames,
    finalUrl: args.finalUrl,
    submitSelectorUsed: args.submitSelectorUsed ?? null,
    verificationSignals: args.verificationSignals ?? [],
    confirmationSignals: args.confirmationSignals ?? [],
    pageText: args.pageText,
    pageHtml: args.pageHtml,
    sessionId: args.sessionId,
    viewerUrl: args.viewerUrl,
    targetUrl: args.targetUrl,
    applyCtaFound: args.applyCtaFound,
    applyCtaClicked: args.applyCtaClicked,
    urlBeforeClick: args.urlBeforeClick,
    urlAfterClick: args.urlAfterClick,
    currentUrl: args.currentUrl,
    submitButtonFound: args.submitButtonFound,
    submitButtonClicked: args.submitButtonClicked,
    confirmationTextFound: args.confirmationTextFound,
    confirmationTextSnippet: args.confirmationTextSnippet ?? null,
    successUrlPatternMatched: args.successUrlPatternMatched,
    submissionConfirmed: args.submissionConfirmed,
    finalStatus: args.finalStatus,
    success: args.success,
    needsHuman: args.needsHuman,
    unavailable: args.unavailable,
    hopCount: args.hopCount,
    urlsVisited: args.urlsVisited,
    clicks: args.clicks,
    formDetected: args.formDetected,
    confirmationDetected: args.confirmationDetected,
    verificationDetected: args.verificationDetected,
    finalReason: args.finalReason,
    stopClassification: args.stopClassification,
    resolverAttemptedLinks: args.resolverAttemptedLinks ?? [],
    resolverSelectedLink: args.resolverSelectedLink,
    resolverSuccess: args.resolverSuccess,
    resolverNewUrl: args.resolverNewUrl,
  };
}

function buildCtaEvidence(chase: CtaChaseResult, currentUrl: string) {
  return {
    applyCtaFound: chase.clicks.length > 0,
    applyCtaClicked: chase.clicks.length > 0,
    urlBeforeClick: chase.clicks[0]?.fromUrl,
    urlAfterClick: chase.clicks.at(-1)?.toUrl ?? currentUrl,
    currentUrl,
    hopCount: chase.hopCount,
  };
}

function isNoInteractionOnTarget(args: {
  applyCtaClicked: boolean;
  hopCount: number;
  currentUrl: string;
  targetUrl: string;
}) {
  return (
    !args.applyCtaClicked &&
    args.hopCount === 0 &&
    args.currentUrl === args.targetUrl
  );
}

function resolveSubmissionConfirmed(args: {
  confirmationTextFound: boolean;
  successUrlPatternMatched: boolean;
  submitButtonClicked: boolean;
  applyCtaClicked: boolean;
  hopCount: number;
  currentUrl: string;
  targetUrl: string;
}) {
  if (
    !args.submitButtonClicked &&
    isNoInteractionOnTarget({
      applyCtaClicked: args.applyCtaClicked,
      hopCount: args.hopCount,
      currentUrl: args.currentUrl,
      targetUrl: args.targetUrl,
    })
  ) {
    return false;
  }

  if (args.confirmationTextFound) {
    return true;
  }

  if (args.submitButtonClicked && args.successUrlPatternMatched) {
    return true;
  }

  return false;
}

function logPlaywrightEvidence(evidence: PlaywrightEvidence) {
  console.log("[AUTO_APPLY_PLAYWRIGHT] evidence", evidence);
}

function parseHostname(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function dedupeUrls(urls: string[]) {
  return [...new Set(urls.filter((url) => Boolean(url)))];
}

async function collectApplySourceCandidates(
  page: Page,
): Promise<ApplySourceCandidate[]> {
  const currentUrl = page.url();
  const currentHostname = parseHostname(currentUrl);

  return page
    .locator("a")
    .evaluateAll(
      (anchors, args) => {
        const results: ApplySourceCandidate[] = [];
        const seen = new Set<string>();

        for (const anchor of anchors) {
          if (!(anchor instanceof HTMLAnchorElement)) continue;

          const rawHref = anchor.getAttribute("href")?.trim();
          if (!rawHref) continue;

          let absoluteHref = "";
          let hostname = "";

          try {
            absoluteHref = new URL(rawHref, args.currentUrl).toString();
            hostname = new URL(absoluteHref).hostname.toLowerCase();
          } catch {
            continue;
          }

          if (!hostname || hostname === args.currentHostname) continue;
          if (seen.has(absoluteHref)) continue;

          const signalText = [
            absoluteHref,
            anchor.textContent ?? "",
            anchor.getAttribute("aria-label") ?? "",
            anchor.getAttribute("title") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

          let score = 0;
          for (const keyword of args.keywords) {
            if (!signalText.includes(keyword)) continue;

            if (keyword === "apply") {
              score += 50;
            } else if (keyword === "career" || keyword === "careers") {
              score += 20;
            } else if (keyword === "external") {
              score += 15;
            } else {
              score += 10;
            }
          }

          if (score === 0) continue;

          seen.add(absoluteHref);
          results.push({
            href: absoluteHref,
            score,
          });
        }

        results.sort((left, right) => right.score - left.score);
        return results.slice(0, 10);
      },
      {
        currentUrl,
        currentHostname,
        keywords: [...APPLY_SOURCE_RESOLVER_KEYWORDS],
      },
    )
    .catch(() => []);
}

async function resolveApplySourceFromAggregatorPage(
  page: Page,
): Promise<ApplySourceResolverResult> {
  const candidates = await collectApplySourceCandidates(page);
  const attemptedLinks = candidates.map((candidate) => candidate.href);
  const selectedLink = attemptedLinks[0];

  if (!selectedLink) {
    const result = {
      attemptedLinks,
      success: false,
      newUrl: page.url(),
    } satisfies ApplySourceResolverResult;

    console.log("[AUTO_APPLY_RESOLVER]", result);
    return result;
  }

  try {
    await page.goto(selectedLink, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(page);

    const result = {
      attemptedLinks,
      selectedLink,
      success: true,
      newUrl: page.url(),
    } satisfies ApplySourceResolverResult;

    console.log("[AUTO_APPLY_RESOLVER]", result);
    return result;
  } catch {
    const result = {
      attemptedLinks,
      selectedLink,
      success: false,
      newUrl: page.url(),
    } satisfies ApplySourceResolverResult;

    console.log("[AUTO_APPLY_RESOLVER]", result);
    return result;
  }
}

function mergeChaseResults(args: {
  initial: CtaChaseResult;
  resolved: CtaChaseResult;
  resolverUrl?: string;
}): CtaChaseResult {
  const mergedUrlsVisited = dedupeUrls([
    ...args.initial.urlsVisited,
    args.resolverUrl ?? "",
    ...args.resolved.urlsVisited,
  ]);
  const hopCount =
    args.initial.hopCount +
    (args.resolverUrl ? 1 : 0) +
    args.resolved.hopCount;
  const clicks = [...args.initial.clicks, ...args.resolved.clicks];
  const finalReason = args.resolved.finalReason ?? args.initial.finalReason;

  if ("unavailable" in args.resolved && args.resolved.unavailable) {
    return {
      ...args.resolved,
      hopCount,
      urlsVisited: mergedUrlsVisited,
      clicks,
      finalReason,
    };
  }

  return {
    ...args.resolved,
    hopCount,
    urlsVisited: mergedUrlsVisited,
    clicks,
    finalReason,
  };
}

export async function applyWithPlaywright(args: {
  jobUrl: string;
  form?: {
    embedUrl?: string;
  };
  values: Record<string, string | string[]>;
  resumePath?: string | null;
  mode?: "AUTO" | "HUMAN_ASSIST";
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
  onStatus?: (update: ApplyStatusUpdate) => Promise<void> | void;
}): Promise<PlaywrightApplyResult> {
  let browser;
  let context: BrowserContext | undefined;
  let remoteSession: Awaited<ReturnType<typeof createRemoteSession>> | null =
    null;
  let keepBrowserOpen = false;
  let headless: boolean | null = null;

  const attemptedSelectors: string[] = [];
  const missingNames: string[] = [];
  const targetUrl = args.form?.embedUrl ?? args.jobUrl;
  let currentUrl = targetUrl;
  let resolverAttemptedLinks: string[] = [];
  let resolverSelectedLink: string | undefined;
  let resolverSuccess: boolean | undefined;
  let resolverNewUrl: string | undefined;

  const captureCurrentUrl = (pageOrUrl?: Page | string | null) => {
    if (typeof pageOrUrl === "string") {
      currentUrl = pageOrUrl;
      return currentUrl;
    }

    if (pageOrUrl) {
      currentUrl = pageOrUrl.url();
    }

    return currentUrl;
  };

  try {
    await args.onStatus?.({
      status: "STARTING",
      openUrl: targetUrl,
    });

    if (shouldUseRemoteBrowser()) {
      remoteSession = await createRemoteSession();
      const useCdp = shouldUseCdp(remoteSession.connectUrl);
      browser = useCdp
        ? await chromium.connectOverCDP(remoteSession.connectUrl)
        : await chromium.connect(remoteSession.connectUrl);
      console.log("[AUTO_APPLY_REMOTE] connected to remote browser", {
        provider: remoteSession.provider,
        sessionId: remoteSession.sessionId,
      });
    } else {
      headless = resolveLocalHeadless(args.mode);
      browser = await chromium.launch({
        headless,
      });
    }

    console.log("[AUTO_APPLY_PLAYWRIGHT] browser ready", {
      targetUrl,
      mode: args.mode ?? "AUTO",
      usingRemoteBrowser: Boolean(remoteSession),
      remoteProvider: remoteSession?.provider ?? null,
      headless: remoteSession ? true : headless,
      requestedHeadless: process.env.PLAYWRIGHT_HEADLESS ?? null,
    });

    context = await browser.newContext();
    let page = await context.newPage();
    await args.onPageReady?.(page, context);

    console.log("[AUTO_APPLY_PLAYWRIGHT] navigating", { targetUrl });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(page);
    captureCurrentUrl(page);

    let chase: CtaChaseResult = await chaseApplyPath({
      page,
      context,
      onPageReady: args.onPageReady,
      onStatus: args.onStatus,
      viewerUrl: remoteSession?.viewerUrl,
      remoteSessionId: remoteSession?.sessionId,
      openUrl: targetUrl,
    });

    page = chase.page;
    captureCurrentUrl(page);
    let chaseEvidence = buildCtaEvidence(chase, page.url());
    const initialStopClassification = deriveStopClassification({
      targetUrl,
      finalUrl: page.url(),
      currentUrl: page.url(),
      applyCtaFound: chaseEvidence.applyCtaFound,
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      hopCount: chaseEvidence.hopCount,
      confirmationTextFound: chase.signals.confirmationTextFound,
      verificationSignals: [
        ...chase.signals.verificationSignals,
        ...chase.signals.accountSignals,
      ],
      pageText: chase.signals.pageText,
      finalReason: chase.finalReason,
      formDetected: chase.signals.formDetected,
    });

    if (
      initialStopClassification.reason === "aggregator_no_cta" &&
      !chaseEvidence.applyCtaFound
    ) {
      const resolverResult = await resolveApplySourceFromAggregatorPage(page);
      resolverAttemptedLinks = resolverResult.attemptedLinks;
      resolverSelectedLink = resolverResult.selectedLink;
      resolverSuccess = resolverResult.success;
      resolverNewUrl = resolverResult.newUrl;

      if (resolverResult.success) {
        captureCurrentUrl(page);

        const resolvedChase = await chaseApplyPath({
          page,
          context,
          onPageReady: args.onPageReady,
          onStatus: args.onStatus,
          viewerUrl: remoteSession?.viewerUrl,
          remoteSessionId: remoteSession?.sessionId,
          openUrl: resolverResult.newUrl ?? resolverResult.selectedLink,
        });

        page = resolvedChase.page;
        captureCurrentUrl(page);
        chase = mergeChaseResults({
          initial: chase,
          resolved: resolvedChase,
          resolverUrl: resolverResult.newUrl ?? resolverResult.selectedLink,
        });
        chaseEvidence = buildCtaEvidence(chase, page.url());
      }
    }

    const landedWithoutStarting = isNoInteractionOnTarget({
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      hopCount: chaseEvidence.hopCount,
      currentUrl: chaseEvidence.currentUrl,
      targetUrl,
    });

    console.log("[AUTO_APPLY_PLAYWRIGHT] CTA chase result", {
      targetUrl,
      applyCtaFound: chaseEvidence.applyCtaFound,
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      urlBeforeClick: chaseEvidence.urlBeforeClick ?? null,
      urlAfterClick: chaseEvidence.urlAfterClick ?? null,
      currentUrl: chaseEvidence.currentUrl,
      hopCount: chaseEvidence.hopCount,
      confirmationTextFound: chase.signals.confirmationTextFound,
      confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
      successUrlPatternMatched: chase.signals.successUrlPatternMatched,
    });

    if (chase.signals.confirmationDetected) {
      const finalUrl = page.url();
      const submissionConfirmed = resolveSubmissionConfirmed({
        confirmationTextFound: chase.signals.confirmationTextFound,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        submitButtonClicked: false,
        applyCtaClicked: chaseEvidence.applyCtaClicked,
        hopCount: chaseEvidence.hopCount,
        currentUrl: finalUrl,
        targetUrl,
      });
      const finalStatus = submissionConfirmed ? "SUBMITTED" : "APPLY_NOT_STARTED";

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus,
        submissionConfirmed,
      });

      if (!submissionConfirmed) {
        const message = landedWithoutStarting
          ? "Opened job page but could not start application."
          : "Application submission not confirmed.";

        await args.onStatus?.({
          status: finalStatus,
          lastUrl: finalUrl,
          error: message,
          message,
          viewerUrl: remoteSession?.viewerUrl,
          openUrl: finalUrl,
          remoteSessionId: remoteSession?.sessionId,
        });

        return {
          ok: false,
          status: finalStatus,
          finalUrl,
          openUrl: finalUrl,
          viewerUrl: remoteSession?.viewerUrl,
          message,
          debug: buildDebugPayload({
            attemptedSelectors,
            missingNames,
            finalUrl,
            verificationSignals: chase.signals.verificationSignals,
            confirmationSignals: chase.signals.confirmationSignals,
            pageText: chase.signals.pageText,
            pageHtml: chase.signals.html,
            sessionId: remoteSession?.sessionId,
            viewerUrl: remoteSession?.viewerUrl,
            targetUrl,
            ...chaseEvidence,
            submitButtonFound: false,
            submitButtonClicked: false,
            confirmationTextFound: chase.signals.confirmationTextFound,
            confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
            successUrlPatternMatched: chase.signals.successUrlPatternMatched,
            submissionConfirmed,
            finalStatus,
            success: false,
            needsHuman: false,
            unavailable: landedWithoutStarting,
            hopCount: chase.hopCount,
            urlsVisited: chase.urlsVisited,
            clicks: chase.clicks,
            formDetected: chase.signals.formDetected,
            confirmationDetected: chase.signals.confirmationDetected,
            verificationDetected: chase.signals.needsHuman,
            finalReason:
              chase.finalReason ??
              "Confirmation-like content was detected without any confirmed application action.",
            resolverAttemptedLinks,
            resolverSelectedLink,
            resolverSuccess,
            resolverNewUrl,
          }),
        };
      }

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus,
        submissionConfirmed,
      });

      return {
        ok: true,
        status: finalStatus,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          finalUrl,
          verificationSignals: chase.signals.verificationSignals,
          confirmationSignals: chase.signals.confirmationSignals,
          pageText: chase.signals.pageText,
          pageHtml: chase.signals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: chase.signals.confirmationTextFound,
          confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: chase.signals.successUrlPatternMatched,
          submissionConfirmed,
          finalStatus,
          success: true,
          needsHuman: false,
          unavailable: false,
          hopCount: chase.hopCount,
          urlsVisited: chase.urlsVisited,
          clicks: chase.clicks,
          formDetected: chase.signals.formDetected,
          confirmationDetected: true,
          verificationDetected: chase.signals.needsHuman,
          finalReason: chase.finalReason,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if (chase.signals.needsHuman) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const message = chase.signals.accountSignals.length
        ? "Account creation or verification needs human completion."
        : "Human verification required";

      await args.onStatus?.({
        status: "WAITING_HUMAN",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus: "WAITING_HUMAN",
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: "WAITING_HUMAN",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          finalUrl,
          verificationSignals: [
            ...chase.signals.verificationSignals,
            ...chase.signals.accountSignals,
          ],
          confirmationSignals: chase.signals.confirmationSignals,
          pageText: chase.signals.pageText,
          pageHtml: chase.signals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: chase.signals.confirmationTextFound,
          confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: chase.signals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus: "WAITING_HUMAN",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chase.hopCount,
          urlsVisited: chase.urlsVisited,
          clicks: chase.clicks,
          formDetected: chase.signals.formDetected,
          confirmationDetected: chase.signals.confirmationDetected,
          verificationDetected: true,
          finalReason: chase.finalReason,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if ("unavailable" in chase && chase.unavailable) {
      const finalUrl = page.url();
      const finalStatus = landedWithoutStarting
        ? "APPLY_NOT_STARTED"
        : "AUTO_APPLY_UNAVAILABLE";
      const message = landedWithoutStarting
        ? "Opened job page but could not start application."
        : "Auto apply is not available for this job application because no usable apply path was found.";

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: finalStatus,
        unavailable: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          finalUrl,
          verificationSignals: chase.signals.verificationSignals,
          confirmationSignals: chase.signals.confirmationSignals,
          pageText: chase.signals.pageText,
          pageHtml: chase.signals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: chase.signals.confirmationTextFound,
          confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: chase.signals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus,
          success: false,
          needsHuman: false,
          unavailable: true,
          hopCount: chase.hopCount,
          urlsVisited: chase.urlsVisited,
          clicks: chase.clicks,
          formDetected: chase.signals.formDetected,
          confirmationDetected: chase.signals.confirmationDetected,
          verificationDetected: chase.signals.needsHuman,
          finalReason: chase.finalReason,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    console.log("[AUTO_APPLY_PLAYWRIGHT] resume availability", {
      targetUrl,
      hasResumePath: Boolean(args.resumePath),
    });

    await args.onStatus?.({
      status: "OPENING_FORM",
      lastUrl: captureCurrentUrl(page),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: currentUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    await page.waitForSelector("input, textarea, select", {
      timeout: 15_000,
    });

    await args.onStatus?.({
      status: "FILLING_FORM",
      lastUrl: captureCurrentUrl(page),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: currentUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    for (const [name, rawValue] of Object.entries(args.values)) {
      const locator = await findMatchingLocator(page, name, attemptedSelectors);
      if (!locator) {
        missingNames.push(name);
        continue;
      }

      const first = locator.first();
      const tagName = await first
        .evaluate((el) => el.tagName.toLowerCase())
        .catch(() => "");
      const inputType =
        tagName === "input"
          ? await first
              .evaluate(
                (el) => (el as HTMLInputElement).type?.toLowerCase() || "text",
              )
              .catch(() => "text")
          : "";
      const count = await locator.count();

      if (tagName === "select") {
        const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
        await first.selectOption({ value: String(value) }).catch(async () => {
          await first.selectOption({ label: String(value) });
        });
        continue;
      }

      if (inputType === "checkbox") {
        const values = asArray(rawValue);
        for (let i = 0; i < count; i += 1) {
          const checkbox = locator.nth(i);
          const elementValue = await checkbox.getAttribute("value");
          const labelText = (await extractLocatorText(checkbox)).toLowerCase().trim();

          const shouldCheck = values.some((target) => {
            const normalized = target.toLowerCase().trim();
            if (elementValue && elementValue.toLowerCase() === normalized)
              return true;
            return Boolean(labelText) && labelText.includes(normalized);
          });

          if (shouldCheck) {
            await checkbox.check().catch(() => undefined);
          }
        }
        continue;
      }

      if (inputType === "radio") {
        const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
        for (let i = 0; i < count; i += 1) {
          const option = locator.nth(i);
          const optionValue = await option.getAttribute("value");
          const optionText = (await extractLocatorText(option)).toLowerCase().trim();
          const normalizedValue = String(value).toLowerCase().trim();

          if (
            optionValue?.toLowerCase() === normalizedValue ||
            optionText.includes(normalizedValue)
          ) {
            await option.check().catch(() => option.click().catch(() => undefined));
            break;
          }
        }
        continue;
      }

      if (inputType === "file") {
        if (args.resumePath) {
          await first.setInputFiles(args.resumePath);
        }
        continue;
      }

      const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
      await first.fill(String(value ?? ""));
    }

    if (args.resumePath) {
      const fileInput = page.locator('input[type="file"]:visible').first();
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles(args.resumePath);
        console.log("[AUTO_APPLY_CRAWL] resume uploaded", args.resumePath);
      }
    }

    const preSubmitSignals = await detectPageSignals(page);
    if (preSubmitSignals.needsHuman) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const message = preSubmitSignals.accountSignals.length
        ? "Account creation or verification needs human completion."
        : "Human verification required";

      await args.onStatus?.({
        status: "WAITING_HUMAN",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        currentUrl: finalUrl,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: preSubmitSignals.confirmationTextFound,
        confirmationTextSnippet: preSubmitSignals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: preSubmitSignals.successUrlPatternMatched,
        finalStatus: "WAITING_HUMAN",
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: "WAITING_HUMAN",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          finalUrl,
          verificationSignals: [
            ...preSubmitSignals.verificationSignals,
            ...preSubmitSignals.accountSignals,
          ],
          confirmationSignals: preSubmitSignals.confirmationSignals,
          pageText: preSubmitSignals.pageText,
          pageHtml: preSubmitSignals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: preSubmitSignals.confirmationTextFound,
          confirmationTextSnippet: preSubmitSignals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: preSubmitSignals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus: "WAITING_HUMAN",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chase.hopCount,
          urlsVisited: chase.urlsVisited,
          clicks: chase.clicks,
          formDetected: true,
          confirmationDetected: preSubmitSignals.confirmationDetected,
          verificationDetected: true,
          finalReason: "Verification detected before submission.",
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    await args.onStatus?.({
      status: "SUBMITTING",
      lastUrl: captureCurrentUrl(page),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: currentUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit application")',
      'button:has-text("Submit Application")',
      'button:has-text("Submit")',
      'button:has-text("Apply")',
    ];

    let submitUsed: string | null = null;
    let submitButtonFound = false;
    let submitButtonClicked = false;
    for (const submitSelector of submitSelectors) {
      const button = page.locator(submitSelector).first();
      if ((await button.count()) === 0) continue;
      if (!(await button.isVisible().catch(() => false))) continue;
      if (!(await button.isEnabled().catch(() => false))) continue;

      submitButtonFound = true;
      submitUsed = submitSelector;
      console.log("[AUTO_APPLY_CRAWL] clicking submit", submitSelector);
      await Promise.all([
        page
          .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 })
          .catch(() => null),
        button.click(),
      ]);
      submitButtonClicked = true;
      break;
    }

    if (!submitUsed) {
      const finalUrl = page.url();
      const finalStatus = "UNCONFIRMED";
      const message = "Opened application form but could not find a submit button.";

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        error: message,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        currentUrl: finalUrl,
        submitButtonFound,
        submitButtonClicked,
        confirmationTextFound: false,
        confirmationTextSnippet: null,
        successUrlPatternMatched: false,
        finalStatus,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: finalStatus,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          finalUrl,
          pageHtml: await page.content().catch(() => ""),
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          submitButtonFound,
          submitButtonClicked,
          confirmationTextFound: false,
          confirmationTextSnippet: null,
          successUrlPatternMatched: false,
          submissionConfirmed: false,
          finalStatus,
          success: false,
          needsHuman: false,
          unavailable: false,
          hopCount: chase.hopCount,
          urlsVisited: chase.urlsVisited,
          clicks: chase.clicks,
          formDetected: true,
          confirmationDetected: false,
          verificationDetected: false,
          finalReason: message,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    await args.onStatus?.({
      status: "WAITING_CONFIRMATION",
      lastUrl: captureCurrentUrl(page),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: currentUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    await waitForDomAndSettle(page);
    const finalUrl = captureCurrentUrl(page);
    const finalSignals = await detectPageSignals(page);
    const success = resolveSubmissionConfirmed({
      confirmationTextFound: finalSignals.confirmationTextFound,
      successUrlPatternMatched: finalSignals.successUrlPatternMatched,
      submitButtonClicked,
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      hopCount: chaseEvidence.hopCount,
      currentUrl: finalUrl,
      targetUrl,
    });
    const finalStatus = success ? "SUBMITTED" : "UNCONFIRMED";

    logPlaywrightEvidence({
      attemptedSelectors,
      ...chaseEvidence,
      currentUrl: finalUrl,
      submitButtonFound,
      submitButtonClicked,
      confirmationTextFound: finalSignals.confirmationTextFound,
      confirmationTextSnippet: finalSignals.confirmationTextSnippet ?? null,
      successUrlPatternMatched: finalSignals.successUrlPatternMatched,
      finalStatus,
      submissionConfirmed: success,
    });

    if (finalSignals.needsHuman) {
      keepBrowserOpen = true;
      const message = finalSignals.accountSignals.length
        ? "Account creation or verification needs human completion."
        : "Human verification required";

      await args.onStatus?.({
        status: "WAITING_HUMAN",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      return {
        ok: false,
        status: "WAITING_HUMAN",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          finalUrl,
          submitSelectorUsed: submitUsed,
          verificationSignals: [
            ...finalSignals.verificationSignals,
            ...finalSignals.accountSignals,
          ],
          confirmationSignals: finalSignals.confirmationSignals,
          pageText: finalSignals.pageText,
          pageHtml: finalSignals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          submitButtonFound,
          submitButtonClicked,
          confirmationTextFound: finalSignals.confirmationTextFound,
          confirmationTextSnippet: finalSignals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: finalSignals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus: "WAITING_HUMAN",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chase.hopCount,
          urlsVisited: [...chase.urlsVisited, finalUrl],
          clicks: chase.clicks,
          formDetected: true,
          confirmationDetected: success,
          verificationDetected: true,
          finalReason: "Verification detected after submit.",
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    await args.onStatus?.({
      status: finalStatus,
      lastUrl: finalUrl,
      error: success ? undefined : "Application submission not confirmed.",
      message: success ? undefined : "Application submission not confirmed.",
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: finalUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    return {
      ok: success,
      status: finalStatus,
      finalUrl,
      openUrl: finalUrl,
      viewerUrl: remoteSession?.viewerUrl,
      message: success ? undefined : "Application submission not confirmed.",
      debug: buildDebugPayload({
        attemptedSelectors,
        missingNames,
        finalUrl,
        submitSelectorUsed: submitUsed,
        verificationSignals: finalSignals.verificationSignals,
        confirmationSignals: finalSignals.confirmationSignals,
        pageText: finalSignals.pageText,
        pageHtml: finalSignals.html,
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        targetUrl,
        ...chaseEvidence,
        currentUrl: finalUrl,
        submitButtonFound,
        submitButtonClicked,
        confirmationTextFound: finalSignals.confirmationTextFound,
        confirmationTextSnippet: finalSignals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: finalSignals.successUrlPatternMatched,
        submissionConfirmed: success,
        finalStatus,
        success,
        needsHuman: false,
        unavailable: false,
        hopCount: chase.hopCount,
        urlsVisited: [...chase.urlsVisited, finalUrl],
        clicks: chase.clicks,
        formDetected: true,
        confirmationDetected: success,
        verificationDetected: false,
        finalReason: success
          ? "Submission confirmed."
          : "Application submission not confirmed.",
        resolverAttemptedLinks,
        resolverSelectedLink,
        resolverSuccess,
        resolverNewUrl,
      }),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Playwright submit failed.";
    const finalUrl = captureCurrentUrl();
    console.log("[AUTO_APPLY_CRAWL] error", message);

    await args.onStatus?.({
      status: "FAILED",
      lastUrl: finalUrl,
      error: message,
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: finalUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    logPlaywrightEvidence({
      attemptedSelectors,
      applyCtaFound: false,
      applyCtaClicked: false,
      currentUrl: finalUrl,
      hopCount: 0,
      submitButtonFound: false,
      submitButtonClicked: false,
      confirmationTextFound: false,
      confirmationTextSnippet: null,
      successUrlPatternMatched: false,
      finalStatus: "FAILED",
      submissionConfirmed: false,
    });

    return {
      ok: false,
      status: "FAILED",
      finalUrl,
      message,
      openUrl: finalUrl,
      viewerUrl: remoteSession?.viewerUrl,
      debug: buildDebugPayload({
        attemptedSelectors,
        missingNames,
        finalUrl,
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        targetUrl,
        applyCtaFound: false,
        applyCtaClicked: false,
        currentUrl: finalUrl,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: false,
        confirmationTextSnippet: null,
        successUrlPatternMatched: false,
        submissionConfirmed: false,
        finalStatus: "FAILED",
        success: false,
        needsHuman: false,
        unavailable: false,
        hopCount: 0,
        urlsVisited: [],
        clicks: [],
        formDetected: false,
        confirmationDetected: false,
        verificationDetected: false,
        finalReason: message,
        resolverAttemptedLinks,
        resolverSelectedLink,
        resolverSuccess,
        resolverNewUrl,
      }),
    };
  } finally {
    if (!keepBrowserOpen) {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }

    if (remoteSession && !keepBrowserOpen) {
      await closeRemoteSession(
        remoteSession.provider,
        remoteSession.sessionId,
      ).catch(() => undefined);
    }
  }
}

export function toApplySessionDebug(
  result: PlaywrightApplyResult["debug"] | undefined,
): ApplySessionDebug | undefined {
  if (!result) return undefined;

  return {
    finalUrl: result.finalUrl,
    hopCount: result.hopCount,
    urlsVisited: result.urlsVisited,
    clicks: result.clicks,
    attemptedSelectors: result.attemptedSelectors,
    applyCtaFound: result.applyCtaFound,
    applyCtaClicked: result.applyCtaClicked,
    targetUrl: result.targetUrl,
    urlBeforeClick: result.urlBeforeClick,
    urlAfterClick: result.urlAfterClick,
    currentUrl: result.currentUrl,
    formDetected: result.formDetected,
    submitButtonFound: result.submitButtonFound,
    submitButtonClicked: result.submitButtonClicked,
    confirmationDetected: result.confirmationDetected,
    confirmationTextFound: result.confirmationTextFound,
    confirmationTextSnippet: result.confirmationTextSnippet ?? null,
    successUrlPatternMatched: result.successUrlPatternMatched,
    verificationDetected: result.verificationDetected,
    submissionConfirmed: result.submissionConfirmed,
    stopClassification: result.stopClassification,
    finalReason: result.finalReason,
  };
}
