import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";
import {
  closeRemoteSession,
  createRemoteSession,
  shouldUseRemoteBrowser,
} from "@/app/lib/apply/remoteBrowser";
import {
  findMatchingLocator,
  extractLocatorText,
} from "@/app/lib/apply/formFieldLocators";
import { cssEscape } from "@/app/lib/apply/cssEscape";
import {
  chaseApplyPath,
  type CtaChaseResult,
} from "@/app/lib/apply/playwrightCrawl";
import {
  APPLY_SETTLE_DELAY_MS,
  detectPageSignals,
  waitForDomAndSettle,
  type PageSignals,
} from "@/app/lib/apply/playwrightSignals";
import {
  deriveStopClassification,
  type ApplyStopClassification,
} from "@/app/lib/apply/stopClassification";
import type {
  ApplySessionCtaAttemptRecord,
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
    entryUrl?: string;
    initialLoadedUrl?: string;
    finalUrl?: string;
    domain?: string;
    stoppedAtUrl?: string;
    stoppedAtTitle?: string;
    lastActionText?: string;
    lastActionSelector?: string;
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
    ctaAttempts?: ApplySessionCtaAttemptRecord[];
    entryCtaFound?: boolean;
    entryCtaClicked?: boolean;
    entryCtaClickedText?: string;
    entryCtaClickedSelector?: string;
    entryDismissedBlocker?: boolean;
    adzunaApplyCaptureDetected?: boolean;
    adzunaApplyCaptureSkipClicked?: boolean;
    adzunaApplyCaptureSkipText?: string;
    adzunaApplyCaptureSkipSelector?: string;
    adzunaPostApplyProgressionAttempted?: boolean;
    adzunaPostApplyProgressionSucceeded?: boolean;
    adzunaPostApplyUrlAfter?: string;
    adzunaPostApplyPopupDetected?: boolean;
    adzunaPostApplyNewPageDetected?: boolean;
    adzunaPostApplyFallbackAttempted?: boolean;
    handoffPageDetected?: boolean;
    handoffUrl?: string;
    handoffContinuationAttempted?: boolean;
    handoffContinuationSucceeded?: boolean;
    handoffCtaFound?: boolean;
    handoffCtaClicked?: boolean;
    handoffCtaClickedText?: string;
    handoffCtaClickedSelector?: string;
    handoffAttempts?: ApplySessionCtaAttemptRecord[];
    cookiePromptDetected?: boolean;
    cookiePromptClicked?: boolean;
    cookiePromptClickedText?: string;
    cookiePromptSelector?: string;
    cookiePromptAttempts?: ApplySessionCtaAttemptRecord[];
    postCookieWaitAttempted?: boolean;
    postCookieUrlBefore?: string;
    postCookieUrlAfter?: string;
    postCookieUrlChanged?: boolean;
    postCookieProgressDetected?: boolean;
    postCookieTitleAfter?: string;
    applyCtaClickedText?: string;
    applyCtaClickedSelector?: string;
    ctaClickedText?: string;
    ctaClickedSelector?: string;
    dismissedBlocker?: boolean;
    formDetected: boolean;
    confirmationDetected: boolean;
    verificationDetected: boolean;
    finalReason?: string;
    stopClassification?: ApplyStopClassification;
    resolverAttemptedLinks?: string[];
    resolverCandidates?: ApplySourceCandidate[];
    resolverRejectedCandidates?: ApplySourceRejectedCandidate[];
    resolverSelectedLink?: string;
    resolverSuccess?: boolean;
    resolverNewUrl?: string;
    resolvedHandoffClickAttempted?: boolean;
    resolvedHandoffClickSucceeded?: boolean;
    resolvedHandoffElementFound?: boolean;
    resolvedHandoffLocatorStrategy?: string;
    resolvedHandoffDirectNavAttempted?: boolean;
    resolvedHandoffDirectNavSucceeded?: boolean;
    resolvedHandoffDirectNavUrl?: string;
    resolvedHandoffDirectNavUrlAfter?: string;
    adzunaFallbackLinkFound?: boolean;
    adzunaFallbackLinkClicked?: boolean;
    adzunaFallbackLinkText?: string;
    adzunaFallbackLocatorStrategy?: string;
    adzunaFallbackElementFound?: boolean;
    adzunaFallbackClickSucceeded?: boolean;
    adzunaFallbackHref?: string;
    adzunaFallbackHost?: string;
    adzunaFallbackDirectNavAttempted?: boolean;
    adzunaFallbackDirectNavSucceeded?: boolean;
    adzunaExtractedRedirectUrl?: string;
    adzunaExtractedRedirectSource?:
      | "meta_refresh"
      | "inline_script"
      | "fallback_anchor";
    adzunaExtractedRedirectHtmlRead?: boolean;
    adzunaExtractedRedirectFailureReason?: string[];
    adzunaExtractedRedirectNavAttempted?: boolean;
    adzunaExtractedRedirectNavSucceeded?: boolean;
    adzunaFallbackUrlAfter?: string;
    resolvedHandoffClickedHref?: string;
    resolvedHandoffClickedText?: string;
    resolvedHandoffUrlBefore?: string;
    resolvedHandoffUrlAfter?: string;
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

type KnownApplyDomain = "adzuna" | "dice" | "generic";

type EntryCtaConfig = {
  text: string;
  match: "exact" | "contains";
  dismissesBlocker?: boolean;
  preferredRole?: "button" | "link" | "any";
};

type EntryCtaCandidate = {
  selector: string;
  text: string;
  matchedText: string;
  dismissesBlocker: boolean;
};

type EntryCtaPhaseResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  ctaFound: boolean;
  ctaClickedText?: string;
  ctaClickedSelector?: string;
  dismissedBlocker: boolean;
};

type AdzunaDetailsApplyPhaseResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  applyClicks: ApplySessionClickRecord[];
  handled: boolean;
  applyClicked: boolean;
  applyClickedText?: string;
  applyClickedSelector?: string;
  applyCaptureDetected: boolean;
  applyCaptureSkipClicked: boolean;
  applyCaptureSkipText?: string;
  applyCaptureSkipSelector?: string;
  postApplyProgressionAttempted: boolean;
  postApplyProgressionSucceeded: boolean;
  postApplyUrlAfter?: string;
  postApplyPopupDetected: boolean;
  postApplyNewPageDetected: boolean;
  postApplyFallbackAttempted: boolean;
  latestActionText?: string;
  latestActionSelector?: string;
};

type HandoffContinuationResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  handoffPageDetected: boolean;
  handoffUrl?: string;
  continuationAttempted: boolean;
  continuationSucceeded: boolean;
  ctaFound: boolean;
  ctaClicked: boolean;
  ctaClickedText?: string;
  ctaClickedSelector?: string;
  resolvedHandoffClickAttempted: boolean;
  resolvedHandoffClickSucceeded: boolean;
  resolvedHandoffElementFound: boolean;
  resolvedHandoffLocatorStrategy?: string;
  resolvedHandoffDirectNavAttempted: boolean;
  resolvedHandoffDirectNavSucceeded: boolean;
  resolvedHandoffDirectNavUrl?: string;
  resolvedHandoffDirectNavUrlAfter?: string;
  adzunaFallbackLinkFound: boolean;
  adzunaFallbackLinkClicked: boolean;
  adzunaFallbackLinkText?: string;
  adzunaFallbackLocatorStrategy?: string;
  adzunaFallbackElementFound: boolean;
  adzunaFallbackClickSucceeded: boolean;
  adzunaFallbackHref?: string;
  adzunaFallbackHost?: string;
  adzunaFallbackDirectNavAttempted: boolean;
  adzunaFallbackDirectNavSucceeded: boolean;
  adzunaExtractedRedirectUrl?: string;
  adzunaExtractedRedirectSource?:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor";
  adzunaExtractedRedirectHtmlRead: boolean;
  adzunaExtractedRedirectFailureReason?: string[];
  adzunaExtractedRedirectNavAttempted: boolean;
  adzunaExtractedRedirectNavSucceeded: boolean;
  adzunaFallbackUrlAfter?: string;
  resolvedHandoffClickedHref?: string;
  resolvedHandoffClickedText?: string;
  resolvedHandoffUrlBefore?: string;
  resolvedHandoffUrlAfter?: string;
};

type CookieConsentPhaseResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  detected: boolean;
  clicked: boolean;
  clickedText?: string;
  clickedSelector?: string;
  postCookieWaitAttempted: boolean;
  postCookieUrlBefore?: string;
  postCookieUrlAfter?: string;
  postCookieUrlChanged?: boolean;
  postCookieProgressDetected?: boolean;
  postCookieTitleAfter?: string;
};

type PostClickProgressResult = {
  page: Page;
  attempted: boolean;
  urlBefore: string;
  urlAfter: string;
  titleAfter?: string;
  urlChanged: boolean;
  progressDetected: boolean;
};

type ResolvedHandoffClickTarget = EntryCtaCandidate & {
  href?: string;
  locatorStrategy: string;
  locator: Locator;
};

type ResolvedHandoffClickResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  attempted: boolean;
  targetFound: boolean;
  succeeded: boolean;
  locatorStrategy?: string;
  directNavAttempted: boolean;
  directNavSucceeded: boolean;
  directNavUrl?: string;
  directNavUrlAfter?: string;
  clickedHref?: string;
  clickedText?: string;
  clickedSelector?: string;
  urlBefore?: string;
  urlAfter?: string;
};

type AdzunaFallbackLinkTarget = {
  locator: Locator;
  selector: string;
  text: string;
  matchedText: string;
  locatorStrategy: string;
  href?: string;
};

type AdzunaFallbackLinkResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  found: boolean;
  clicked: boolean;
  text?: string;
  selector?: string;
  locatorStrategy?: string;
  elementFound: boolean;
  clickSucceeded: boolean;
  href?: string;
  host?: string;
  directNavAttempted: boolean;
  directNavSucceeded: boolean;
  extractedRedirectUrl?: string;
  extractedRedirectSource?:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor";
  extractedRedirectHtmlRead: boolean;
  extractedRedirectFailureReason?: string[];
  extractedRedirectNavAttempted: boolean;
  extractedRedirectNavSucceeded: boolean;
  urlAfter?: string;
};

type AdzunaExtractedRedirectResult = {
  extractedUrl?: string;
  extractionSource?: "meta_refresh" | "inline_script" | "fallback_anchor";
  extractionSucceeded: boolean;
  htmlRead: boolean;
  failureReason?: string[];
  fallbackText?: string;
};

type ApplySourceCandidate = {
  href: string;
  hostname: string;
  text: string;
  score: number;
  reasons: string[];
};

type ApplySourceRejectedCandidate = {
  href: string;
  hostname: string;
  text: string;
  reason: string;
};

type ApplySourceAnchorSnapshot = {
  href: string;
  hostname: string;
  pathname: string;
  search: string;
  text: string;
  inMainContent: boolean;
  inHeaderOrFooter: boolean;
  visible: boolean;
};

type ApplySourceResolverResult = {
  attemptedLinks: string[];
  candidates: ApplySourceCandidate[];
  rejectedCandidates: ApplySourceRejectedCandidate[];
  selectedLink?: string;
  success: boolean;
  newUrl?: string;
};

const APPLY_SOURCE_RESOLVER_KEYWORDS = [
  "apply",
  "apply now",
  "apply-now",
  "application",
  "job",
  "jobs",
  "vacancy",
  "posting",
  "career",
  "careers",
  "external",
] as const;

const APPLY_CTA_DETECTION_PATTERNS = [
  "apply now",
  "continue to application",
  "start application",
  "submit application",
  "easy apply",
  "apply on company site",
  "visit site to apply",
  "go to job",
  "view job",
  "apply",
  "continue",
  "next",
] as const;

const ENTRY_CTA_MAX_STEPS = 4;
const HANDOFF_CTA_MAX_STEPS = 3;
const COOKIE_CTA_MAX_STEPS = 2;

const ENTRY_CTA_IGNORE_PATTERNS = [
  "job alert",
  "job alerts",
  "email alert",
  "create alert",
  "get alerts",
  "save job",
  "saved jobs",
  "similar jobs",
  "recommended jobs",
  "share job",
  "share this job",
];

const HANDOFF_CTA_IGNORE_PATTERNS = [
  ...ENTRY_CTA_IGNORE_PATTERNS,
  "sign in",
  "log in",
  "login",
  "sign up",
  "signup",
  "register",
  "create account",
];

const COOKIE_CTA_IGNORE_PATTERNS = [
  "save",
  "share",
  "sign in",
  "log in",
  "login",
  "sign up",
  "signup",
  "register",
  "create account",
  "subscribe",
  "job alert",
  "alerts",
] as const;

const COOKIE_CONTEXT_PATTERNS = [
  "cookie",
  "cookies",
  "consent",
  "privacy",
  "tracking",
  "preferences",
] as const;

const BLOCKER_SURFACE_SELECTORS = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-testid*="modal"]',
  '[data-testid*="banner"]',
  '[class*="modal"]',
  '[class*="overlay"]',
  '[class*="drawer"]',
  '[class*="banner"]',
  ".modal",
  ".overlay",
  ".drawer",
  ".banner",
] as const;

const FORCED_ENTRY_CTA_HOST_PATTERNS = [
  "adzuna.com",
  "adzuna.co.uk",
  "dice.com",
] as const;

const REAL_APPLY_HOST_PATTERNS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "myworkdayjobs.com",
  "workdayjobs.com",
  "icims.com",
  "jazzhr.com",
] as const;

const REAL_APPLY_URL_PATTERNS = [
  "/apply",
  "/application",
  "job_app",
  "jobapp",
  "candidate",
  "resume",
  "questionnaire",
  "question",
] as const;

const LOW_VALUE_RESOLVER_TEXT_PATTERNS = [
  "job alert",
  "job alerts",
  "create alert",
  "email alert",
  "sign up",
  "signup",
  "subscribe",
  "save job",
  "saved jobs",
  "share job",
  "share this job",
  "similar jobs",
  "recommended jobs",
] as const;

const LOW_VALUE_AGGREGATOR_PATHS = new Set([
  "/",
  "/jobs",
  "/jobs/",
  "/jobs/careers",
  "/jobs/careers/",
  "/careers",
  "/careers/",
  "/job-search",
  "/job-search/",
  "/jobsearch",
  "/jobsearch/",
  "/browse",
  "/browse/",
  "/browse-jobs",
  "/browse-jobs/",
  "/search",
  "/search/",
  "/find-jobs",
  "/find-jobs/",
]);

const LOW_VALUE_AGGREGATOR_SEGMENTS = new Set([
  "jobs",
  "careers",
  "career",
  "job-search",
  "jobsearch",
  "browse",
  "browse-jobs",
  "search",
  "find-jobs",
  "alerts",
  "job-alerts",
]);

function buildDebugPayload(args: {
  attemptedSelectors: string[];
  missingNames: string[];
  entryUrl?: string;
  initialLoadedUrl?: string;
  finalUrl?: string;
  domain?: string;
  stoppedAtUrl?: string;
  stoppedAtTitle?: string;
  lastActionText?: string;
  lastActionSelector?: string;
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
  ctaAttempts?: ApplySessionCtaAttemptRecord[];
  entryCtaFound?: boolean;
  entryCtaClicked?: boolean;
  entryCtaClickedText?: string;
  entryCtaClickedSelector?: string;
  entryDismissedBlocker?: boolean;
  adzunaApplyCaptureDetected?: boolean;
  adzunaApplyCaptureSkipClicked?: boolean;
  adzunaApplyCaptureSkipText?: string;
  adzunaApplyCaptureSkipSelector?: string;
  adzunaPostApplyProgressionAttempted?: boolean;
  adzunaPostApplyProgressionSucceeded?: boolean;
  adzunaPostApplyUrlAfter?: string;
  adzunaPostApplyPopupDetected?: boolean;
  adzunaPostApplyNewPageDetected?: boolean;
  adzunaPostApplyFallbackAttempted?: boolean;
  handoffPageDetected?: boolean;
  handoffUrl?: string;
  handoffContinuationAttempted?: boolean;
  handoffContinuationSucceeded?: boolean;
  handoffCtaFound?: boolean;
  handoffCtaClicked?: boolean;
  handoffCtaClickedText?: string;
  handoffCtaClickedSelector?: string;
  handoffAttempts?: ApplySessionCtaAttemptRecord[];
  cookiePromptDetected?: boolean;
  cookiePromptClicked?: boolean;
  cookiePromptClickedText?: string;
  cookiePromptSelector?: string;
  cookiePromptAttempts?: ApplySessionCtaAttemptRecord[];
  postCookieWaitAttempted?: boolean;
  postCookieUrlBefore?: string;
  postCookieUrlAfter?: string;
  postCookieUrlChanged?: boolean;
  postCookieProgressDetected?: boolean;
  postCookieTitleAfter?: string;
  applyCtaClickedText?: string;
  applyCtaClickedSelector?: string;
  ctaClickedText?: string;
  ctaClickedSelector?: string;
  dismissedBlocker?: boolean;
  formDetected: boolean;
  confirmationDetected: boolean;
  verificationDetected: boolean;
  finalReason?: string;
  stopClassification?: ApplyStopClassification;
  resolverAttemptedLinks?: string[];
  resolverCandidates?: ApplySourceCandidate[];
  resolverRejectedCandidates?: ApplySourceRejectedCandidate[];
  resolverSelectedLink?: string;
  resolverSuccess?: boolean;
  resolverNewUrl?: string;
  resolvedHandoffClickAttempted?: boolean;
  resolvedHandoffClickSucceeded?: boolean;
  resolvedHandoffElementFound?: boolean;
  resolvedHandoffLocatorStrategy?: string;
  resolvedHandoffDirectNavAttempted?: boolean;
  resolvedHandoffDirectNavSucceeded?: boolean;
  resolvedHandoffDirectNavUrl?: string;
  resolvedHandoffDirectNavUrlAfter?: string;
  adzunaFallbackLinkFound?: boolean;
  adzunaFallbackLinkClicked?: boolean;
  adzunaFallbackLinkText?: string;
  adzunaFallbackLocatorStrategy?: string;
  adzunaFallbackElementFound?: boolean;
  adzunaFallbackClickSucceeded?: boolean;
  adzunaFallbackHref?: string;
  adzunaFallbackHost?: string;
  adzunaFallbackDirectNavAttempted?: boolean;
  adzunaFallbackDirectNavSucceeded?: boolean;
  adzunaExtractedRedirectUrl?: string;
  adzunaExtractedRedirectSource?:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor";
  adzunaExtractedRedirectHtmlRead?: boolean;
  adzunaExtractedRedirectFailureReason?: string[];
  adzunaExtractedRedirectNavAttempted?: boolean;
  adzunaExtractedRedirectNavSucceeded?: boolean;
  adzunaFallbackUrlAfter?: string;
  resolvedHandoffClickedHref?: string;
  resolvedHandoffClickedText?: string;
  resolvedHandoffUrlBefore?: string;
  resolvedHandoffUrlAfter?: string;
}) {
  return {
    attemptedSelectors: args.attemptedSelectors,
    missingNames: args.missingNames,
    entryUrl: args.entryUrl,
    initialLoadedUrl: args.initialLoadedUrl,
    finalUrl: args.finalUrl,
    domain: args.domain,
    stoppedAtUrl: args.stoppedAtUrl,
    stoppedAtTitle: args.stoppedAtTitle,
    lastActionText: args.lastActionText,
    lastActionSelector: args.lastActionSelector,
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
    ctaAttempts: args.ctaAttempts ?? [],
    entryCtaFound: args.entryCtaFound ?? false,
    entryCtaClicked: args.entryCtaClicked ?? false,
    entryCtaClickedText: args.entryCtaClickedText,
    entryCtaClickedSelector: args.entryCtaClickedSelector,
    entryDismissedBlocker: args.entryDismissedBlocker ?? false,
    adzunaApplyCaptureDetected: args.adzunaApplyCaptureDetected ?? false,
    adzunaApplyCaptureSkipClicked:
      args.adzunaApplyCaptureSkipClicked ?? false,
    adzunaApplyCaptureSkipText: args.adzunaApplyCaptureSkipText,
    adzunaApplyCaptureSkipSelector: args.adzunaApplyCaptureSkipSelector,
    adzunaPostApplyProgressionAttempted:
      args.adzunaPostApplyProgressionAttempted ?? false,
    adzunaPostApplyProgressionSucceeded:
      args.adzunaPostApplyProgressionSucceeded ?? false,
    adzunaPostApplyUrlAfter: args.adzunaPostApplyUrlAfter,
    adzunaPostApplyPopupDetected:
      args.adzunaPostApplyPopupDetected ?? false,
    adzunaPostApplyNewPageDetected:
      args.adzunaPostApplyNewPageDetected ?? false,
    adzunaPostApplyFallbackAttempted:
      args.adzunaPostApplyFallbackAttempted ?? false,
    handoffPageDetected: args.handoffPageDetected ?? false,
    handoffUrl: args.handoffUrl,
    handoffContinuationAttempted:
      args.handoffContinuationAttempted ?? false,
    handoffContinuationSucceeded:
      args.handoffContinuationSucceeded ?? false,
    handoffCtaFound: args.handoffCtaFound ?? false,
    handoffCtaClicked: args.handoffCtaClicked ?? false,
    handoffCtaClickedText: args.handoffCtaClickedText,
    handoffCtaClickedSelector: args.handoffCtaClickedSelector,
    handoffAttempts: args.handoffAttempts ?? [],
    cookiePromptDetected: args.cookiePromptDetected ?? false,
    cookiePromptClicked: args.cookiePromptClicked ?? false,
    cookiePromptClickedText: args.cookiePromptClickedText,
    cookiePromptSelector: args.cookiePromptSelector,
    cookiePromptAttempts: args.cookiePromptAttempts ?? [],
    postCookieWaitAttempted: args.postCookieWaitAttempted ?? false,
    postCookieUrlBefore: args.postCookieUrlBefore,
    postCookieUrlAfter: args.postCookieUrlAfter,
    postCookieUrlChanged: args.postCookieUrlChanged ?? false,
    postCookieProgressDetected:
      args.postCookieProgressDetected ?? false,
    postCookieTitleAfter: args.postCookieTitleAfter,
    applyCtaClickedText: args.applyCtaClickedText,
    applyCtaClickedSelector: args.applyCtaClickedSelector,
    ctaClickedText: args.ctaClickedText,
    ctaClickedSelector: args.ctaClickedSelector,
    dismissedBlocker: args.dismissedBlocker ?? false,
    formDetected: args.formDetected,
    confirmationDetected: args.confirmationDetected,
    verificationDetected: args.verificationDetected,
    finalReason: args.finalReason,
    stopClassification: args.stopClassification,
    resolverAttemptedLinks: args.resolverAttemptedLinks ?? [],
    resolverCandidates: args.resolverCandidates ?? [],
    resolverRejectedCandidates: args.resolverRejectedCandidates ?? [],
    resolverSelectedLink: args.resolverSelectedLink,
    resolverSuccess: args.resolverSuccess,
    resolverNewUrl: args.resolverNewUrl,
    resolvedHandoffClickAttempted:
      args.resolvedHandoffClickAttempted ?? false,
    resolvedHandoffClickSucceeded:
      args.resolvedHandoffClickSucceeded ?? false,
    resolvedHandoffElementFound:
      args.resolvedHandoffElementFound ?? false,
    resolvedHandoffLocatorStrategy: args.resolvedHandoffLocatorStrategy,
    resolvedHandoffDirectNavAttempted:
      args.resolvedHandoffDirectNavAttempted ?? false,
    resolvedHandoffDirectNavSucceeded:
      args.resolvedHandoffDirectNavSucceeded ?? false,
    resolvedHandoffDirectNavUrl: args.resolvedHandoffDirectNavUrl,
    resolvedHandoffDirectNavUrlAfter: args.resolvedHandoffDirectNavUrlAfter,
    adzunaFallbackLinkFound: args.adzunaFallbackLinkFound ?? false,
    adzunaFallbackLinkClicked: args.adzunaFallbackLinkClicked ?? false,
    adzunaFallbackLinkText: args.adzunaFallbackLinkText,
    adzunaFallbackLocatorStrategy: args.adzunaFallbackLocatorStrategy,
    adzunaFallbackElementFound:
      args.adzunaFallbackElementFound ?? false,
    adzunaFallbackClickSucceeded:
      args.adzunaFallbackClickSucceeded ?? false,
    adzunaFallbackHref: args.adzunaFallbackHref,
    adzunaFallbackHost: args.adzunaFallbackHost,
    adzunaFallbackDirectNavAttempted:
      args.adzunaFallbackDirectNavAttempted ?? false,
    adzunaFallbackDirectNavSucceeded:
      args.adzunaFallbackDirectNavSucceeded ?? false,
    adzunaExtractedRedirectUrl: args.adzunaExtractedRedirectUrl,
    adzunaExtractedRedirectSource:
      args.adzunaExtractedRedirectSource,
    adzunaExtractedRedirectHtmlRead:
      args.adzunaExtractedRedirectHtmlRead ?? false,
    adzunaExtractedRedirectFailureReason:
      args.adzunaExtractedRedirectFailureReason ?? [],
    adzunaExtractedRedirectNavAttempted:
      args.adzunaExtractedRedirectNavAttempted ?? false,
    adzunaExtractedRedirectNavSucceeded:
      args.adzunaExtractedRedirectNavSucceeded ?? false,
    adzunaFallbackUrlAfter: args.adzunaFallbackUrlAfter,
    resolvedHandoffClickedHref: args.resolvedHandoffClickedHref,
    resolvedHandoffClickedText: args.resolvedHandoffClickedText,
    resolvedHandoffUrlBefore: args.resolvedHandoffUrlBefore,
    resolvedHandoffUrlAfter: args.resolvedHandoffUrlAfter,
  };
}

function buildCtaEvidence(
  chase: CtaChaseResult,
  currentUrl: string,
  preludeApplyClicks: ApplySessionClickRecord[] = [],
) {
  const effectiveClicks = [...preludeApplyClicks, ...chase.clicks];
  return {
    applyCtaFound: effectiveClicks.length > 0,
    applyCtaClicked: effectiveClicks.length > 0,
    urlBeforeClick: effectiveClicks[0]?.fromUrl,
    urlAfterClick: effectiveClicks.at(-1)?.toUrl ?? currentUrl,
    currentUrl,
    hopCount: preludeApplyClicks.length + chase.hopCount,
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

function hostnameMatches(hostname: string, patterns: readonly string[]) {
  return patterns.some(
    (pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`),
  );
}

function dedupeUrls(urls: string[]) {
  return [...new Set(urls.filter((url) => Boolean(url)))];
}

function shouldForceEntryCtaPhase(hostname: string, currentUrl: string) {
  return (
    hostnameMatches(hostname, FORCED_ENTRY_CTA_HOST_PATTERNS) ||
    hostnameMatches(parseHostname(currentUrl), FORCED_ENTRY_CTA_HOST_PATTERNS)
  );
}

function isImmediateApplyDestinationPage(args: {
  hostname: string;
  currentUrl: string;
  signals: PageSignals;
}) {
  if (shouldForceEntryCtaPhase(args.hostname, args.currentUrl)) {
    return false;
  }

  if (args.signals.confirmationDetected || args.signals.needsHuman) {
    return true;
  }

  if (args.signals.formDetected) {
    return true;
  }

  if (hostnameMatches(args.hostname, REAL_APPLY_HOST_PATTERNS)) {
    return true;
  }

  const lowerUrl = args.currentUrl.toLowerCase();
  return REAL_APPLY_URL_PATTERNS.some((pattern) => lowerUrl.includes(pattern));
}

function detectApplyDomainFromHostname(hostname: string): KnownApplyDomain {
  const normalized = hostname.toLowerCase();
  if (normalized.includes("adzuna")) return "adzuna";
  if (normalized.includes("dice")) return "dice";
  return "generic";
}

function detectApplyDomain(url: string): KnownApplyDomain {
  const hostname = parseHostname(url);
  return detectApplyDomainFromHostname(hostname);
}

function isAppcastTrackingPage(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "click.appcast.io" || hostname.endsWith(".appcast.io");
  } catch {
    return false;
  }
}

function isAdzunaLandRedirectPage(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = normalizeResolverPathname(parsed.pathname);
    return hostname.includes("adzuna") && pathname.includes("/land/ad/");
  } catch {
    return false;
  }
}

function isAdzunaDetailsPage(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = normalizeResolverPathname(parsed.pathname);
    return hostname.includes("adzuna") && pathname.includes("/details/");
  } catch {
    return false;
  }
}

function resolveAbsoluteNavigationTarget(
  rawHref: string | null | undefined,
  currentUrl: string,
) {
  const value = String(rawHref ?? "").trim();
  if (!value) return undefined;
  if (value.startsWith("#")) return undefined;
  if (/^javascript:/i.test(value)) return undefined;

  try {
    const resolved = new URL(value, currentUrl).toString();
    return /^https?:\/\//i.test(resolved) ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function isStrongResolvedHandoffCandidate(candidate: ApplySourceCandidate) {
  const signalText = `${candidate.href} ${candidate.text}`.toLowerCase();

  if (candidate.score >= 140) {
    return true;
  }

  if (
    candidate.reasons.some(
      (reason) =>
        reason === "apply_path" ||
        reason === "redirect_handoff" ||
        reason === "known_apply_host" ||
        reason === "job_specific_path" ||
        reason.startsWith("keyword:apply") ||
        reason.startsWith("keyword:application"),
    )
  ) {
    return true;
  }

  return [
    "apply for this job",
    "apply now",
    "continue to application",
    "visit employer site",
    "go to application",
    "open job site",
    "/land/ad/",
    "apply",
    "application",
  ].some((pattern) => signalText.includes(pattern));
}

function pickResolvedHandoffCandidate(args: {
  resolverSelectedLink?: string;
  resolverCandidates: ApplySourceCandidate[];
}) {
  const selectedCandidate = args.resolverSelectedLink
    ? args.resolverCandidates.find(
        (candidate) => candidate.href === args.resolverSelectedLink,
      )
    : undefined;

  const preferred =
    selectedCandidate ??
    (args.resolverSelectedLink
      ? ({
          href: args.resolverSelectedLink,
          hostname: parseHostname(args.resolverSelectedLink),
          text: args.resolverCandidates[0]?.text ?? "",
          score: args.resolverCandidates[0]?.score ?? 0,
          reasons: ["selected_link_fallback"],
        } satisfies ApplySourceCandidate)
      : undefined) ??
    args.resolverCandidates[0];

  if (!preferred) {
    return null;
  }

  return isStrongResolvedHandoffCandidate(preferred) ? preferred : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildResolvedHandoffHrefFragments(rawHref: string) {
  const fragments = new Set<string>();

  try {
    const parsed = new URL(rawHref);
    const pathAndSearch = `${parsed.pathname}${parsed.search}`;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const tailFragment = segments.slice(-2).join("/");

    fragments.add(rawHref);
    if (pathAndSearch) fragments.add(pathAndSearch);
    if (parsed.pathname) fragments.add(parsed.pathname);
    if (tailFragment) fragments.add(tailFragment);
    if (parsed.pathname.includes("/land/ad/")) {
      fragments.add("land/ad");
    }
  } catch {
    if (rawHref) {
      fragments.add(rawHref);
    }
  }

  return [...fragments].filter(Boolean);
}

async function findFirstVisibleEnabledLocator(
  locator: Locator,
): Promise<Locator | null> {
  const count = await locator.count().catch(() => 0);
  const max = Math.min(count, 8);

  for (let index = 0; index < max; index += 1) {
    const candidate = locator.nth(index);
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) continue;

    const enabled = await candidate.isEnabled().catch(() => true);
    const ariaDisabled = await candidate
      .getAttribute("aria-disabled")
      .catch(() => null);

    if (!enabled || ariaDisabled === "true") {
      continue;
    }

    return candidate;
  }

  return null;
}

async function isVisibleLocator(locator: Locator) {
  const count = await locator.count().catch(() => 0);
  if (count === 0) return false;
  return locator.first().isVisible().catch(() => false);
}

async function findNearestVisibleClickableFromTextLocator(
  locator: Locator,
): Promise<Locator | null> {
  const selfOrAncestorClickable = await findFirstVisibleEnabledLocator(
    locator.locator(
      "xpath=ancestor-or-self::*[self::a[@href] or self::button or @role='button'][1]",
    ),
  );
  if (selfOrAncestorClickable) {
    return selfOrAncestorClickable;
  }

  const containerLocator = locator.locator(
    "xpath=ancestor::*[self::p or self::div or self::span or self::section or self::article or self::main][1]",
  );
  const containerClickable = await findFirstVisibleEnabledLocator(
    containerLocator.locator("a[href], button, [role='button']"),
  );
  if (containerClickable) {
    return containerClickable;
  }

  const parentContainerClickable = await findFirstVisibleEnabledLocator(
    locator
      .locator(
        "xpath=ancestor::*[self::p or self::div or self::span or self::section or self::article or self::main][2]",
      )
      .locator("a[href], button, [role='button']"),
  );

  return parentContainerClickable;
}

async function buildAdzunaFallbackTargetFromLocator(args: {
  locator: Locator;
  strategy: string;
  selector: string;
  matchedText: string;
  nearestClickable?: boolean;
}): Promise<AdzunaFallbackLinkTarget | null> {
  const matchedLocator = args.nearestClickable
    ? await findNearestVisibleClickableFromTextLocator(args.locator)
    : await findFirstVisibleEnabledLocator(args.locator);
  if (!matchedLocator) {
    return null;
  }

  const href =
    (await matchedLocator.getAttribute("href").catch(() => null)) ?? undefined;
  const text = (await extractLocatorText(matchedLocator)).trim();

  return {
    locator: matchedLocator,
    selector: args.selector,
    text: text.slice(0, 160) || args.matchedText,
    matchedText: args.matchedText,
    locatorStrategy: args.strategy,
    href,
  } satisfies AdzunaFallbackLinkTarget;
}

async function navigateResolvedHandoffCandidateDirectly(args: {
  page: Page;
  context: BrowserContext;
  candidate: ApplySourceCandidate;
  resolverSelectedLink?: string;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const directNavUrl = args.resolverSelectedLink ?? args.candidate.href;
  const urlBefore = args.page.url();

  console.log("[AUTO_APPLY_RESOLVED_HANDOFF_NAV] attempting", {
    resolvedHandoffDirectNavAttempted: true,
    resolvedHandoffDirectNavUrl: directNavUrl,
    currentUrl: urlBefore,
    candidateScore: args.candidate.score,
  });

  try {
    await args.page.goto(directNavUrl, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(args.page);
    await args.onPageReady?.(args.page, args.context);
  } catch {
    const failedResult = {
      page: args.page,
      attempted: true,
      succeeded: false,
      url: directNavUrl,
      urlAfter: args.page.url(),
    };

    console.log("[AUTO_APPLY_RESOLVED_HANDOFF_NAV]", {
      resolvedHandoffDirectNavAttempted: failedResult.attempted,
      resolvedHandoffDirectNavSucceeded: failedResult.succeeded,
      resolvedHandoffDirectNavUrl: failedResult.url,
      resolvedHandoffDirectNavUrlAfter: failedResult.urlAfter,
      currentUrl: args.page.url(),
    });

    return failedResult;
  }

  const progress = await waitForPostClickProgress({
    page: args.page,
    context: args.context,
    urlBefore,
    onPageReady: args.onPageReady,
  });

  const directNavUrlAfter = progress.page.url();
  const directNavSucceeded =
    progress.urlChanged ||
    !isAdzunaLandRedirectPage(directNavUrlAfter) ||
    (await hasReachedPostHandoffDestination(progress.page));

  const result = {
    page: progress.page,
    attempted: true,
    succeeded: directNavSucceeded,
    url: directNavUrl,
    urlAfter: directNavUrlAfter,
  };

  console.log("[AUTO_APPLY_RESOLVED_HANDOFF_NAV]", {
    resolvedHandoffDirectNavAttempted: result.attempted,
    resolvedHandoffDirectNavSucceeded: result.succeeded,
    resolvedHandoffDirectNavUrl: result.url,
    resolvedHandoffDirectNavUrlAfter: result.urlAfter,
    currentUrl: progress.page.url(),
  });

  return result;
}

async function waitForTrackedHandoffRedirects(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const currentUrl = activePage.url();
    if (
      !isAdzunaLandRedirectPage(currentUrl) &&
      !isAppcastTrackingPage(currentUrl)
    ) {
      break;
    }

    const progress = await waitForPostClickProgress({
      page: activePage,
      context: args.context,
      urlBefore: currentUrl,
      onPageReady: args.onPageReady,
    });

    activePage = progress.page;
    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    if (!progress.progressDetected) {
      break;
    }
  }

  return {
    page: activePage,
    urlsVisited,
  };
}

async function navigateAdzunaFallbackHrefDirectly(args: {
  page: Page;
  context: BrowserContext;
  href: string;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const urlBefore = args.page.url();
  const fallbackHost = parseHostname(args.href);

  console.log("[AUTO_APPLY_ADZUNA_APPCAST_FALLBACK] attempting", {
    adzunaFallbackDirectNavAttempted: true,
    adzunaFallbackHref: args.href,
    adzunaFallbackHost: fallbackHost || null,
    currentUrl: urlBefore,
  });

  try {
    await args.page.goto(args.href, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(args.page);
    await args.onPageReady?.(args.page, args.context);
  } catch {
    const failedResult = {
      page: args.page,
      attempted: true,
      succeeded: false,
      href: args.href,
      host: fallbackHost,
      urlAfter: args.page.url(),
      urlsVisited: [urlBefore, args.page.url()].filter(
        (value, index, all) => Boolean(value) && all.indexOf(value) === index,
      ),
    };

    console.log("[AUTO_APPLY_ADZUNA_APPCAST_FALLBACK]", {
      adzunaFallbackDirectNavAttempted: failedResult.attempted,
      adzunaFallbackDirectNavSucceeded: failedResult.succeeded,
      adzunaFallbackHref: failedResult.href,
      adzunaFallbackHost: failedResult.host || null,
      adzunaFallbackUrlAfter: failedResult.urlAfter,
      currentUrl: args.page.url(),
    });

    return failedResult;
  }

  const chainedProgress = await waitForTrackedHandoffRedirects({
    page: args.page,
    context: args.context,
    onPageReady: args.onPageReady,
  });

  const finalPage = chainedProgress.page;
  const finalUrl = finalPage.url();
  const succeeded =
    finalUrl !== urlBefore &&
    !isAdzunaLandRedirectPage(finalUrl) &&
    !isAppcastTrackingPage(finalUrl);

  const result = {
    page: finalPage,
    attempted: true,
    succeeded,
    href: args.href,
    host: fallbackHost,
    urlAfter: finalUrl,
    urlsVisited: [urlBefore, ...chainedProgress.urlsVisited].filter(
      (value, index, all) => Boolean(value) && all.indexOf(value) === index,
    ),
  };

  console.log("[AUTO_APPLY_ADZUNA_APPCAST_FALLBACK]", {
    adzunaFallbackDirectNavAttempted: result.attempted,
    adzunaFallbackDirectNavSucceeded: result.succeeded,
    adzunaFallbackHref: result.href,
    adzunaFallbackHost: result.host || null,
    adzunaFallbackUrlAfter: result.urlAfter,
    currentUrl: finalPage.url(),
  });

  return result;
}

async function extractAdzunaInterstitialRedirectTarget(
  page: Page,
): Promise<AdzunaExtractedRedirectResult> {
  if (!isAdzunaLandRedirectPage(page.url())) {
    return {
      extractionSucceeded: false,
      htmlRead: false,
    } satisfies AdzunaExtractedRedirectResult;
  }

  const html = await page.content().catch(() => "");
  if (!html.trim()) {
    return {
      extractionSucceeded: false,
      htmlRead: false,
      failureReason: ["html_read_failed"],
    } satisfies AdzunaExtractedRedirectResult;
  }

  const baseUrl = page.url();
  const normalizeUrl = (rawValue: string | null | undefined) => {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return null;

    try {
      return new URL(raw, baseUrl).toString();
    } catch {
      return null;
    }
  };

  const preferBestUrl = (values: Array<string | null | undefined>) => {
    const normalized = values
      .map((value) => normalizeUrl(value))
      .filter((value): value is string => Boolean(value))
      .filter((value) => value !== baseUrl);

    const appcast = normalized.find((value) => isAppcastTrackingPage(value));
    return appcast ?? normalized[0];
  };

  const metaRefreshCandidates = Array.from(
    html.matchAll(/<meta\b[^>]*>/gi),
    (match) => match[0],
  )
    .filter((tag) => /http-equiv\s*=\s*(["'])?refresh\1/i.test(tag))
    .map((tag) => {
      const contentMatch = tag.match(
        /content\s*=\s*(["'])([\s\S]*?)\1/i,
      );
      const content = contentMatch?.[2] ?? "";
      const urlMatch = content.match(/(?:^|;)\s*url\s*=\s*([^;]+)/i);
      return urlMatch?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? null;
    });

  const metaRefreshUrl = preferBestUrl(metaRefreshCandidates);
  if (metaRefreshUrl) {
    return {
      extractedUrl: metaRefreshUrl,
      extractionSource: "meta_refresh",
      extractionSucceeded: true,
      htmlRead: true,
    } satisfies AdzunaExtractedRedirectResult;
  }

  const inlineScriptCandidates = [
    ...Array.from(
      html.matchAll(
        /(?:window\.)?location\.replace\(\s*(["'])(.*?)\1\s*\)/gi,
      ),
      (match) => match[2],
    ),
    ...Array.from(
      html.matchAll(
        /(?:window\.)?location(?:\.href)?\s*=\s*(["'])(.*?)\1/gi,
      ),
      (match) => match[2],
    ),
  ];

  const inlineScriptUrl = preferBestUrl(inlineScriptCandidates);
  if (inlineScriptUrl) {
    return {
      extractedUrl: inlineScriptUrl,
      extractionSource: "inline_script",
      extractionSucceeded: true,
      htmlRead: true,
    } satisfies AdzunaExtractedRedirectResult;
  }

  const fallbackAnchorCandidates = Array.from(
    html.matchAll(
      /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  )
    .map((match) => ({
      href: match[2],
      text: match[3]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((candidate) =>
      ["view ad here", "view job here", "open ad here"].some((pattern) =>
        candidate.text.toLowerCase().includes(pattern),
      ),
    );

  const fallbackAnchorUrl = preferBestUrl(
    fallbackAnchorCandidates.map((candidate) => candidate.href),
  );
  if (fallbackAnchorUrl) {
    const fallbackMatch = fallbackAnchorCandidates.find(
      (candidate) => normalizeUrl(candidate.href) === fallbackAnchorUrl,
    );

    return {
      extractedUrl: fallbackAnchorUrl,
      extractionSource: "fallback_anchor",
      extractionSucceeded: true,
      htmlRead: true,
      fallbackText: fallbackMatch?.text.slice(0, 160) || undefined,
    } satisfies AdzunaExtractedRedirectResult;
  }

  return {
    extractionSucceeded: false,
    htmlRead: true,
    failureReason: [
      "no_meta_refresh_match",
      "no_location_replace_match",
      "no_fallback_anchor_match",
    ],
  } satisfies AdzunaExtractedRedirectResult;
}

async function navigateAdzunaExtractedRedirectDirectly(args: {
  page: Page;
  context: BrowserContext;
  extractedUrl: string;
  extractionSource: "meta_refresh" | "inline_script" | "fallback_anchor";
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  console.log("[AUTO_APPLY_ADZUNA_EXTRACTED_REDIRECT] attempting", {
    adzunaExtractedRedirectUrl: args.extractedUrl,
    adzunaExtractedRedirectSource: args.extractionSource,
    currentUrl: args.page.url(),
  });

  const result = await navigateAdzunaFallbackHrefDirectly({
    page: args.page,
    context: args.context,
    href: args.extractedUrl,
    onPageReady: args.onPageReady,
  });

  console.log("[AUTO_APPLY_ADZUNA_EXTRACTED_REDIRECT]", {
    adzunaExtractedRedirectUrl: args.extractedUrl,
    adzunaExtractedRedirectSource: args.extractionSource,
    adzunaExtractedRedirectNavAttempted: result.attempted,
    adzunaExtractedRedirectNavSucceeded: result.succeeded,
    adzunaFallbackUrlAfter: result.urlAfter,
    currentUrl: result.page.url(),
  });

  return result;
}

async function findAdzunaFallbackLinkTarget(
  page: Page,
): Promise<AdzunaFallbackLinkTarget | null> {
  const textPatterns = [
    "view ad here",
    "view job here",
    "open ad here",
  ] as const;
  const redirectSentencePattern =
    /if\s+you\s+are\s+not\s+redirected(?:\s+within\s+\d+\s+seconds?)?/i;
  const locatorPlans: Array<{
    locator: Locator;
    strategy: string;
    selector: string;
    matchedText: string;
    nearestClickable?: boolean;
  }> = [];

  for (const pattern of textPatterns) {
    const containsPattern = new RegExp(
      pattern
        .split(/\s+/)
        .map((token) => escapeRegExp(token))
        .join("\\s+"),
      "i",
    );

    locatorPlans.push({
      locator: page.locator("a[href]").filter({ hasText: containsPattern }),
      strategy: "adzuna_fallback_anchor_text_contains",
      selector: `a[href]:has-text(${pattern})`,
      matchedText: pattern,
    });
    locatorPlans.push({
      locator: page
        .locator("button, [role='button']")
        .filter({ hasText: containsPattern }),
      strategy: "adzuna_fallback_button_text_contains",
      selector: `button:has-text(${pattern})`,
      matchedText: pattern,
    });
    locatorPlans.push({
      locator: page.getByText(containsPattern),
      strategy: "adzuna_fallback_text_nearest_clickable",
      selector: `text=${pattern} -> nearest_clickable`,
      matchedText: pattern,
      nearestClickable: true,
    });
  }

  locatorPlans.push({
    locator: page.getByText(redirectSentencePattern),
    strategy: "adzuna_fallback_redirect_sentence_container_link",
    selector: "text=/if you are not redirected/i -> nearest_clickable",
    matchedText: "if you are not redirected",
    nearestClickable: true,
  });

  for (const plan of locatorPlans) {
    const target = await buildAdzunaFallbackTargetFromLocator({
      locator: plan.locator,
      strategy: plan.strategy,
      selector: plan.selector,
      matchedText: plan.matchedText,
      nearestClickable: plan.nearestClickable,
    });
    if (!target) continue;

    return target;
  }

  return null;
}

async function clickAdzunaFallbackLinkIfStuck(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<AdzunaFallbackLinkResult> {
  let activePage = args.page;
  const fromUrl = activePage.url();
  const urlsVisited = [fromUrl];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  let directNavAttempted = false;
  let directNavSucceeded = false;
  let extractedRedirectUrl: string | undefined;
  let extractedRedirectSource:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | undefined;
  let extractedRedirectHtmlRead = false;
  let extractedRedirectFailureReason: string[] | undefined;
  let extractedRedirectNavAttempted = false;
  let extractedRedirectNavSucceeded = false;

  if (!isAdzunaLandRedirectPage(fromUrl)) {
    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      found: false,
      clicked: false,
      elementFound: false,
      clickSucceeded: false,
      directNavAttempted,
      directNavSucceeded,
      extractedRedirectHtmlRead,
      extractedRedirectFailureReason,
      extractedRedirectNavAttempted,
      extractedRedirectNavSucceeded,
    } satisfies AdzunaFallbackLinkResult;

    console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
      adzunaFallbackLinkFound: result.found,
      adzunaFallbackLinkClicked: result.clicked,
      adzunaFallbackLinkText: null,
      adzunaFallbackLocatorStrategy: null,
      adzunaFallbackElementFound: result.elementFound,
      adzunaFallbackClickSucceeded: result.clickSucceeded,
      adzunaFallbackHref: null,
      adzunaFallbackHost: null,
      adzunaFallbackDirectNavAttempted: result.directNavAttempted,
      adzunaFallbackDirectNavSucceeded: result.directNavSucceeded,
      adzunaExtractedRedirectUrl: null,
      adzunaExtractedRedirectSource: null,
      adzunaExtractedRedirectHtmlRead: result.extractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        result.extractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted:
        result.extractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded:
        result.extractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter: fromUrl,
      currentUrl: fromUrl,
    });

    return result;
  }

  await activePage.waitForTimeout(APPLY_SETTLE_DELAY_MS + 400).catch(() => null);
  await waitForDomAndSettle(activePage).catch(() => null);

  const extractedRedirect =
    await extractAdzunaInterstitialRedirectTarget(activePage);
  extractedRedirectUrl = extractedRedirect.extractedUrl;
  extractedRedirectSource = extractedRedirect.extractionSource;
  extractedRedirectHtmlRead = extractedRedirect.htmlRead;
  extractedRedirectFailureReason = extractedRedirect.failureReason;

  console.log("[AUTO_APPLY_ADZUNA_EXTRACTED_REDIRECT]", {
    adzunaExtractedRedirectUrl: extractedRedirectUrl ?? null,
    adzunaExtractedRedirectSource: extractedRedirectSource ?? null,
    adzunaExtractedRedirectHtmlRead: extractedRedirectHtmlRead,
    adzunaExtractedRedirectFailureReason:
      extractedRedirectFailureReason ?? [],
    extractionSucceeded: extractedRedirect.extractionSucceeded,
    currentUrl: activePage.url(),
  });

  attempts.push({
    phase: "handoff",
    action: "scan",
    selector: extractedRedirectSource
      ? `source:${extractedRedirectSource}`
      : "adzuna_interstitial_source_extract",
    text: extractedRedirectUrl ?? "",
    matchedText:
      extractedRedirect.fallbackText ??
      extractedRedirectSource ??
      "extracted_redirect",
    locatorStrategy: "adzuna_interstitial_source_extract",
    candidateFound: extractedRedirect.extractionSucceeded,
    dismissesBlocker: false,
    success: extractedRedirect.extractionSucceeded,
    urlBefore: fromUrl,
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (
    extractedRedirect.extractionSucceeded &&
    extractedRedirectUrl &&
    extractedRedirectSource
  ) {
    const extractedRedirectNav =
      await navigateAdzunaExtractedRedirectDirectly({
        page: activePage,
        context: args.context,
        extractedUrl: extractedRedirectUrl,
        extractionSource: extractedRedirectSource,
        onPageReady: args.onPageReady,
      });

    activePage = extractedRedirectNav.page;
    extractedRedirectNavAttempted = extractedRedirectNav.attempted;
    extractedRedirectNavSucceeded = extractedRedirectNav.succeeded;
    directNavAttempted = extractedRedirectNav.attempted;
    directNavSucceeded = extractedRedirectNav.succeeded;

    for (const url of extractedRedirectNav.urlsVisited) {
      if (!urlsVisited.includes(url)) {
        urlsVisited.push(url);
      }
    }

    if (extractedRedirectNavSucceeded) {
      const extractedResult = {
        page: activePage,
        urlsVisited,
        clicks,
        attempts,
        found: extractedRedirectSource === "fallback_anchor",
        clicked: true,
        text:
          extractedRedirect.fallbackText ??
          (extractedRedirectSource === "fallback_anchor"
            ? "view ad here"
            : undefined),
        selector:
          extractedRedirectSource === "fallback_anchor"
            ? "source:fallback_anchor"
            : undefined,
        locatorStrategy: `adzuna_extracted_redirect_${extractedRedirectSource}`,
        elementFound: extractedRedirectSource === "fallback_anchor",
        clickSucceeded: true,
        href: extractedRedirectUrl,
        host: parseHostname(extractedRedirectUrl),
        directNavAttempted,
        directNavSucceeded,
        extractedRedirectUrl,
        extractedRedirectSource,
        extractedRedirectHtmlRead,
        extractedRedirectFailureReason,
        extractedRedirectNavAttempted,
        extractedRedirectNavSucceeded,
        urlAfter: activePage.url(),
      } satisfies AdzunaFallbackLinkResult;

      console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
        adzunaFallbackLinkFound: extractedResult.found,
        adzunaFallbackLinkClicked: extractedResult.clicked,
        adzunaFallbackLinkText: extractedResult.text ?? null,
        adzunaFallbackLocatorStrategy:
          extractedResult.locatorStrategy ?? null,
        adzunaFallbackElementFound: extractedResult.elementFound,
        adzunaFallbackClickSucceeded: extractedResult.clickSucceeded,
        adzunaFallbackHref: extractedResult.href ?? null,
        adzunaFallbackHost: extractedResult.host ?? null,
        adzunaFallbackDirectNavAttempted:
          extractedResult.directNavAttempted,
        adzunaFallbackDirectNavSucceeded:
          extractedResult.directNavSucceeded,
        adzunaExtractedRedirectUrl:
          extractedResult.extractedRedirectUrl ?? null,
        adzunaExtractedRedirectSource:
          extractedResult.extractedRedirectSource ?? null,
        adzunaExtractedRedirectHtmlRead:
          extractedResult.extractedRedirectHtmlRead,
        adzunaExtractedRedirectFailureReason:
          extractedResult.extractedRedirectFailureReason ?? [],
        adzunaExtractedRedirectNavAttempted:
          extractedResult.extractedRedirectNavAttempted,
        adzunaExtractedRedirectNavSucceeded:
          extractedResult.extractedRedirectNavSucceeded,
        adzunaFallbackUrlAfter: extractedResult.urlAfter ?? null,
        currentUrl: activePage.url(),
      });

      return extractedResult;
    }
  }

  const target = await findAdzunaFallbackLinkTarget(activePage);

  console.log("[AUTO_APPLY_ADZUNA_FALLBACK_LOCATOR]", {
    adzunaFallbackElementFound: Boolean(target),
    adzunaFallbackLocatorStrategy: target?.locatorStrategy ?? null,
    adzunaFallbackSelector: target?.selector ?? null,
    adzunaFallbackText: target?.text ?? null,
    adzunaFallbackHref: target?.href ?? null,
    adzunaFallbackHost: parseHostname(target?.href) || null,
    currentUrl: activePage.url(),
  });

  attempts.push({
    phase: "handoff",
    action: "scan",
    selector: target?.selector ?? "a[href]:has-text(view ad here)",
    text: target?.text ?? "",
    matchedText: target?.matchedText ?? "view ad here",
    locatorStrategy:
      target?.locatorStrategy ?? "adzuna_fallback_locator_search",
    candidateFound: Boolean(target),
    dismissesBlocker: false,
    success: Boolean(target),
    urlBefore: fromUrl,
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (!target) {
    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      found: false,
      clicked: false,
      locatorStrategy: undefined,
      elementFound: false,
      clickSucceeded: false,
      directNavAttempted,
      directNavSucceeded,
      extractedRedirectUrl,
      extractedRedirectSource,
      extractedRedirectHtmlRead,
      extractedRedirectFailureReason,
      extractedRedirectNavAttempted,
      extractedRedirectNavSucceeded,
      urlAfter: activePage.url(),
    } satisfies AdzunaFallbackLinkResult;

    console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
      adzunaFallbackLinkFound: result.found,
      adzunaFallbackLinkClicked: result.clicked,
      adzunaFallbackLinkText: null,
      adzunaFallbackLocatorStrategy: null,
      adzunaFallbackElementFound: result.elementFound,
      adzunaFallbackClickSucceeded: result.clickSucceeded,
      adzunaFallbackHref: null,
      adzunaFallbackHost: null,
      adzunaFallbackDirectNavAttempted: result.directNavAttempted,
      adzunaFallbackDirectNavSucceeded: result.directNavSucceeded,
      adzunaExtractedRedirectUrl: result.extractedRedirectUrl ?? null,
      adzunaExtractedRedirectSource:
        result.extractedRedirectSource ?? null,
      adzunaExtractedRedirectHtmlRead:
        result.extractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        result.extractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted:
        result.extractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded:
        result.extractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter: result.urlAfter ?? null,
      currentUrl: activePage.url(),
    });

    return result;
  }

  const popupPromise = activePage
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = activePage
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_ADZUNA_FALLBACK] attempting", {
    selector: target.selector,
    text: target.text,
    locatorStrategy: target.locatorStrategy,
    adzunaFallbackHref: target.href ?? null,
    adzunaFallbackHost: parseHostname(target.href) || null,
    currentUrl: fromUrl,
  });

  try {
    await target.locator
      .click({ timeout: 6_000 })
      .catch(() => target.locator.click({ force: true, timeout: 6_000 }));
  } catch {
    if (target.href) {
      const directNavResult = await navigateAdzunaFallbackHrefDirectly({
        page: activePage,
        context: args.context,
        href: target.href,
        onPageReady: args.onPageReady,
      });

      activePage = directNavResult.page;
      directNavAttempted = directNavResult.attempted;
      directNavSucceeded = directNavResult.succeeded;

      for (const url of directNavResult.urlsVisited) {
        if (!urlsVisited.includes(url)) {
          urlsVisited.push(url);
        }
      }
    }

    attempts.push({
      phase: "handoff",
      action: "click",
      selector: target.selector,
      text: target.text,
      matchedText: target.matchedText,
      locatorStrategy: target.locatorStrategy,
      candidateFound: true,
      dismissesBlocker: false,
      success: false,
      urlBefore: fromUrl,
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);

    const failedResult = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      found: true,
      clicked: directNavSucceeded,
      text: target.text,
      selector: target.selector,
      locatorStrategy: target.locatorStrategy,
      elementFound: true,
      clickSucceeded: directNavSucceeded,
      href: target.href,
      host: parseHostname(target.href),
      directNavAttempted,
      directNavSucceeded,
      extractedRedirectUrl,
      extractedRedirectSource,
      extractedRedirectHtmlRead,
      extractedRedirectFailureReason,
      extractedRedirectNavAttempted,
      extractedRedirectNavSucceeded,
      urlAfter: activePage.url(),
    } satisfies AdzunaFallbackLinkResult;

    console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
      adzunaFallbackLinkFound: failedResult.found,
      adzunaFallbackLinkClicked: failedResult.clicked,
      adzunaFallbackLinkText: failedResult.text ?? null,
      adzunaFallbackLocatorStrategy: failedResult.locatorStrategy ?? null,
      adzunaFallbackElementFound: failedResult.elementFound,
      adzunaFallbackClickSucceeded: failedResult.clickSucceeded,
      adzunaFallbackHref: failedResult.href ?? null,
      adzunaFallbackHost: failedResult.host ?? null,
      adzunaFallbackDirectNavAttempted: failedResult.directNavAttempted,
      adzunaFallbackDirectNavSucceeded: failedResult.directNavSucceeded,
      adzunaExtractedRedirectUrl:
        failedResult.extractedRedirectUrl ?? null,
      adzunaExtractedRedirectSource:
        failedResult.extractedRedirectSource ?? null,
      adzunaExtractedRedirectHtmlRead:
        failedResult.extractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        failedResult.extractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted:
        failedResult.extractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded:
        failedResult.extractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter: failedResult.urlAfter ?? null,
      currentUrl: activePage.url(),
    });

    return failedResult;
  }

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);

  let nextPage = activePage;
  let navigation: ApplySessionClickRecord["navigation"] = "same-tab";

  if (popupPage) {
    nextPage = popupPage;
    navigation = "popup";
  } else if (contextPage && contextPage !== activePage) {
    nextPage = contextPage;
    navigation = "new-page";
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  clicks.push({
    hop: 1,
    fromUrl,
    toUrl: nextPage.url(),
    selector: target.selector,
    text: target.text,
    navigation,
  } satisfies ApplySessionClickRecord);

  attempts.push({
    phase: "handoff",
    action: "click",
    selector: target.selector,
    text: target.text,
    matchedText: target.matchedText,
    locatorStrategy: target.locatorStrategy,
    candidateFound: true,
    dismissesBlocker: false,
    success: true,
    urlBefore: fromUrl,
    urlAfter: nextPage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  const progress = await waitForPostClickProgress({
    page: nextPage,
    context: args.context,
    urlBefore: fromUrl,
    onPageReady: args.onPageReady,
  });

  activePage = progress.page;
  if (!urlsVisited.includes(activePage.url())) {
    urlsVisited.push(activePage.url());
  }

  const chainedProgress = await waitForTrackedHandoffRedirects({
    page: activePage,
    context: args.context,
    onPageReady: args.onPageReady,
  });

  activePage = chainedProgress.page;
  for (const url of chainedProgress.urlsVisited) {
    if (!urlsVisited.includes(url)) {
      urlsVisited.push(url);
    }
  }

  let fallbackProgressed =
    progress.urlChanged ||
    (!isAdzunaLandRedirectPage(activePage.url()) &&
      !isAppcastTrackingPage(activePage.url())) ||
    (await hasReachedPostHandoffDestination(activePage));

  if (
    !fallbackProgressed &&
    target.href &&
    isAdzunaLandRedirectPage(activePage.url())
  ) {
    const directNavResult = await navigateAdzunaFallbackHrefDirectly({
      page: activePage,
      context: args.context,
      href: target.href,
      onPageReady: args.onPageReady,
    });

    activePage = directNavResult.page;
    directNavAttempted = directNavResult.attempted;
    directNavSucceeded = directNavResult.succeeded;

    for (const url of directNavResult.urlsVisited) {
      if (!urlsVisited.includes(url)) {
        urlsVisited.push(url);
      }
    }

    fallbackProgressed =
      fallbackProgressed ||
      directNavSucceeded ||
      (await hasReachedPostHandoffDestination(activePage));
  }

  const result = {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    found: true,
    clicked: fallbackProgressed,
    text: target.text,
    selector: target.selector,
    locatorStrategy: target.locatorStrategy,
    elementFound: true,
    clickSucceeded: fallbackProgressed,
    href: target.href,
    host: parseHostname(target.href),
    directNavAttempted,
    directNavSucceeded,
    extractedRedirectUrl,
    extractedRedirectSource,
    extractedRedirectHtmlRead,
    extractedRedirectFailureReason,
    extractedRedirectNavAttempted,
    extractedRedirectNavSucceeded,
    urlAfter: activePage.url(),
  } satisfies AdzunaFallbackLinkResult;

  console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
    adzunaFallbackLinkFound: result.found,
    adzunaFallbackLinkClicked: result.clicked,
    adzunaFallbackLinkText: result.text ?? null,
    adzunaFallbackLocatorStrategy: result.locatorStrategy ?? null,
    adzunaFallbackElementFound: result.elementFound,
    adzunaFallbackClickSucceeded: result.clickSucceeded,
    adzunaFallbackHref: result.href ?? null,
    adzunaFallbackHost: result.host ?? null,
    adzunaFallbackDirectNavAttempted: result.directNavAttempted,
    adzunaFallbackDirectNavSucceeded: result.directNavSucceeded,
    adzunaExtractedRedirectUrl: result.extractedRedirectUrl ?? null,
    adzunaExtractedRedirectSource:
      result.extractedRedirectSource ?? null,
    adzunaExtractedRedirectHtmlRead:
      result.extractedRedirectHtmlRead,
    adzunaExtractedRedirectFailureReason:
      result.extractedRedirectFailureReason ?? [],
    adzunaExtractedRedirectNavAttempted:
      result.extractedRedirectNavAttempted,
    adzunaExtractedRedirectNavSucceeded:
      result.extractedRedirectNavSucceeded,
    adzunaFallbackUrlAfter: result.urlAfter ?? null,
    currentUrl: activePage.url(),
  });

  return result;
}

function normalizeResolverPathname(pathname: string) {
  const normalized = pathname.trim().toLowerCase().replace(/\/{2,}/g, "/");
  if (!normalized) return "/";
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function looksLikeLowValueResolverText(value: string) {
  const normalized = value.toLowerCase();
  return LOW_VALUE_RESOLVER_TEXT_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function looksLikeJobSpecificDestination(pathname: string) {
  const normalized = normalizeResolverPathname(pathname);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  if (
    ["/apply", "/application"].includes(normalized) ||
    normalized.includes("/apply/") ||
    normalized.includes("/application/")
  ) {
    return true;
  }

  if (
    normalized.includes("/job/") ||
    normalized.includes("/vacancy/") ||
    normalized.includes("/posting/")
  ) {
    return true;
  }

  if (segments.some((segment) => /^\d{5,}$/.test(segment))) {
    return true;
  }

  if (normalized.includes("/jobs/")) {
    const lastSegment = segments.at(-1) ?? "";
    return !LOW_VALUE_AGGREGATOR_SEGMENTS.has(lastSegment);
  }

  return false;
}

function isLowValueAggregatorLink(args: {
  currentUrl: string;
  currentHostname: string;
  href: string;
  hostname: string;
  pathname: string;
  search: string;
  text: string;
  inHeaderOrFooter: boolean;
  inMainContent: boolean;
}) {
  const currentDomain = detectApplyDomainFromHostname(args.currentHostname);
  const candidateDomain = detectApplyDomainFromHostname(args.hostname);
  const sameAggregatorFamily =
    currentDomain !== "generic" && currentDomain === candidateDomain;
  const normalizedPath = normalizeResolverPathname(args.pathname);
  const lowerHref = args.href.toLowerCase();
  const lowerText = args.text.toLowerCase();
  const lowerSearch = args.search.toLowerCase();
  const segments = normalizedPath.split("/").filter(Boolean);
  const lastSegment = segments.at(-1) ?? "";

  if (!args.href.startsWith("http://") && !args.href.startsWith("https://")) {
    return "unsupported_link_scheme";
  }

  if (args.href === args.currentUrl) {
    return "current_page";
  }

  if (
    looksLikeLowValueResolverText(`${lowerHref} ${lowerText}`) ||
    lowerHref.includes("job-alert") ||
    lowerHref.includes("create-alert") ||
    lowerHref.includes("save-job") ||
    lowerHref.includes("share")
  ) {
    return "alert_share_or_save_link";
  }

  if (sameAggregatorFamily && args.inHeaderOrFooter && !args.inMainContent) {
    return "aggregator_navigation_link";
  }

  if (sameAggregatorFamily && LOW_VALUE_AGGREGATOR_PATHS.has(normalizedPath)) {
    return "generic_aggregator_page";
  }

  if (
    sameAggregatorFamily &&
    segments.length <= 2 &&
    segments.some((segment) => LOW_VALUE_AGGREGATOR_SEGMENTS.has(segment))
  ) {
    return "generic_aggregator_listing_path";
  }

  if (
    sameAggregatorFamily &&
    (lowerSearch.includes("q=") ||
      lowerSearch.includes("search=") ||
      lowerSearch.includes("keyword=") ||
      lowerSearch.includes("page="))
  ) {
    return "aggregator_search_results";
  }

  if (
    sameAggregatorFamily &&
    (lastSegment === "index" || lastSegment === "home")
  ) {
    return "aggregator_home_or_index";
  }

  if (
    sameAggregatorFamily &&
    !(
      lowerHref.includes("redirect") ||
      lowerHref.includes("outbound") ||
      lowerHref.includes("external") ||
      lowerSearch.includes("url=")
    ) &&
    !looksLikeJobSpecificDestination(normalizedPath) &&
    !lowerHref.includes("apply") &&
    !lowerHref.includes("application")
  ) {
    return "same_aggregator_non_job_destination";
  }

  return null;
}

function rankApplySourceCandidate(args: {
  currentHostname: string;
  href: string;
  hostname: string;
  pathname: string;
  text: string;
  inMainContent: boolean;
  inHeaderOrFooter: boolean;
  visible: boolean;
}) {
  const currentDomain = detectApplyDomainFromHostname(args.currentHostname);
  const candidateDomain = detectApplyDomainFromHostname(args.hostname);
  const sameAggregatorFamily =
    currentDomain !== "generic" && currentDomain === candidateDomain;
  const signalText = `${args.href} ${args.text}`.toLowerCase();
  const normalizedPath = normalizeResolverPathname(args.pathname);
  const reasons: string[] = [];
  let score = 0;

  if (args.visible) {
    score += 20;
    reasons.push("visible");
  }

  if (args.inMainContent) {
    score += 70;
    reasons.push("main_content");
  }

  if (args.inHeaderOrFooter) {
    score -= 80;
    reasons.push("header_or_footer");
  }

  if (!sameAggregatorFamily) {
    score += 220;
    reasons.push("leaves_aggregator_family");
  } else {
    score -= 120;
    reasons.push("same_aggregator_family");
  }

  if (
    signalText.includes("redirect") ||
    signalText.includes("outbound") ||
    signalText.includes("external") ||
    signalText.includes("url=")
  ) {
    score += 120;
    reasons.push("redirect_handoff");
  }

  if (hostnameMatches(args.hostname, REAL_APPLY_HOST_PATTERNS)) {
    score += 160;
    reasons.push("known_apply_host");
  }

  for (const keyword of APPLY_SOURCE_RESOLVER_KEYWORDS) {
    if (!signalText.includes(keyword)) continue;

    if (keyword === "apply" || keyword === "apply now" || keyword === "application") {
      score += 120;
      reasons.push(`keyword:${keyword}`);
    } else if (keyword === "external") {
      score += 60;
      reasons.push(`keyword:${keyword}`);
    } else {
      score += 30;
      reasons.push(`keyword:${keyword}`);
    }
  }

  if (
    normalizedPath.includes("/apply") ||
    normalizedPath.includes("/application") ||
    normalizedPath.includes("apply-now")
  ) {
    score += 160;
    reasons.push("apply_path");
  }

  if (looksLikeJobSpecificDestination(normalizedPath)) {
    score += 90;
    reasons.push("job_specific_path");
  }

  if (signalText.includes("company site")) {
    score += 80;
    reasons.push("company_site_text");
  }

  return {
    href: args.href,
    hostname: args.hostname,
    text: args.text,
    score,
    reasons,
  } satisfies ApplySourceCandidate;
}

function buildEntryCtaConfigs(domain: KnownApplyDomain): EntryCtaConfig[] {
  const generic: EntryCtaConfig[] = [
    { text: "Continue to application", match: "exact", preferredRole: "button" },
    { text: "Apply now", match: "exact", preferredRole: "button" },
    { text: "Apply", match: "exact", preferredRole: "button" },
    { text: "Continue", match: "exact", preferredRole: "button" },
    { text: "Go to job", match: "exact", preferredRole: "link" },
    { text: "View job", match: "exact", preferredRole: "link" },
    { text: "Skip", match: "exact", dismissesBlocker: true },
    { text: "Dismiss", match: "exact", dismissesBlocker: true },
    { text: "Close", match: "exact", dismissesBlocker: true },
  ];

  if (domain === "adzuna") {
    // Adzuna commonly gates the outbound posting behind dismiss / continue prompts.
    return [
      {
        text: "No thanks, take me to the job",
        match: "exact",
        dismissesBlocker: true,
      },
      { text: "No, thanks", match: "exact", dismissesBlocker: true },
      { text: "No thanks", match: "exact", dismissesBlocker: true },
      { text: "take me to the job", match: "contains", dismissesBlocker: true },
      ...generic,
    ];
  }

  if (domain === "dice") {
    // Dice typically exposes the real application handoff via a visible Apply Now CTA.
    return [
      { text: "Apply Now", match: "exact", preferredRole: "button" },
      { text: "Apply now", match: "exact", preferredRole: "button" },
      ...generic,
    ];
  }

  return generic;
}

function buildHandoffCtaConfigs(): EntryCtaConfig[] {
  return [
    {
      text: "Apply for this job",
      match: "exact",
      preferredRole: "button",
    },
    { text: "Apply now", match: "exact", preferredRole: "button" },
    { text: "Continue to application", match: "exact", preferredRole: "button" },
    { text: "Visit employer site", match: "exact", preferredRole: "link" },
    { text: "Go to application", match: "exact", preferredRole: "button" },
    { text: "Open job site", match: "exact", preferredRole: "link" },
    { text: "Continue", match: "exact", preferredRole: "button" },
    { text: "Proceed", match: "exact", preferredRole: "button" },
    { text: "Next", match: "exact", preferredRole: "button" },
  ];
}

function buildCookieCtaConfigs(): EntryCtaConfig[] {
  return [
    { text: "Accept all", match: "exact", preferredRole: "button" },
    { text: "Allow all", match: "exact", preferredRole: "button" },
    { text: "Accept", match: "exact", preferredRole: "button" },
    { text: "I agree", match: "exact", preferredRole: "button" },
    { text: "Got it", match: "exact", preferredRole: "button" },
    { text: "OK", match: "exact", preferredRole: "button" },
  ];
}

async function scanCookiePromptConfigs(
  page: Page,
): Promise<ApplySessionCtaAttemptRecord[]> {
  const currentUrl = page.url();
  const configs = buildCookieCtaConfigs().map((config) => ({
    ...config,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
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

        function getConsentContext(element: Element) {
          const container =
            element.closest(
              [
                '[id*="cookie"]',
                '[class*="cookie"]',
                '[data-testid*="cookie"]',
                '[data-testid*="consent"]',
                '[id*="consent"]',
                '[class*="consent"]',
                '[aria-label*="cookie"]',
                '[aria-label*="consent"]',
                "footer",
                '[role="dialog"]',
                '[aria-modal="true"]',
              ].join(","),
            ) ?? element.parentElement;

          const text = [
            container?.textContent ?? "",
            container?.getAttribute?.("aria-label") ?? "",
            container?.getAttribute?.("data-testid") ?? "",
            container?.getAttribute?.("id") ?? "",
            container?.getAttribute?.("class") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

          const hasConsentContext = args.contextPatterns.some((pattern) =>
            text.includes(pattern),
          );

          return {
            text,
            hasConsentContext,
          };
        }

        const nodes = Array.from(
          document.querySelectorAll(
            "a, button, input[type='submit'], input[type='button'], [role='button']",
          ),
        ).filter(isVisible);

        return args.configs.map((config) => {
          const match = nodes.find((element) => {
            const text = getText(element).replace(/\s+/g, " ").trim().toLowerCase();
            if (!text) return false;
            if (args.ignorePatterns.some((pattern) => text.includes(pattern))) {
              return false;
            }

            const context = getConsentContext(element);
            if (!context.hasConsentContext) {
              return false;
            }

            return config.match === "exact"
              ? text === config.textLower
              : text.includes(config.textLower);
          });

          const matchedText = match
            ? getText(match).replace(/\s+/g, " ").trim().slice(0, 160)
            : "";

          return {
            phase: "cookie",
            action: "scan",
            selector: match ? buildCssPath(match) : `text=${config.text}`,
            text: matchedText,
            matchedText: config.text,
            locatorStrategy: `visible_text_${config.match}`,
            candidateFound: Boolean(match),
            dismissesBlocker: true,
            success: Boolean(match),
            urlBefore: args.currentUrl,
            urlAfter: args.currentUrl,
          };
        });
      },
      {
        configs,
        currentUrl,
        contextPatterns: [...COOKIE_CONTEXT_PATTERNS],
        ignorePatterns: [...COOKIE_CTA_IGNORE_PATTERNS],
      },
    )
    .catch(() => []);
}

async function findCookiePromptCandidate(
  page: Page,
): Promise<EntryCtaCandidate | null> {
  const configs = buildCookieCtaConfigs().map((config, index) => ({
    ...config,
    priority: index,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
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

        function getConsentContext(element: Element) {
          const container =
            element.closest(
              [
                '[id*="cookie"]',
                '[class*="cookie"]',
                '[data-testid*="cookie"]',
                '[data-testid*="consent"]',
                '[id*="consent"]',
                '[class*="consent"]',
                '[aria-label*="cookie"]',
                '[aria-label*="consent"]',
                "footer",
                '[role="dialog"]',
                '[aria-modal="true"]',
              ].join(","),
            ) ?? element.parentElement;

          const text = [
            container?.textContent ?? "",
            container?.getAttribute?.("aria-label") ?? "",
            container?.getAttribute?.("data-testid") ?? "",
            container?.getAttribute?.("id") ?? "",
            container?.getAttribute?.("class") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

          return {
            text,
            hasConsentContext: args.contextPatterns.some((pattern) =>
              text.includes(pattern),
            ),
            inBlocker: args.blockerSelectors.some((selector) =>
              element.closest(selector),
            ),
          };
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
            if (
              args.ignorePatterns.some((pattern) => lowerText.includes(pattern))
            ) {
              return null;
            }

            const context = getConsentContext(element);
            if (!context.hasConsentContext) {
              return null;
            }

            const tagName = element.tagName.toLowerCase();
            const roleAttr = element.getAttribute("role")?.toLowerCase() ?? "";
            const semanticRole =
              tagName === "a"
                ? "link"
                : tagName === "button" ||
                    tagName === "input" ||
                    roleAttr === "button"
                  ? "button"
                  : "any";

            let bestMatch:
              | (EntryCtaCandidate & { score: number; priority: number })
              | null = null;

            for (const config of args.configs) {
              const matches =
                config.match === "exact"
                  ? lowerText === config.textLower
                  : lowerText.includes(config.textLower);
              if (!matches) continue;

              let score = 1000 - config.priority * 30;
              if (config.match === "exact") score += 140;
              if (semanticRole === config.preferredRole) score += 70;
              if (semanticRole === "button") score += 20;
              if (context.inBlocker) score += 60;
              if (context.text.includes("cookie")) score += 90;
              if (context.text.includes("consent")) score += 70;
              if (context.text.includes("privacy")) score += 40;

              const candidate = {
                selector: buildCssPath(element),
                text: rawText.slice(0, 160),
                matchedText: config.text,
                dismissesBlocker: true,
                score,
                priority: config.priority,
              };

              if (!bestMatch || candidate.score > bestMatch.score) {
                bestMatch = candidate;
              }
            }

            return bestMatch;
          })
          .filter(
            (
              candidate,
            ): candidate is EntryCtaCandidate & { score: number; priority: number } =>
              candidate !== null,
          );

        candidates.sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.priority - right.priority;
        });

        return (candidates[0] as EntryCtaCandidate | undefined) ?? null;
      },
      {
        configs,
        blockerSelectors: [...BLOCKER_SURFACE_SELECTORS],
        contextPatterns: [...COOKIE_CONTEXT_PATTERNS],
        ignorePatterns: [...COOKIE_CTA_IGNORE_PATTERNS],
      },
    )
    .catch(() => null);
}

async function clickCookiePromptCandidate(args: {
  page: Page;
  context: BrowserContext;
  candidate: EntryCtaCandidate;
  step: number;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const fromUrl = args.page.url();
  const locator = args.page.locator(args.candidate.selector).first();
  const popupPromise = args.page
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_COOKIE] attempting", {
    step: args.step,
    fromUrl,
    selector: args.candidate.selector,
    text: args.candidate.text,
    matchedText: args.candidate.matchedText,
  });

  try {
    await locator
      .click({ timeout: 5_000 })
      .catch(() => locator.click({ force: true, timeout: 5_000 }));
  } catch {
    return {
      page: args.page,
      click: null,
      attempt: {
        phase: "cookie",
        action: "click",
        selector: args.candidate.selector,
        text: args.candidate.text,
        matchedText: args.candidate.matchedText,
        locatorStrategy: "visible_text_ranked",
        candidateFound: true,
        dismissesBlocker: true,
        success: false,
        urlBefore: fromUrl,
        urlAfter: args.page.url(),
      } satisfies ApplySessionCtaAttemptRecord,
    };
  }

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
      hop: args.step,
      fromUrl,
      toUrl: nextPage.url(),
      selector: args.candidate.selector,
      text: args.candidate.text,
      navigation,
    } satisfies ApplySessionClickRecord,
    attempt: {
      phase: "cookie",
      action: "click",
      selector: args.candidate.selector,
      text: args.candidate.text,
      matchedText: args.candidate.matchedText,
      locatorStrategy: "visible_text_ranked",
      candidateFound: true,
      dismissesBlocker: true,
      success: true,
      urlBefore: fromUrl,
      urlAfter: nextPage.url(),
    } satisfies ApplySessionCtaAttemptRecord,
  };
}

async function waitForPostClickProgress(args: {
  page: Page;
  context: BrowserContext;
  urlBefore: string;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<PostClickProgressResult> {
  const page = args.page;
  const titleBefore = await page.title().catch(() => "");

  const settledSignal = await Promise.race([
    page
      .waitForURL((url) => url.toString() !== args.urlBefore, {
        timeout: 5_000,
      })
      .then(() => "url_changed")
      .catch(() => null),
    page
      .waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 5_000,
      })
      .then(() => "navigation")
      .catch(() => null),
    page
      .waitForLoadState("networkidle", {
        timeout: 4_000,
      })
      .then(() => "networkidle")
      .catch(() => null),
    page
      .waitForTimeout(APPLY_SETTLE_DELAY_MS + 800)
      .then(() => "timeout"),
  ]);

  await waitForDomAndSettle(page);
  await args.onPageReady?.(page, args.context);

  const urlAfter = page.url();
  const titleAfter = (await page.title().catch(() => "")).trim();
  const urlChanged = urlAfter !== args.urlBefore;
  const progressDetected =
    urlChanged ||
    titleBefore.trim() !== titleAfter ||
    (settledSignal !== null && settledSignal !== "timeout");

  const result = {
    page,
    attempted: true,
    urlBefore: args.urlBefore,
    urlAfter,
    titleAfter: titleAfter || undefined,
    urlChanged,
    progressDetected,
  } satisfies PostClickProgressResult;

  console.log("[AUTO_APPLY_POST_COOKIE]", {
    postCookieUrlBefore: result.urlBefore,
    postCookieUrlAfter: result.urlAfter,
    postCookieUrlChanged: result.urlChanged,
    postCookieProgressDetected: result.progressDetected,
    postCookieTitleAfter: result.titleAfter ?? null,
    currentUrl: page.url(),
  });

  return result;
}

async function dismissCookieConsentIfPresent(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<CookieConsentPhaseResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const seenCandidates = new Set<string>();
  const seenScanAttempts = new Set<string>();
  let detected = false;
  let clicked = false;
  let clickedText: string | undefined;
  let clickedSelector: string | undefined;
  let postCookieWaitAttempted = false;
  let postCookieUrlBefore: string | undefined;
  let postCookieUrlAfter: string | undefined;
  let postCookieUrlChanged = false;
  let postCookieProgressDetected = false;
  let postCookieTitleAfter: string | undefined;

  for (let step = 1; step <= COOKIE_CTA_MAX_STEPS; step += 1) {
    const scanAttempts = await scanCookiePromptConfigs(activePage);
    for (const scanAttempt of scanAttempts) {
      const signature = `${scanAttempt.urlBefore}|${scanAttempt.matchedText}|${scanAttempt.action}`;
      if (seenScanAttempts.has(signature)) continue;
      seenScanAttempts.add(signature);
      attempts.push(scanAttempt);
      if (scanAttempt.candidateFound) {
        detected = true;
      }
    }

    const candidate = await findCookiePromptCandidate(activePage);
    if (!candidate) {
      break;
    }
    detected = true;

    const signature = `${activePage.url()}|${candidate.selector}|${candidate.text}`;
    if (seenCandidates.has(signature)) {
      break;
    }
    seenCandidates.add(signature);

    const result = await clickCookiePromptCandidate({
      page: activePage,
      context: args.context,
      candidate,
      step,
      onPageReady: args.onPageReady,
    });

    attempts.push(result.attempt);
    activePage = result.page;
    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    if (result.click) {
      clicks.push(result.click);
      clicked = true;
      clickedText = candidate.text;
      clickedSelector = candidate.selector;

      const progress = await waitForPostClickProgress({
        page: activePage,
        context: args.context,
        urlBefore: result.attempt.urlAfter ?? result.attempt.urlBefore,
        onPageReady: args.onPageReady,
      });

      activePage = progress.page;
      postCookieWaitAttempted = progress.attempted;
      postCookieUrlBefore = progress.urlBefore;
      postCookieUrlAfter = progress.urlAfter;
      postCookieUrlChanged = progress.urlChanged;
      postCookieProgressDetected = progress.progressDetected;
      postCookieTitleAfter = progress.titleAfter;

      if (!urlsVisited.includes(activePage.url())) {
        urlsVisited.push(activePage.url());
      }
    }
  }

  console.log("[AUTO_APPLY_COOKIE]", {
    currentUrl: activePage.url(),
    cookiePromptDetected: detected,
    cookiePromptClicked: clicked,
    cookiePromptClickedText: clickedText ?? null,
    cookiePromptSelector: clickedSelector ?? null,
    cookiePromptAttempts: attempts,
    postCookieWaitAttempted,
    postCookieUrlBefore: postCookieUrlBefore ?? null,
    postCookieUrlAfter: postCookieUrlAfter ?? null,
    postCookieUrlChanged,
    postCookieProgressDetected,
    postCookieTitleAfter: postCookieTitleAfter ?? null,
  });

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    detected,
    clicked,
    clickedText,
    clickedSelector,
    postCookieWaitAttempted,
    postCookieUrlBefore,
    postCookieUrlAfter,
    postCookieUrlChanged,
    postCookieProgressDetected,
    postCookieTitleAfter,
  };
}

async function runAdzunaDetailsApplyPhase(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<AdzunaDetailsApplyPhaseResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const applyClicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  let applyClicked = false;
  let applyClickedText: string | undefined;
  let applyClickedSelector: string | undefined;
  let applyCaptureDetected = false;
  let applyCaptureSkipClicked = false;
  let applyCaptureSkipText: string | undefined;
  let applyCaptureSkipSelector: string | undefined;
  let postApplyProgressionAttempted = false;
  let postApplyProgressionSucceeded = false;
  let postApplyUrlAfter: string | undefined;
  let postApplyPopupDetected = false;
  let postApplyNewPageDetected = false;
  let postApplyFallbackAttempted = false;
  let latestActionText: string | undefined;
  let latestActionSelector: string | undefined;

  if (!isAdzunaDetailsPage(activePage.url())) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: false,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      postApplyProgressionAttempted,
      postApplyProgressionSucceeded,
      postApplyUrlAfter,
      postApplyPopupDetected,
      postApplyNewPageDetected,
      postApplyFallbackAttempted,
      latestActionText,
      latestActionSelector,
    };
  }

  const applySelector = 'a[data-js="apply"]';
  const applyLocator = await findFirstVisibleEnabledLocator(
    activePage.locator(applySelector),
  );

  attempts.push({
    phase: "entry",
    action: "scan",
    selector: applySelector,
    text: applySelector,
    matchedText: "Apply for this job",
    locatorStrategy: "css_data_js",
    candidateFound: Boolean(applyLocator),
    dismissesBlocker: false,
    success: Boolean(applyLocator),
    urlBefore: activePage.url(),
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (!applyLocator) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: false,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      latestActionText,
      latestActionSelector,
    };
  }

  const fromUrl = activePage.url();
  const applyText =
    (await extractLocatorText(applyLocator).catch(() => "")) ||
    "Apply for this job";
  const applyHref = resolveAbsoluteNavigationTarget(
    await applyLocator.getAttribute("href").catch(() => null),
    fromUrl,
  );
  const applyCaptureFormSelector = 'div[data-js="apply-capture-form"]';
  const applyCaptureSkipSelectorRaw = 'a[data-js="apply-capture-skip"]';
  const applyCaptureFormLocator = activePage.locator(applyCaptureFormSelector);
  const applyCaptureSkipLocator = activePage.locator(
    applyCaptureSkipSelectorRaw,
  );

  console.log("[AUTO_APPLY_ADZUNA_DETAILS_APPLY] attempting", {
    fromUrl,
    selector: applySelector,
    text: applyText,
    href: applyHref ?? null,
  });

  const applyPopupPromise = activePage
    .waitForEvent("popup", { timeout: 7_500 })
    .catch(() => null);
  const applyContextPagePromise = args.context
    .waitForEvent("page", { timeout: 7_500 })
    .catch(() => null);
  const applyNavigationPromise = activePage
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 7_500 })
    .catch(() => null);

  try {
    await applyLocator
      .click({ timeout: 6_000 })
      .catch(() => applyLocator.click({ force: true, timeout: 6_000 }));
  } catch {
    attempts.push({
      phase: "entry",
      action: "click",
      selector: applySelector,
      text: applyText,
      matchedText: "Apply for this job",
      locatorStrategy: "css_data_js",
      candidateFound: true,
      dismissesBlocker: false,
      success: false,
      urlBefore: fromUrl,
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);

    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: true,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      postApplyProgressionAttempted,
      postApplyProgressionSucceeded,
      postApplyUrlAfter,
      postApplyPopupDetected,
      postApplyNewPageDetected,
      postApplyFallbackAttempted,
      latestActionText,
      latestActionSelector,
    };
  }

  postApplyProgressionAttempted = true;
  await Promise.race([
    applyNavigationPromise,
    activePage
      .waitForURL((url) => url.toString() !== fromUrl, {
        timeout: 7_500,
      })
      .catch(() => null),
    applyCaptureSkipLocator
      .first()
      .waitFor({ state: "visible", timeout: 6_500 })
      .catch(() => null),
    applyCaptureFormLocator
      .first()
      .waitFor({ state: "visible", timeout: 6_500 })
      .catch(() => null),
    activePage.waitForTimeout(APPLY_SETTLE_DELAY_MS + 2_000),
  ]);
  const [popupPage, contextPage] = await Promise.all([
    applyPopupPromise,
    applyContextPagePromise,
  ]);

  if (popupPage) {
    activePage = popupPage;
    postApplyNewPageDetected = true;
  } else if (contextPage && contextPage !== activePage) {
    activePage = contextPage;
    postApplyNewPageDetected = true;
  }

  await waitForDomAndSettle(activePage);
  await args.onPageReady?.(activePage, args.context);

  const applyToUrl = activePage.url();
  postApplyUrlAfter = applyToUrl;
  const applyClick = {
    hop: 1,
    fromUrl,
    toUrl: applyToUrl,
    selector: applySelector,
    text: applyText,
    navigation: "same-tab",
  } satisfies ApplySessionClickRecord;

  clicks.push(applyClick);
  applyClicks.push(applyClick);
  applyClicked = true;
  applyClickedText = applyText;
  applyClickedSelector = applySelector;
  latestActionText = applyText;
  latestActionSelector = applySelector;

  attempts.push({
    phase: "entry",
    action: "click",
    selector: applySelector,
    text: applyText,
    matchedText: "Apply for this job",
    locatorStrategy: "css_data_js",
    candidateFound: true,
    dismissesBlocker: false,
    success: true,
    urlBefore: fromUrl,
    urlAfter: applyToUrl,
    applyCtaFoundAfter: true,
  } satisfies ApplySessionCtaAttemptRecord);

  if (!urlsVisited.includes(applyToUrl)) {
    urlsVisited.push(applyToUrl);
  }

  applyCaptureDetected =
    (await isVisibleLocator(applyCaptureFormLocator)) ||
    (await isVisibleLocator(applyCaptureSkipLocator));
  postApplyPopupDetected = applyCaptureDetected;
  postApplyProgressionSucceeded =
    postApplyNewPageDetected ||
    applyCaptureDetected ||
    isAdzunaLandRedirectPage(applyToUrl) ||
    applyToUrl !== fromUrl;

  console.log("[AUTO_APPLY_ADZUNA_POST_APPLY]", {
    fromUrl,
    currentUrl: applyToUrl,
    selector: applySelector,
    text: applyText,
    href: applyHref ?? null,
    adzunaPostApplyProgressionAttempted: postApplyProgressionAttempted,
    adzunaPostApplyProgressionSucceeded: postApplyProgressionSucceeded,
    adzunaPostApplyUrlAfter: postApplyUrlAfter ?? null,
    adzunaPostApplyPopupDetected: postApplyPopupDetected,
    adzunaPostApplyNewPageDetected: postApplyNewPageDetected,
    handoffPageDetected: isAdzunaLandRedirectPage(applyToUrl),
  });

  if (!postApplyProgressionSucceeded) {
    postApplyFallbackAttempted = true;
    console.log("[AUTO_APPLY_ADZUNA_POST_APPLY_FALLBACK] attempting", {
      currentUrl: activePage.url(),
      href: applyHref ?? null,
      selector: applySelector,
    });

    let fallbackSucceeded = false;

    if (applyHref && applyHref !== activePage.url()) {
      try {
        await activePage.goto(applyHref, { waitUntil: "domcontentloaded" });
        await waitForDomAndSettle(activePage);
        await args.onPageReady?.(activePage, args.context);
        fallbackSucceeded = activePage.url() !== fromUrl;
      } catch {
        fallbackSucceeded = false;
      }

      attempts.push({
        phase: "entry",
        action: "click",
        selector: `href:${applyHref}`,
        text: applyText,
        matchedText: "Apply for this job",
        locatorStrategy: "direct_href_navigation",
        candidateFound: true,
        dismissesBlocker: false,
        success: fallbackSucceeded,
        urlBefore: fromUrl,
        urlAfter: activePage.url(),
      } satisfies ApplySessionCtaAttemptRecord);
    } else {
      const refreshedApplyLocator = await findFirstVisibleEnabledLocator(
        activePage.locator(applySelector),
      );

      if (refreshedApplyLocator) {
        await refreshedApplyLocator.scrollIntoViewIfNeeded().catch(() => undefined);
        const retryPopupPromise = activePage
          .waitForEvent("popup", { timeout: 5_500 })
          .catch(() => null);
        const retryContextPagePromise = args.context
          .waitForEvent("page", { timeout: 5_500 })
          .catch(() => null);
        const retryNavigationPromise = activePage
          .waitForNavigation({
            waitUntil: "domcontentloaded",
            timeout: 5_500,
          })
          .catch(() => null);

        try {
          await refreshedApplyLocator
            .click({ force: true, timeout: 6_000 })
            .catch(() =>
              refreshedApplyLocator.evaluate((element) => {
                if (element instanceof HTMLElement) {
                  element.click();
                }
              }),
            );
        } catch {
          // Ignore and let the fallback evidence show failure.
        }

        await Promise.race([
          retryNavigationPromise,
          activePage
            .waitForURL((url) => url.toString() !== fromUrl, {
              timeout: 5_500,
            })
            .catch(() => null),
          applyCaptureSkipLocator
            .first()
            .waitFor({ state: "visible", timeout: 5_000 })
            .catch(() => null),
          applyCaptureFormLocator
            .first()
            .waitFor({ state: "visible", timeout: 5_000 })
            .catch(() => null),
          activePage.waitForTimeout(APPLY_SETTLE_DELAY_MS + 1_400),
        ]);

        const [retryPopupPage, retryContextPage] = await Promise.all([
          retryPopupPromise,
          retryContextPagePromise,
        ]);

        if (retryPopupPage) {
          activePage = retryPopupPage;
          postApplyNewPageDetected = true;
        } else if (retryContextPage && retryContextPage !== activePage) {
          activePage = retryContextPage;
          postApplyNewPageDetected = true;
        }

        await waitForDomAndSettle(activePage);
        await args.onPageReady?.(activePage, args.context);

        fallbackSucceeded = activePage.url() !== fromUrl;
        attempts.push({
          phase: "entry",
          action: "click",
          selector: applySelector,
          text: applyText,
          matchedText: "Apply for this job",
          locatorStrategy: "css_data_js_force_retry",
          candidateFound: true,
          dismissesBlocker: false,
          success: fallbackSucceeded,
          urlBefore: fromUrl,
          urlAfter: activePage.url(),
        } satisfies ApplySessionCtaAttemptRecord);
      }
    }

    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    applyCaptureDetected =
      (await isVisibleLocator(applyCaptureFormLocator)) ||
      (await isVisibleLocator(applyCaptureSkipLocator));
    postApplyPopupDetected = applyCaptureDetected;
    postApplyUrlAfter = activePage.url();
    postApplyProgressionSucceeded =
      fallbackSucceeded ||
      postApplyNewPageDetected ||
      applyCaptureDetected ||
      isAdzunaLandRedirectPage(activePage.url()) ||
      activePage.url() !== fromUrl;

    console.log("[AUTO_APPLY_ADZUNA_POST_APPLY_FALLBACK]", {
      href: applyHref ?? null,
      currentUrl: activePage.url(),
      adzunaPostApplyProgressionSucceeded: postApplyProgressionSucceeded,
      adzunaPostApplyPopupDetected: postApplyPopupDetected,
      adzunaPostApplyNewPageDetected: postApplyNewPageDetected,
    });
  }

  console.log("[AUTO_APPLY_ADZUNA_DETAILS_APPLY]", {
    fromUrl,
    toUrl: activePage.url(),
    selector: applySelector,
    text: applyText,
    applyCaptureVisible: applyCaptureDetected,
    adzunaPostApplyProgressionSucceeded: postApplyProgressionSucceeded,
  });

  const skipSelector = applyCaptureSkipSelectorRaw;
  const visibleSkipLocator = await findFirstVisibleEnabledLocator(
    applyCaptureSkipLocator,
  );

  attempts.push({
    phase: "entry",
    action: "scan",
    selector: skipSelector,
    text: skipSelector,
    matchedText: "No thanks, take me to the job",
    locatorStrategy: "css_data_js",
    candidateFound: Boolean(visibleSkipLocator),
    dismissesBlocker: true,
    success: Boolean(visibleSkipLocator),
    urlBefore: activePage.url(),
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (!visibleSkipLocator) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: true,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      postApplyProgressionAttempted,
      postApplyProgressionSucceeded,
      postApplyUrlAfter,
      postApplyPopupDetected,
      postApplyNewPageDetected,
      postApplyFallbackAttempted,
      latestActionText,
      latestActionSelector,
    };
  }

  const skipFromUrl = activePage.url();
  const skipText =
    (await extractLocatorText(visibleSkipLocator).catch(() => "")) ||
    "No thanks, take me to the job";

  console.log("[AUTO_APPLY_ADZUNA_APPLY_CAPTURE_SKIP] attempting", {
    fromUrl: skipFromUrl,
    selector: skipSelector,
    text: skipText,
  });

  try {
    await visibleSkipLocator
      .click({ timeout: 6_000 })
      .catch(() =>
        visibleSkipLocator.click({ force: true, timeout: 6_000 }),
      );
  } catch {
    attempts.push({
      phase: "entry",
      action: "click",
      selector: skipSelector,
      text: skipText,
      matchedText: "No thanks, take me to the job",
      locatorStrategy: "css_data_js",
      candidateFound: true,
      dismissesBlocker: true,
      success: false,
      urlBefore: skipFromUrl,
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);

    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: true,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      postApplyProgressionAttempted,
      postApplyProgressionSucceeded,
      postApplyUrlAfter,
      postApplyPopupDetected,
      postApplyNewPageDetected,
      postApplyFallbackAttempted,
      latestActionText,
      latestActionSelector,
    };
  }

  const skipProgress = await waitForPostClickProgress({
    page: activePage,
    context: args.context,
    urlBefore: skipFromUrl,
    onPageReady: args.onPageReady,
  });

  activePage = skipProgress.page;
  const skipToUrl = activePage.url();
  applyCaptureSkipClicked = true;
  applyCaptureSkipText = skipText;
  applyCaptureSkipSelector = skipSelector;
  latestActionText = skipText;
  latestActionSelector = skipSelector;

  attempts.push({
    phase: "entry",
    action: "click",
    selector: skipSelector,
    text: skipText,
    matchedText: "No thanks, take me to the job",
    locatorStrategy: "css_data_js",
    candidateFound: true,
    dismissesBlocker: true,
    success: true,
    urlBefore: skipFromUrl,
    urlAfter: skipToUrl,
    applyCtaFoundAfter: await hasVisibleApplyCue(activePage),
  } satisfies ApplySessionCtaAttemptRecord);

  clicks.push({
    hop: 2,
    fromUrl: skipFromUrl,
    toUrl: skipToUrl,
    selector: skipSelector,
    text: skipText,
    navigation: "same-tab",
  } satisfies ApplySessionClickRecord);

  if (!urlsVisited.includes(skipToUrl)) {
    urlsVisited.push(skipToUrl);
  }

  console.log("[AUTO_APPLY_ADZUNA_APPLY_CAPTURE_SKIP]", {
    fromUrl: skipFromUrl,
    toUrl: skipToUrl,
    selector: skipSelector,
    text: skipText,
  });

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    applyClicks,
    handled: true,
    applyClicked,
    applyClickedText,
    applyClickedSelector,
    applyCaptureDetected,
    applyCaptureSkipClicked,
    applyCaptureSkipText,
    applyCaptureSkipSelector,
    postApplyProgressionAttempted,
    postApplyProgressionSucceeded,
    postApplyUrlAfter,
    postApplyPopupDetected,
    postApplyNewPageDetected,
    postApplyFallbackAttempted,
    latestActionText,
    latestActionSelector,
  };
}

async function hasVisibleApplyCue(page: Page): Promise<boolean> {
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

      return nodes
        .filter(isVisible)
        .some((element) =>
          patterns.some((pattern) =>
            getText(element)
              .replace(/\s+/g, " ")
              .trim()
              .toLowerCase()
              .includes(pattern),
          ),
        );
    }, [...APPLY_CTA_DETECTION_PATTERNS])
    .catch(() => false);
}

async function scanEntryCtaConfigs(
  page: Page,
  domain: KnownApplyDomain,
): Promise<ApplySessionCtaAttemptRecord[]> {
  const currentUrl = page.url();
  const configs = buildEntryCtaConfigs(domain).map((config) => ({
    ...config,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
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
        ).filter(isVisible);

        return args.configs.map((config) => {
          const match = nodes.find((element) => {
            const text = getText(element).replace(/\s+/g, " ").trim().toLowerCase();
            if (!text) return false;
            if (args.ignorePatterns.some((pattern) => text.includes(pattern))) {
              return false;
            }

            return config.match === "exact"
              ? text === config.textLower
              : text.includes(config.textLower);
          });

          const matchedText = match
            ? getText(match).replace(/\s+/g, " ").trim().slice(0, 160)
            : "";

          return {
            phase: "entry",
            action: "scan",
            selector: match ? buildCssPath(match) : `text=${config.text}`,
            text: matchedText,
            matchedText: config.text,
            locatorStrategy: `visible_text_${config.match}`,
            candidateFound: Boolean(match),
            dismissesBlocker: Boolean(config.dismissesBlocker),
            success: Boolean(match),
            urlBefore: args.currentUrl,
            urlAfter: args.currentUrl,
          };
        });
      },
      {
        configs,
        currentUrl,
        ignorePatterns: [...ENTRY_CTA_IGNORE_PATTERNS],
      },
    )
    .catch(() => []);
}

async function findEntryCtaCandidate(
  page: Page,
  domain: KnownApplyDomain,
): Promise<EntryCtaCandidate | null> {
  const currentUrl = page.url();
  const configs = buildEntryCtaConfigs(domain).map((config, index) => ({
    ...config,
    priority: index,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
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
            if (
              args.ignorePatterns.some((pattern) => lowerText.includes(pattern))
            ) {
              return null;
            }

            const tagName = element.tagName.toLowerCase();
            const roleAttr = element.getAttribute("role")?.toLowerCase() ?? "";
            const semanticRole =
              tagName === "a"
                ? "link"
                : tagName === "button" ||
                    tagName === "input" ||
                    roleAttr === "button"
                  ? "button"
                  : "any";
            const inBlocker = args.blockerSelectors.some((selector) =>
              element.closest(selector),
            );
            const inMainContent = Boolean(
              element.closest(
                "main, article, [role='main'], #content, .content, .job, .job-content, .job-header",
              ),
            );

            let bestMatch:
              | (EntryCtaCandidate & { score: number; priority: number })
              | null = null;

            for (const config of args.configs) {
              const matches =
                config.match === "exact"
                  ? lowerText === config.textLower
                  : lowerText.includes(config.textLower);
              if (!matches) continue;

              let score = 1000 - config.priority * 25;
              if (config.match === "exact") score += 120;
              if (semanticRole === config.preferredRole) score += 50;
              if (semanticRole === "button") score += 20;
              if (semanticRole === "link") score += 10;
              if (inBlocker && config.dismissesBlocker) score += 90;
              if (inBlocker && !config.dismissesBlocker) score -= 15;
              if (inMainContent) score += 25;
              if (args.domain === "dice" && lowerText === "apply now") {
                score += 40;
              }

              const candidate = {
                selector: buildCssPath(element),
                text: rawText.slice(0, 160),
                matchedText: config.text,
                dismissesBlocker: Boolean(config.dismissesBlocker),
                score,
                priority: config.priority,
              };

              if (!bestMatch || candidate.score > bestMatch.score) {
                bestMatch = candidate;
              }
            }

            return bestMatch;
          })
          .filter(
            (
              candidate,
            ): candidate is EntryCtaCandidate & { score: number; priority: number } =>
              candidate !== null,
          );

        candidates.sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.priority - right.priority;
        });

        return (candidates[0] as EntryCtaCandidate | undefined) ?? null;
      },
      {
        domain,
        configs,
        blockerSelectors: [...BLOCKER_SURFACE_SELECTORS],
        ignorePatterns: [...ENTRY_CTA_IGNORE_PATTERNS],
        currentUrl,
      },
    )
    .catch(() => null);
}

async function clickEntryCtaCandidate(args: {
  page: Page;
  context: BrowserContext;
  candidate: EntryCtaCandidate;
  step: number;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const fromUrl = args.page.url();
  const locator = args.page.locator(args.candidate.selector).first();
  const popupPromise = args.page
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_ENTRY_CTA] attempting", {
    step: args.step,
    fromUrl,
    selector: args.candidate.selector,
    text: args.candidate.text,
    matchedText: args.candidate.matchedText,
    dismissesBlocker: args.candidate.dismissesBlocker,
  });

  try {
    await locator
      .click({ timeout: 6_000 })
      .catch(() => locator.click({ force: true, timeout: 6_000 }));
  } catch {
    return {
      page: args.page,
      click: null,
      attempt: {
        phase: "entry",
        action: "click",
        selector: args.candidate.selector,
        text: args.candidate.text,
        matchedText: args.candidate.matchedText,
        locatorStrategy: "visible_text_ranked",
        candidateFound: true,
        dismissesBlocker: args.candidate.dismissesBlocker,
        success: false,
        urlBefore: fromUrl,
        urlAfter: args.page.url(),
        applyCtaFoundAfter: await hasVisibleApplyCue(args.page),
      } satisfies ApplySessionCtaAttemptRecord,
    };
  }

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

  const applyCtaFoundAfter = await hasVisibleApplyCue(nextPage);

  return {
    page: nextPage,
    click: {
      hop: args.step,
      fromUrl,
      toUrl: nextPage.url(),
      selector: args.candidate.selector,
      text: args.candidate.text,
      navigation,
    } satisfies ApplySessionClickRecord,
    attempt: {
      phase: "entry",
      action: "click",
      selector: args.candidate.selector,
      text: args.candidate.text,
      matchedText: args.candidate.matchedText,
      locatorStrategy: "visible_text_ranked",
      candidateFound: true,
      dismissesBlocker: args.candidate.dismissesBlocker,
      success: true,
      urlBefore: fromUrl,
      urlAfter: nextPage.url(),
      applyCtaFoundAfter,
    } satisfies ApplySessionCtaAttemptRecord,
  };
}

async function runEntryCtaPhase(args: {
  page: Page;
  context: BrowserContext;
  domain: KnownApplyDomain;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<EntryCtaPhaseResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const seenCandidates = new Set<string>();
  const seenScanAttempts = new Set<string>();
  let dismissedBlocker = false;
  let ctaFound = false;
  let ctaClickedText: string | undefined;
  let ctaClickedSelector: string | undefined;

  for (let step = 1; step <= ENTRY_CTA_MAX_STEPS; step += 1) {
    const scanAttempts = await scanEntryCtaConfigs(activePage, args.domain);
    for (const scanAttempt of scanAttempts) {
      const signature = `${scanAttempt.urlBefore}|${scanAttempt.matchedText}|${scanAttempt.action}`;
      if (seenScanAttempts.has(signature)) continue;
      seenScanAttempts.add(signature);
      attempts.push(scanAttempt);
      if (scanAttempt.candidateFound) {
        ctaFound = true;
      }
    }

    const candidate = await findEntryCtaCandidate(activePage, args.domain);
    if (!candidate) break;
    ctaFound = true;

    const signature = `${activePage.url()}|${candidate.selector}|${candidate.text}`;
    if (seenCandidates.has(signature)) {
      break;
    }
    seenCandidates.add(signature);

    const result = await clickEntryCtaCandidate({
      page: activePage,
      context: args.context,
      candidate,
      step,
      onPageReady: args.onPageReady,
    });

    attempts.push(result.attempt);
    activePage = result.page;

    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    if (result.click) {
      clicks.push(result.click);
      ctaClickedText = candidate.text;
      ctaClickedSelector = candidate.selector;
      if (candidate.dismissesBlocker) {
        dismissedBlocker = true;
      }
    }

    const signals = await detectPageSignals(activePage);
    console.log("[AUTO_APPLY_ENTRY_CTA] landed", {
      step,
      domain: args.domain,
      currentUrl: activePage.url(),
      clickedText: candidate.text,
      clickedSelector: candidate.selector,
      dismissedBlocker,
      applyCtaFoundAfter: result.attempt.applyCtaFoundAfter ?? false,
      formDetected: signals.formDetected,
      verificationDetected: signals.needsHuman,
      confirmationDetected: signals.confirmationDetected,
    });

    if (
      signals.formDetected ||
      signals.needsHuman ||
      signals.confirmationDetected
    ) {
      break;
    }
  }

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    ctaFound,
    ctaClickedText,
    ctaClickedSelector,
    dismissedBlocker,
  };
}

async function scanHandoffCtaConfigs(
  page: Page,
): Promise<ApplySessionCtaAttemptRecord[]> {
  const currentUrl = page.url();
  const configs = buildHandoffCtaConfigs().map((config) => ({
    ...config,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
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
        ).filter(isVisible);

        return args.configs.map((config) => {
          const match = nodes.find((element) => {
            const text = getText(element).replace(/\s+/g, " ").trim().toLowerCase();
            if (!text) return false;
            if (args.ignorePatterns.some((pattern) => text.includes(pattern))) {
              return false;
            }

            return config.match === "exact"
              ? text === config.textLower
              : text.includes(config.textLower);
          });

          const matchedText = match
            ? getText(match).replace(/\s+/g, " ").trim().slice(0, 160)
            : "";

          return {
            phase: "handoff",
            action: "scan",
            selector: match ? buildCssPath(match) : `text=${config.text}`,
            text: matchedText,
            matchedText: config.text,
            locatorStrategy: `visible_text_${config.match}`,
            candidateFound: Boolean(match),
            dismissesBlocker: false,
            success: Boolean(match),
            urlBefore: args.currentUrl,
            urlAfter: args.currentUrl,
          };
        });
      },
      {
        configs,
        currentUrl,
        ignorePatterns: [...HANDOFF_CTA_IGNORE_PATTERNS],
      },
    )
    .catch(() => []);
}

async function findHandoffCtaCandidate(
  page: Page,
): Promise<EntryCtaCandidate | null> {
  const configs = buildHandoffCtaConfigs().map((config, index) => ({
    ...config,
    priority: index,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
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
            if (
              args.ignorePatterns.some((pattern) => lowerText.includes(pattern))
            ) {
              return null;
            }

            const tagName = element.tagName.toLowerCase();
            const roleAttr = element.getAttribute("role")?.toLowerCase() ?? "";
            const semanticRole =
              tagName === "a"
                ? "link"
                : tagName === "button" ||
                    tagName === "input" ||
                    roleAttr === "button"
                  ? "button"
                  : "any";
            const inMainContent = Boolean(
              element.closest(
                "main, article, [role='main'], .job, .job-content, .job-header, .job-apply, .job-actions",
              ),
            );
            const inHeaderOrFooter = Boolean(
              element.closest("header, footer, nav, [role='navigation']"),
            );
            const attrs = [
              element.id ?? "",
              element.className ?? "",
              element.getAttribute("data-testid") ?? "",
              element.getAttribute("aria-label") ?? "",
            ]
              .join(" ")
              .toLowerCase();

            let bestMatch:
              | (EntryCtaCandidate & { score: number; priority: number })
              | null = null;

            for (const config of args.configs) {
              const matches =
                config.match === "exact"
                  ? lowerText === config.textLower
                  : lowerText.includes(config.textLower);
              if (!matches) continue;

              let score = 1000 - config.priority * 25;
              if (config.match === "exact") score += 120;
              if (semanticRole === config.preferredRole) score += 70;
              if (semanticRole === "button") score += 20;
              if (semanticRole === "link") score += 10;
              if (inMainContent) score += 60;
              if (inHeaderOrFooter) score -= 140;
              if (
                attrs.includes("primary") ||
                attrs.includes("cta") ||
                attrs.includes("apply")
              ) {
                score += 45;
              }

              const candidate = {
                selector: buildCssPath(element),
                text: rawText.slice(0, 160),
                matchedText: config.text,
                dismissesBlocker: false,
                score,
                priority: config.priority,
              };

              if (!bestMatch || candidate.score > bestMatch.score) {
                bestMatch = candidate;
              }
            }

            return bestMatch;
          })
          .filter(
            (
              candidate,
            ): candidate is EntryCtaCandidate & { score: number; priority: number } =>
              candidate !== null,
          );

        candidates.sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.priority - right.priority;
        });

        return (candidates[0] as EntryCtaCandidate | undefined) ?? null;
      },
      {
        configs,
        ignorePatterns: [...HANDOFF_CTA_IGNORE_PATTERNS],
      },
    )
    .catch(() => null);
}

async function findResolvedHandoffClickTarget(args: {
  page: Page;
  candidate: ApplySourceCandidate;
}): Promise<ResolvedHandoffClickTarget | null> {
  const hrefFragments = buildResolvedHandoffHrefFragments(args.candidate.href);
  const candidateText = args.candidate.text.trim();
  const textPatterns = [
    candidateText,
    "Apply for this job",
    "Apply now",
    "Continue to application",
  ].filter(Boolean);

  const locatorPlans: Array<{
    locator: Locator;
    strategy: string;
    selector: string;
  }> = [];

  if (hrefFragments[0]) {
    const exactSelector = `a[href="${cssEscape(hrefFragments[0])}"]`;
    locatorPlans.push({
      locator: args.page.locator(exactSelector),
      strategy: "resolved_handoff_href_exact",
      selector: exactSelector,
    });
  }

  for (const fragment of hrefFragments.slice(1)) {
    const partialSelector = `a[href*="${cssEscape(fragment)}"]`;
    locatorPlans.push({
      locator: args.page.locator(partialSelector),
      strategy: "resolved_handoff_href_partial",
      selector: partialSelector,
    });
  }

  for (const pattern of textPatterns) {
    const exactPattern = new RegExp(`^\\s*${escapeRegExp(pattern)}\\s*$`, "i");
    const containsPattern = new RegExp(escapeRegExp(pattern), "i");

    locatorPlans.push({
      locator: args.page.getByRole("link", { name: exactPattern }),
      strategy: "resolved_handoff_role_link_text_exact",
      selector: `role=link[name=${pattern}]`,
    });
    locatorPlans.push({
      locator: args.page.getByRole("button", { name: exactPattern }),
      strategy: "resolved_handoff_role_button_text_exact",
      selector: `role=button[name=${pattern}]`,
    });
    locatorPlans.push({
      locator: args.page.getByRole("link", { name: containsPattern }),
      strategy: "resolved_handoff_role_link_text_contains",
      selector: `role=link[name*=${pattern}]`,
    });
  }

  for (const plan of locatorPlans) {
    const matchedLocator = await findFirstVisibleEnabledLocator(plan.locator);
    if (!matchedLocator) {
      continue;
    }

    const resolvedHref =
      (await matchedLocator.getAttribute("href").catch(() => null)) ?? undefined;
    const text = (await extractLocatorText(matchedLocator)).trim();

    return {
      selector: plan.selector,
      text: text.slice(0, 160) || candidateText || args.candidate.href,
      matchedText: candidateText || args.candidate.href,
      dismissesBlocker: false,
      href: resolvedHref ?? args.candidate.href,
      locatorStrategy: plan.strategy,
      locator: matchedLocator,
    } satisfies ResolvedHandoffClickTarget;
  }

  return null;
}

async function clickResolvedHandoffCandidateIfStuck(args: {
  page: Page;
  context: BrowserContext;
  resolverSelectedLink?: string;
  resolverCandidates: ApplySourceCandidate[];
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<ResolvedHandoffClickResult> {
  let activePage = args.page;
  const candidate = pickResolvedHandoffCandidate({
    resolverSelectedLink: args.resolverSelectedLink,
    resolverCandidates: args.resolverCandidates,
  });

  if (!candidate) {
    const result = {
      page: activePage,
      urlsVisited: [activePage.url()],
      clicks: [],
      attempts: [],
      attempted: false,
      targetFound: false,
      succeeded: false,
      directNavAttempted: false,
      directNavSucceeded: false,
    } satisfies ResolvedHandoffClickResult;

    console.log("[AUTO_APPLY_RESOLVED_HANDOFF]", {
      resolvedHandoffClickAttempted: result.attempted,
      resolvedHandoffClickSucceeded: result.succeeded,
      resolvedHandoffClickedHref: null,
      resolvedHandoffClickedText: null,
      resolvedHandoffUrlBefore: activePage.url(),
      resolvedHandoffUrlAfter: activePage.url(),
      currentUrl: activePage.url(),
    });

    return result;
  }

  const urlBefore = activePage.url();
  const urlsVisited = [urlBefore];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const clicks: ApplySessionClickRecord[] = [];
  const target = await findResolvedHandoffClickTarget({
    page: activePage,
    candidate,
  });

  attempts.push({
    phase: "handoff",
    action: "scan",
    selector:
      target?.selector ??
      `a[href="${cssEscape(args.resolverSelectedLink ?? candidate.href)}"]`,
    text: target?.text ?? "",
    matchedText: candidate.text || candidate.href,
    locatorStrategy:
      target?.locatorStrategy ?? "resolved_handoff_locator_search",
    candidateFound: Boolean(target),
    dismissesBlocker: false,
    success: Boolean(target),
    urlBefore,
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (!target) {
    let directNavAttempted = false;
    let directNavSucceeded = false;
    let directNavUrl: string | undefined;
    let directNavUrlAfter: string | undefined;

    if (
      isAdzunaLandRedirectPage(activePage.url()) &&
      candidate.score > 100
    ) {
      const directNavResult = await navigateResolvedHandoffCandidateDirectly({
        page: activePage,
        context: args.context,
        candidate,
        resolverSelectedLink: args.resolverSelectedLink,
        onPageReady: args.onPageReady,
      });

      activePage = directNavResult.page;
      if (!urlsVisited.includes(activePage.url())) {
        urlsVisited.push(activePage.url());
      }
      directNavAttempted = directNavResult.attempted;
      directNavSucceeded = directNavResult.succeeded;
      directNavUrl = directNavResult.url;
      directNavUrlAfter = directNavResult.urlAfter;
    }

    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      attempted: true,
      targetFound: false,
      succeeded: directNavSucceeded,
      locatorStrategy: "resolved_handoff_locator_search",
      directNavAttempted,
      directNavSucceeded,
      directNavUrl,
      directNavUrlAfter,
      urlBefore,
      urlAfter: activePage.url(),
    } satisfies ResolvedHandoffClickResult;

    console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK]", {
      resolvedHandoffClickAttempted: result.attempted,
      resolvedHandoffElementFound: result.targetFound,
      resolvedHandoffLocatorStrategy: result.locatorStrategy,
      resolvedHandoffClickSucceeded: result.succeeded,
      resolvedHandoffDirectNavAttempted: result.directNavAttempted,
      resolvedHandoffDirectNavSucceeded: result.directNavSucceeded,
      resolvedHandoffDirectNavUrl: result.directNavUrl ?? null,
      resolvedHandoffDirectNavUrlAfter: result.directNavUrlAfter ?? null,
      resolvedHandoffClickedHref: candidate.href,
      resolvedHandoffClickedText: candidate.text || null,
      resolvedHandoffUrlBefore: result.urlBefore,
      resolvedHandoffUrlAfter: result.urlAfter,
      currentUrl: activePage.url(),
    });

    return result;
  }

  const popupPromise = activePage
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = activePage
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK] attempting", {
    resolvedHandoffClickAttempted: true,
    resolvedHandoffElementFound: true,
    resolvedHandoffLocatorStrategy: target.locatorStrategy,
    resolvedHandoffClickedHref: target.href ?? candidate.href,
    resolvedHandoffClickedText: target.text || candidate.text || null,
    selector: target.selector,
    locatorStrategy: target.locatorStrategy,
    currentUrl: urlBefore,
  });

  let clickSucceeded = false;

  try {
    await target.locator
      .click({ timeout: 6_000 })
      .catch(() => target.locator.click({ force: true, timeout: 6_000 }));
    clickSucceeded = true;
  } catch {
    let directNavAttempted = false;
    let directNavSucceeded = false;
    let directNavUrl: string | undefined;
    let directNavUrlAfter: string | undefined;

    if (
      isAdzunaLandRedirectPage(activePage.url()) &&
      candidate.score > 100
    ) {
      const directNavResult = await navigateResolvedHandoffCandidateDirectly({
        page: activePage,
        context: args.context,
        candidate,
        resolverSelectedLink: args.resolverSelectedLink,
        onPageReady: args.onPageReady,
      });

      activePage = directNavResult.page;
      if (!urlsVisited.includes(activePage.url())) {
        urlsVisited.push(activePage.url());
      }
      directNavAttempted = directNavResult.attempted;
      directNavSucceeded = directNavResult.succeeded;
      directNavUrl = directNavResult.url;
      directNavUrlAfter = directNavResult.urlAfter;
    }

    attempts.push({
      phase: "handoff",
      action: "click",
      selector: target.selector,
      text: target.text,
      matchedText: candidate.text || candidate.href,
      locatorStrategy: target.locatorStrategy,
      candidateFound: true,
      dismissesBlocker: false,
      success: false,
      urlBefore,
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);

    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      attempted: true,
      targetFound: true,
      succeeded: directNavSucceeded,
      locatorStrategy: target.locatorStrategy,
      directNavAttempted,
      directNavSucceeded,
      directNavUrl,
      directNavUrlAfter,
      clickedHref: target.href ?? candidate.href,
      clickedText: target.text || candidate.text,
      clickedSelector: target.selector,
      urlBefore,
      urlAfter: activePage.url(),
    } satisfies ResolvedHandoffClickResult;

    console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK]", {
      resolvedHandoffClickAttempted: result.attempted,
      resolvedHandoffElementFound: result.targetFound,
      resolvedHandoffLocatorStrategy: result.locatorStrategy,
      resolvedHandoffClickSucceeded: result.succeeded,
      resolvedHandoffDirectNavAttempted: result.directNavAttempted,
      resolvedHandoffDirectNavSucceeded: result.directNavSucceeded,
      resolvedHandoffDirectNavUrl: result.directNavUrl ?? null,
      resolvedHandoffDirectNavUrlAfter: result.directNavUrlAfter ?? null,
      resolvedHandoffClickedHref: result.clickedHref ?? null,
      resolvedHandoffClickedText: result.clickedText ?? null,
      resolvedHandoffUrlBefore: result.urlBefore,
      resolvedHandoffUrlAfter: result.urlAfter,
      currentUrl: activePage.url(),
    });

    return result;
  }

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);

  let nextPage = activePage;
  let navigation: ApplySessionClickRecord["navigation"] = "same-tab";

  if (popupPage) {
    nextPage = popupPage;
    navigation = "popup";
  } else if (contextPage && contextPage !== activePage) {
    nextPage = contextPage;
    navigation = "new-page";
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  const clickRecord = {
    hop: 1,
    fromUrl: urlBefore,
    toUrl: nextPage.url(),
    selector: target.selector,
    text: target.text,
    navigation,
  } satisfies ApplySessionClickRecord;
  clicks.push(clickRecord);
  activePage = nextPage;

  if (!urlsVisited.includes(activePage.url())) {
    urlsVisited.push(activePage.url());
  }

  attempts.push({
    phase: "handoff",
    action: "click",
    selector: target.selector,
    text: target.text,
    matchedText: candidate.text || candidate.href,
    locatorStrategy: target.locatorStrategy,
    candidateFound: true,
    dismissesBlocker: false,
    success: clickSucceeded,
    urlBefore,
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  const progress = await waitForPostClickProgress({
    page: activePage,
    context: args.context,
    urlBefore: activePage.url(),
    onPageReady: args.onPageReady,
  });

  activePage = progress.page;
  if (!urlsVisited.includes(activePage.url())) {
    urlsVisited.push(activePage.url());
  }

  const resolvedHandoffUrlAfter = activePage.url();
  const resolvedHandoffClickSucceeded =
    progress.urlChanged ||
    !isAdzunaLandRedirectPage(resolvedHandoffUrlAfter) ||
    (await hasReachedPostHandoffDestination(activePage));

  const result = {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    attempted: true,
    targetFound: true,
    succeeded: resolvedHandoffClickSucceeded,
    locatorStrategy: target.locatorStrategy,
    directNavAttempted: false,
    directNavSucceeded: false,
    clickedHref: target.href ?? candidate.href,
    clickedText: target.text || candidate.text,
    clickedSelector: target.selector,
    urlBefore,
    urlAfter: resolvedHandoffUrlAfter,
  } satisfies ResolvedHandoffClickResult;

  console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK]", {
    resolvedHandoffClickAttempted: result.attempted,
    resolvedHandoffElementFound: result.targetFound,
    resolvedHandoffLocatorStrategy: result.locatorStrategy,
    resolvedHandoffClickSucceeded: result.succeeded,
    resolvedHandoffDirectNavAttempted: result.directNavAttempted,
    resolvedHandoffDirectNavSucceeded: result.directNavSucceeded,
    resolvedHandoffDirectNavUrl: result.directNavUrl ?? null,
    resolvedHandoffDirectNavUrlAfter: result.directNavUrlAfter ?? null,
    resolvedHandoffClickedHref: result.clickedHref ?? null,
    resolvedHandoffClickedText: result.clickedText ?? null,
    resolvedHandoffUrlBefore: result.urlBefore,
    resolvedHandoffUrlAfter: result.urlAfter,
    currentUrl: activePage.url(),
  });

  return result;
}

async function clickHandoffCtaCandidate(args: {
  page: Page;
  context: BrowserContext;
  candidate: EntryCtaCandidate;
  step: number;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const fromUrl = args.page.url();
  const locator = args.page.locator(args.candidate.selector).first();
  const popupPromise = args.page
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_HANDOFF] attempting", {
    step: args.step,
    fromUrl,
    selector: args.candidate.selector,
    text: args.candidate.text,
    matchedText: args.candidate.matchedText,
  });

  try {
    await locator
      .click({ timeout: 6_000 })
      .catch(() => locator.click({ force: true, timeout: 6_000 }));
  } catch {
    return {
      page: args.page,
      click: null,
      attempt: {
        phase: "handoff",
        action: "click",
        selector: args.candidate.selector,
        text: args.candidate.text,
        matchedText: args.candidate.matchedText,
        locatorStrategy: "visible_text_ranked",
        candidateFound: true,
        dismissesBlocker: false,
        success: false,
        urlBefore: fromUrl,
        urlAfter: args.page.url(),
      } satisfies ApplySessionCtaAttemptRecord,
    };
  }

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
      hop: args.step,
      fromUrl,
      toUrl: nextPage.url(),
      selector: args.candidate.selector,
      text: args.candidate.text,
      navigation,
    } satisfies ApplySessionClickRecord,
    attempt: {
      phase: "handoff",
      action: "click",
      selector: args.candidate.selector,
      text: args.candidate.text,
      matchedText: args.candidate.matchedText,
      locatorStrategy: "visible_text_ranked",
      candidateFound: true,
      dismissesBlocker: false,
      success: true,
      urlBefore: fromUrl,
      urlAfter: nextPage.url(),
    } satisfies ApplySessionCtaAttemptRecord,
  };
}

async function waitForHandoffAutoRedirect(page: Page, fromUrl: string) {
  await page
    .waitForURL((url) => url.toString() !== fromUrl, {
      timeout: 4_000,
    })
    .catch(() => null);
  await waitForDomAndSettle(page);
  return page.url() !== fromUrl;
}

async function hasReachedPostHandoffDestination(page: Page) {
  const currentUrl = page.url();
  if (
    isAdzunaLandRedirectPage(currentUrl) ||
    isAppcastTrackingPage(currentUrl)
  ) {
    return false;
  }

  const hostname = parseHostname(currentUrl);
  if (hostname && !hostname.includes("adzuna")) {
    return true;
  }

  const signals = await detectPageSignals(page);
  return isImmediateApplyDestinationPage({
    hostname,
    currentUrl,
    signals,
  });
}

async function runHandoffContinuationPhase(args: {
  page: Page;
  context: BrowserContext;
  resolverSelectedLink?: string;
  resolverCandidates: ApplySourceCandidate[];
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<HandoffContinuationResult> {
  let activePage = args.page;
  const initialUrl = activePage.url();
  const urlsVisited = [initialUrl];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const seenCandidates = new Set<string>();
  const seenScanAttempts = new Set<string>();
  let ctaFound = false;
  let ctaClicked = false;
  let ctaClickedText: string | undefined;
  let ctaClickedSelector: string | undefined;
  let resolvedHandoffClickAttempted = false;
  let resolvedHandoffClickSucceeded = false;
  let resolvedHandoffElementFound = false;
  let resolvedHandoffLocatorStrategy: string | undefined;
  let resolvedHandoffDirectNavAttempted = false;
  let resolvedHandoffDirectNavSucceeded = false;
  let resolvedHandoffDirectNavUrl: string | undefined;
  let resolvedHandoffDirectNavUrlAfter: string | undefined;
  let adzunaFallbackLinkFound = false;
  let adzunaFallbackLinkClicked = false;
  let adzunaFallbackLinkText: string | undefined;
  let adzunaFallbackLocatorStrategy: string | undefined;
  let adzunaFallbackElementFound = false;
  let adzunaFallbackClickSucceeded = false;
  let adzunaFallbackHref: string | undefined;
  let adzunaFallbackHost: string | undefined;
  let adzunaFallbackDirectNavAttempted = false;
  let adzunaFallbackDirectNavSucceeded = false;
  let adzunaExtractedRedirectUrl: string | undefined;
  let adzunaExtractedRedirectSource:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | undefined;
  let adzunaExtractedRedirectHtmlRead = false;
  let adzunaExtractedRedirectFailureReason: string[] | undefined;
  let adzunaExtractedRedirectNavAttempted = false;
  let adzunaExtractedRedirectNavSucceeded = false;
  let adzunaFallbackUrlAfter: string | undefined;
  let resolvedHandoffClickedHref: string | undefined;
  let resolvedHandoffClickedText: string | undefined;
  let resolvedHandoffUrlBefore: string | undefined;
  let resolvedHandoffUrlAfter: string | undefined;

  const handoffPageDetected = isAdzunaLandRedirectPage(initialUrl);
  const handoffUrl = handoffPageDetected ? initialUrl : undefined;
  const recordUrl = () => {
    const current = activePage.url();
    if (!urlsVisited.includes(current)) {
      urlsVisited.push(current);
    }
    return current;
  };
  const finalize = (continuationSucceeded: boolean) => {
    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      handoffPageDetected,
      handoffUrl,
      continuationAttempted: handoffPageDetected,
      continuationSucceeded,
      ctaFound,
      ctaClicked,
      ctaClickedText,
      ctaClickedSelector,
      resolvedHandoffClickAttempted,
      resolvedHandoffClickSucceeded,
      resolvedHandoffElementFound,
      resolvedHandoffLocatorStrategy,
      resolvedHandoffDirectNavAttempted,
      resolvedHandoffDirectNavSucceeded,
      resolvedHandoffDirectNavUrl,
      resolvedHandoffDirectNavUrlAfter,
      adzunaFallbackLinkFound,
      adzunaFallbackLinkClicked,
      adzunaFallbackLinkText,
      adzunaFallbackLocatorStrategy,
      adzunaFallbackElementFound,
      adzunaFallbackClickSucceeded,
      adzunaFallbackHref,
      adzunaFallbackHost,
      adzunaFallbackDirectNavAttempted,
      adzunaFallbackDirectNavSucceeded,
      adzunaExtractedRedirectUrl,
      adzunaExtractedRedirectSource,
      adzunaExtractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason,
      adzunaExtractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter,
      resolvedHandoffClickedHref,
      resolvedHandoffClickedText,
      resolvedHandoffUrlBefore,
      resolvedHandoffUrlAfter,
    } satisfies HandoffContinuationResult;

    console.log("[AUTO_APPLY_HANDOFF]", {
      handoffUrl,
      handoffContinuationAttempted: result.continuationAttempted,
      handoffContinuationSucceeded: result.continuationSucceeded,
      handoffCtaFound: result.ctaFound,
      handoffCtaClicked: result.ctaClicked,
      handoffCtaClickedText: result.ctaClickedText ?? null,
      handoffCtaClickedSelector: result.ctaClickedSelector ?? null,
      handoffAttempts: result.attempts,
      resolvedHandoffClickAttempted: result.resolvedHandoffClickAttempted,
      resolvedHandoffClickSucceeded: result.resolvedHandoffClickSucceeded,
      resolvedHandoffElementFound: result.resolvedHandoffElementFound,
      resolvedHandoffLocatorStrategy:
        result.resolvedHandoffLocatorStrategy ?? null,
      resolvedHandoffDirectNavAttempted:
        result.resolvedHandoffDirectNavAttempted,
      resolvedHandoffDirectNavSucceeded:
        result.resolvedHandoffDirectNavSucceeded,
      resolvedHandoffDirectNavUrl:
        result.resolvedHandoffDirectNavUrl ?? null,
      resolvedHandoffDirectNavUrlAfter:
        result.resolvedHandoffDirectNavUrlAfter ?? null,
      adzunaFallbackLinkFound: result.adzunaFallbackLinkFound,
      adzunaFallbackLinkClicked: result.adzunaFallbackLinkClicked,
      adzunaFallbackLinkText: result.adzunaFallbackLinkText ?? null,
      adzunaFallbackLocatorStrategy:
        result.adzunaFallbackLocatorStrategy ?? null,
      adzunaFallbackElementFound: result.adzunaFallbackElementFound,
      adzunaFallbackClickSucceeded: result.adzunaFallbackClickSucceeded,
      adzunaFallbackHref: result.adzunaFallbackHref ?? null,
      adzunaFallbackHost: result.adzunaFallbackHost ?? null,
      adzunaFallbackDirectNavAttempted:
        result.adzunaFallbackDirectNavAttempted,
      adzunaFallbackDirectNavSucceeded:
        result.adzunaFallbackDirectNavSucceeded,
      adzunaExtractedRedirectUrl:
        result.adzunaExtractedRedirectUrl ?? null,
      adzunaExtractedRedirectSource:
        result.adzunaExtractedRedirectSource ?? null,
      adzunaExtractedRedirectHtmlRead:
        result.adzunaExtractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        result.adzunaExtractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted:
        result.adzunaExtractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded:
        result.adzunaExtractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter: result.adzunaFallbackUrlAfter ?? null,
      resolvedHandoffClickedHref: result.resolvedHandoffClickedHref ?? null,
      resolvedHandoffClickedText: result.resolvedHandoffClickedText ?? null,
      resolvedHandoffUrlBefore: result.resolvedHandoffUrlBefore ?? null,
      resolvedHandoffUrlAfter: result.resolvedHandoffUrlAfter ?? null,
      currentUrl: activePage.url(),
    });

    return result;
  };

  if (!handoffPageDetected) {
    return finalize(false);
  }

  const autoRedirected = await waitForHandoffAutoRedirect(activePage, initialUrl);
  recordUrl();

  if (autoRedirected && (await hasReachedPostHandoffDestination(activePage))) {
    return finalize(true);
  }

  const adzunaFallbackResult = await clickAdzunaFallbackLinkIfStuck({
    page: activePage,
    context: args.context,
    onPageReady: args.onPageReady,
  });

  activePage = adzunaFallbackResult.page;
  adzunaFallbackLinkFound = adzunaFallbackResult.found;
  adzunaFallbackLinkClicked = adzunaFallbackResult.clicked;
  adzunaFallbackLinkText = adzunaFallbackResult.text;
  adzunaFallbackLocatorStrategy = adzunaFallbackResult.locatorStrategy;
  adzunaFallbackElementFound = adzunaFallbackResult.elementFound;
  adzunaFallbackClickSucceeded = adzunaFallbackResult.clickSucceeded;
  adzunaFallbackHref = adzunaFallbackResult.href;
  adzunaFallbackHost = adzunaFallbackResult.host;
  adzunaFallbackDirectNavAttempted =
    adzunaFallbackResult.directNavAttempted;
  adzunaFallbackDirectNavSucceeded =
    adzunaFallbackResult.directNavSucceeded;
  adzunaExtractedRedirectUrl =
    adzunaFallbackResult.extractedRedirectUrl;
  adzunaExtractedRedirectSource =
    adzunaFallbackResult.extractedRedirectSource;
  adzunaExtractedRedirectHtmlRead =
    adzunaFallbackResult.extractedRedirectHtmlRead;
  adzunaExtractedRedirectFailureReason =
    adzunaFallbackResult.extractedRedirectFailureReason;
  adzunaExtractedRedirectNavAttempted =
    adzunaFallbackResult.extractedRedirectNavAttempted;
  adzunaExtractedRedirectNavSucceeded =
    adzunaFallbackResult.extractedRedirectNavSucceeded;
  adzunaFallbackUrlAfter = adzunaFallbackResult.urlAfter;

  for (const attempt of adzunaFallbackResult.attempts) {
    attempts.push(attempt);
    if (attempt.candidateFound) {
      ctaFound = true;
    }
  }

  if (adzunaFallbackResult.clicks.length > 0) {
    clicks.push(...adzunaFallbackResult.clicks);
    ctaClicked = true;
    ctaClickedText = adzunaFallbackResult.text;
    ctaClickedSelector = adzunaFallbackResult.selector;
  }

  for (const url of adzunaFallbackResult.urlsVisited) {
    if (!urlsVisited.includes(url)) {
      urlsVisited.push(url);
    }
  }

  if (
    adzunaFallbackResult.clicked &&
    (await hasReachedPostHandoffDestination(activePage))
  ) {
    return finalize(true);
  }

  const resolvedHandoffResult = await clickResolvedHandoffCandidateIfStuck({
    page: activePage,
    context: args.context,
    resolverSelectedLink: args.resolverSelectedLink,
    resolverCandidates: args.resolverCandidates,
    onPageReady: args.onPageReady,
  });

  activePage = resolvedHandoffResult.page;
  resolvedHandoffClickAttempted = resolvedHandoffResult.attempted;
  resolvedHandoffClickSucceeded = resolvedHandoffResult.succeeded;
  resolvedHandoffElementFound = resolvedHandoffResult.targetFound;
  resolvedHandoffLocatorStrategy = resolvedHandoffResult.locatorStrategy;
  resolvedHandoffDirectNavAttempted = resolvedHandoffResult.directNavAttempted;
  resolvedHandoffDirectNavSucceeded = resolvedHandoffResult.directNavSucceeded;
  resolvedHandoffDirectNavUrl = resolvedHandoffResult.directNavUrl;
  resolvedHandoffDirectNavUrlAfter = resolvedHandoffResult.directNavUrlAfter;
  resolvedHandoffClickedHref = resolvedHandoffResult.clickedHref;
  resolvedHandoffClickedText = resolvedHandoffResult.clickedText;
  resolvedHandoffUrlBefore = resolvedHandoffResult.urlBefore;
  resolvedHandoffUrlAfter = resolvedHandoffResult.urlAfter;

  for (const attempt of resolvedHandoffResult.attempts) {
    attempts.push(attempt);
    if (attempt.candidateFound) {
      ctaFound = true;
    }
  }

  if (resolvedHandoffResult.clicks.length > 0) {
    clicks.push(...resolvedHandoffResult.clicks);
    ctaClicked = true;
    ctaClickedText = resolvedHandoffResult.clickedText;
    ctaClickedSelector = resolvedHandoffResult.clickedSelector;
  }

  for (const url of resolvedHandoffResult.urlsVisited) {
    if (!urlsVisited.includes(url)) {
      urlsVisited.push(url);
    }
  }

  if (
    resolvedHandoffResult.succeeded &&
    (await hasReachedPostHandoffDestination(activePage))
  ) {
    return finalize(true);
  }

  for (let step = 1; step <= HANDOFF_CTA_MAX_STEPS; step += 1) {
    const scanAttempts = await scanHandoffCtaConfigs(activePage);
    for (const scanAttempt of scanAttempts) {
      const signature = `${scanAttempt.urlBefore}|${scanAttempt.matchedText}|${scanAttempt.action}`;
      if (seenScanAttempts.has(signature)) continue;
      seenScanAttempts.add(signature);
      attempts.push(scanAttempt);
      if (scanAttempt.candidateFound) {
        ctaFound = true;
      }
    }

    const candidate = await findHandoffCtaCandidate(activePage);
    if (!candidate) {
      break;
    }
    ctaFound = true;

    const signature = `${activePage.url()}|${candidate.selector}|${candidate.text}`;
    if (seenCandidates.has(signature)) {
      break;
    }
    seenCandidates.add(signature);

    const result = await clickHandoffCtaCandidate({
      page: activePage,
      context: args.context,
      candidate,
      step,
      onPageReady: args.onPageReady,
    });

    attempts.push(result.attempt);
    activePage = result.page;
    recordUrl();

    if (result.click) {
      clicks.push(result.click);
      ctaClicked = true;
      ctaClickedText = candidate.text;
      ctaClickedSelector = candidate.selector;
    }

    const redirectedAfterClick = await waitForHandoffAutoRedirect(
      activePage,
      result.attempt.urlAfter ?? activePage.url(),
    );
    recordUrl();

    if (
      (redirectedAfterClick || result.click) &&
      (await hasReachedPostHandoffDestination(activePage))
    ) {
      return finalize(true);
    }

    if (!isAdzunaLandRedirectPage(activePage.url())) {
      break;
    }
  }

  return finalize(false);
}

function mergePreludeIntoChase(args: {
  preludeUrlsVisited: string[];
  preludeClicks: ApplySessionClickRecord[];
  chase: CtaChaseResult;
}): CtaChaseResult {
  const mergedUrlsVisited = dedupeUrls([
    ...args.preludeUrlsVisited,
    ...args.chase.urlsVisited,
  ]);
  const hopCount = args.preludeClicks.length + args.chase.hopCount;
  const clicks = [...args.preludeClicks, ...args.chase.clicks];

  if ("unavailable" in args.chase && args.chase.unavailable) {
    return {
      ...args.chase,
      hopCount,
      urlsVisited: mergedUrlsVisited,
      clicks,
    };
  }

  return {
    ...args.chase,
    hopCount,
    urlsVisited: mergedUrlsVisited,
    clicks,
  };
}

async function collectApplySourceCandidates(
  page: Page,
): Promise<{
  candidates: ApplySourceCandidate[];
  rejectedCandidates: ApplySourceRejectedCandidate[];
}> {
  const currentUrl = page.url();
  const currentHostname = parseHostname(currentUrl);
  const snapshots = await page
    .locator("a")
    .evaluateAll(
      (anchors, args) => {
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

        const seen = new Set<string>();
        const results: ApplySourceAnchorSnapshot[] = [];

        for (const anchor of anchors) {
          if (!(anchor instanceof HTMLAnchorElement)) continue;

          const rawHref = anchor.getAttribute("href")?.trim();
          if (!rawHref) continue;

          let absoluteHref = "";
          let url: URL | null = null;

          try {
            url = new URL(rawHref, args.currentUrl);
            absoluteHref = url.toString();
          } catch {
            continue;
          }

          if (!url || !absoluteHref || seen.has(absoluteHref)) continue;
          seen.add(absoluteHref);

          const text = [
            anchor.textContent ?? "",
            anchor.getAttribute("aria-label") ?? "",
            anchor.getAttribute("title") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 240);

          results.push({
            href: absoluteHref,
            hostname: url.hostname.toLowerCase(),
            pathname: url.pathname,
            search: url.search,
            text,
            inMainContent: Boolean(
              anchor.closest(
                "main, article, [role='main'], .job, .job-content, .job-header, .job-details",
              ),
            ),
            inHeaderOrFooter: Boolean(
              anchor.closest("header, footer, nav, [role='navigation']"),
            ),
            visible: isVisible(anchor),
          });
        }

        return results;
      },
      {
        currentUrl,
      },
    )
    .catch(() => []);

  const candidates: ApplySourceCandidate[] = [];
  const rejectedCandidates: ApplySourceRejectedCandidate[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.hostname) {
      continue;
    }

    if (!snapshot.visible) {
      rejectedCandidates.push({
        href: snapshot.href,
        hostname: snapshot.hostname,
        text: snapshot.text,
        reason: "hidden_link",
      });
      continue;
    }

    const rejectReason = isLowValueAggregatorLink({
      currentUrl,
      currentHostname,
      href: snapshot.href,
      hostname: snapshot.hostname,
      pathname: snapshot.pathname,
      search: snapshot.search,
      text: snapshot.text,
      inHeaderOrFooter: snapshot.inHeaderOrFooter,
      inMainContent: snapshot.inMainContent,
    });

    if (rejectReason) {
      rejectedCandidates.push({
        href: snapshot.href,
        hostname: snapshot.hostname,
        text: snapshot.text,
        reason: rejectReason,
      });
      continue;
    }

    const rankedCandidate = rankApplySourceCandidate({
      currentHostname,
      href: snapshot.href,
      hostname: snapshot.hostname,
      pathname: snapshot.pathname,
      text: snapshot.text,
      inMainContent: snapshot.inMainContent,
      inHeaderOrFooter: snapshot.inHeaderOrFooter,
      visible: snapshot.visible,
    });

    if (rankedCandidate.score <= 0) {
      rejectedCandidates.push({
        href: snapshot.href,
        hostname: snapshot.hostname,
        text: snapshot.text,
        reason: "insufficient_apply_signal",
      });
      continue;
    }

    candidates.push(rankedCandidate);
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.href.localeCompare(right.href);
  });

  return {
    candidates: candidates.slice(0, 10),
    rejectedCandidates: rejectedCandidates.slice(0, 15),
  };
}

async function resolveApplySourceFromAggregatorPage(
  page: Page,
): Promise<ApplySourceResolverResult> {
  const { candidates, rejectedCandidates } =
    await collectApplySourceCandidates(page);
  const attemptedLinks = candidates.map((candidate) => candidate.href);
  const selectedLink = attemptedLinks[0];

  if (!selectedLink) {
    const result = {
      attemptedLinks,
      candidates,
      rejectedCandidates,
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
      candidates,
      rejectedCandidates,
      selectedLink,
      success: true,
      newUrl: page.url(),
    } satisfies ApplySourceResolverResult;

    console.log("[AUTO_APPLY_RESOLVER]", result);
    return result;
  } catch {
    const result = {
      attemptedLinks,
      candidates,
      rejectedCandidates,
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
  let activePage: Page | undefined;
  let remoteSession: Awaited<ReturnType<typeof createRemoteSession>> | null =
    null;
  let keepBrowserOpen = false;
  let headless: boolean | null = null;

  const attemptedSelectors: string[] = [];
  const missingNames: string[] = [];
  const entryUrl = args.jobUrl;
  const targetUrl = args.form?.embedUrl ?? args.jobUrl;
  let currentUrl = targetUrl;
  let initialLoadedUrl = targetUrl;
  let domain = parseHostname(entryUrl) || parseHostname(targetUrl);
  let stoppedAtUrl: string | undefined;
  let stoppedAtTitle: string | undefined;
  let ctaAttempts: ApplySessionCtaAttemptRecord[] = [];
  let entryCtaFound = false;
  let entryCtaClicked = false;
  let entryCtaClickedText: string | undefined;
  let entryCtaClickedSelector: string | undefined;
  let entryDismissedBlocker = false;
  let adzunaApplyCaptureDetected = false;
  let adzunaApplyCaptureSkipClicked = false;
  let adzunaApplyCaptureSkipText: string | undefined;
  let adzunaApplyCaptureSkipSelector: string | undefined;
  let adzunaPostApplyProgressionAttempted = false;
  let adzunaPostApplyProgressionSucceeded = false;
  let adzunaPostApplyUrlAfter: string | undefined;
  let adzunaPostApplyPopupDetected = false;
  let adzunaPostApplyNewPageDetected = false;
  let adzunaPostApplyFallbackAttempted = false;
  let handoffPageDetected = false;
  let handoffUrl: string | undefined;
  let handoffContinuationAttempted = false;
  let handoffContinuationSucceeded = false;
  let handoffCtaFound = false;
  let handoffCtaClicked = false;
  let handoffCtaClickedText: string | undefined;
  let handoffCtaClickedSelector: string | undefined;
  let handoffAttempts: ApplySessionCtaAttemptRecord[] = [];
  let cookiePromptDetected = false;
  let cookiePromptClicked = false;
  let cookiePromptClickedText: string | undefined;
  let cookiePromptSelector: string | undefined;
  let cookiePromptAttempts: ApplySessionCtaAttemptRecord[] = [];
  let postCookieWaitAttempted = false;
  let postCookieUrlBefore: string | undefined;
  let postCookieUrlAfter: string | undefined;
  let postCookieUrlChanged = false;
  let postCookieProgressDetected = false;
  let postCookieTitleAfter: string | undefined;
  let applyCtaClickedText: string | undefined;
  let applyCtaClickedSelector: string | undefined;
  let entryPhaseClicks: ApplySessionClickRecord[] = [];
  let entryPhaseUrlsVisited: string[] = [];
  let handoffPhaseClicks: ApplySessionClickRecord[] = [];
  let handoffPhaseUrlsVisited: string[] = [];
  let cookiePhaseClicks: ApplySessionClickRecord[] = [];
  let cookiePhaseUrlsVisited: string[] = [];
  let adzunaPhaseClicks: ApplySessionClickRecord[] = [];
  let adzunaPhaseUrlsVisited: string[] = [];
  let realApplyPreludeClicks: ApplySessionClickRecord[] = [];
  let trackedClicks: ApplySessionClickRecord[] = [];
  let trackedUrlsVisited: string[] = [];
  let trackedHopCount = 0;
  let resolverAttemptedLinks: string[] = [];
  let resolverCandidates: ApplySourceCandidate[] = [];
  let resolverRejectedCandidates: ApplySourceRejectedCandidate[] = [];
  let resolverSelectedLink: string | undefined;
  let resolverSuccess: boolean | undefined;
  let resolverNewUrl: string | undefined;
  let resolvedHandoffClickAttempted = false;
  let resolvedHandoffClickSucceeded = false;
  let resolvedHandoffElementFound = false;
  let resolvedHandoffLocatorStrategy: string | undefined;
  let resolvedHandoffDirectNavAttempted = false;
  let resolvedHandoffDirectNavSucceeded = false;
  let resolvedHandoffDirectNavUrl: string | undefined;
  let resolvedHandoffDirectNavUrlAfter: string | undefined;
  let adzunaFallbackLinkFound = false;
  let adzunaFallbackLinkClicked = false;
  let adzunaFallbackLinkText: string | undefined;
  let adzunaFallbackLocatorStrategy: string | undefined;
  let adzunaFallbackElementFound = false;
  let adzunaFallbackClickSucceeded = false;
  let adzunaFallbackHref: string | undefined;
  let adzunaFallbackHost: string | undefined;
  let adzunaFallbackDirectNavAttempted = false;
  let adzunaFallbackDirectNavSucceeded = false;
  let adzunaExtractedRedirectUrl: string | undefined;
  let adzunaExtractedRedirectSource:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | undefined;
  let adzunaExtractedRedirectHtmlRead = false;
  let adzunaExtractedRedirectFailureReason: string[] | undefined;
  let adzunaExtractedRedirectNavAttempted = false;
  let adzunaExtractedRedirectNavSucceeded = false;
  let adzunaFallbackUrlAfter: string | undefined;
  let resolvedHandoffClickedHref: string | undefined;
  let resolvedHandoffClickedText: string | undefined;
  let resolvedHandoffUrlBefore: string | undefined;
  let resolvedHandoffUrlAfter: string | undefined;
  let latestActionText: string | undefined;
  let latestActionSelector: string | undefined;

  const captureCurrentUrl = (pageOrUrl?: Page | string | null) => {
    if (typeof pageOrUrl === "string") {
      currentUrl = pageOrUrl;
      return currentUrl;
    }

    if (pageOrUrl) {
      activePage = pageOrUrl;
      currentUrl = pageOrUrl.url();
    }

    return currentUrl;
  };

  const debugContext = () => ({
    entryUrl,
    initialLoadedUrl,
    domain,
    stoppedAtUrl,
    stoppedAtTitle,
    lastActionText: latestActionText,
    lastActionSelector: latestActionSelector,
    ctaAttempts,
    entryCtaFound,
    entryCtaClicked,
    entryCtaClickedText,
    entryCtaClickedSelector,
    entryDismissedBlocker,
    adzunaApplyCaptureDetected,
    adzunaApplyCaptureSkipClicked,
    adzunaApplyCaptureSkipText,
    adzunaApplyCaptureSkipSelector,
    adzunaPostApplyProgressionAttempted,
    adzunaPostApplyProgressionSucceeded,
    adzunaPostApplyUrlAfter,
    adzunaPostApplyPopupDetected,
    adzunaPostApplyNewPageDetected,
    adzunaPostApplyFallbackAttempted,
    handoffPageDetected,
    handoffUrl,
    handoffContinuationAttempted,
    handoffContinuationSucceeded,
    handoffCtaFound,
    handoffCtaClicked,
    handoffCtaClickedText,
    handoffCtaClickedSelector,
    handoffAttempts,
    cookiePromptDetected,
    cookiePromptClicked,
    cookiePromptClickedText,
    cookiePromptSelector,
    cookiePromptAttempts,
    postCookieWaitAttempted,
    postCookieUrlBefore,
    postCookieUrlAfter,
    postCookieUrlChanged,
    postCookieProgressDetected,
    postCookieTitleAfter,
    applyCtaClickedText,
    applyCtaClickedSelector,
    ctaClickedText: latestActionText,
    ctaClickedSelector: latestActionSelector,
    dismissedBlocker: entryDismissedBlocker,
    resolverCandidates,
    resolverRejectedCandidates,
    resolvedHandoffClickAttempted,
    resolvedHandoffClickSucceeded,
    resolvedHandoffElementFound,
    resolvedHandoffLocatorStrategy,
    resolvedHandoffDirectNavAttempted,
    resolvedHandoffDirectNavSucceeded,
    resolvedHandoffDirectNavUrl,
    resolvedHandoffDirectNavUrlAfter,
    adzunaFallbackLinkFound,
    adzunaFallbackLinkClicked,
    adzunaFallbackLinkText,
    adzunaFallbackLocatorStrategy,
    adzunaFallbackElementFound,
    adzunaFallbackClickSucceeded,
    adzunaFallbackHref,
    adzunaFallbackHost,
    adzunaFallbackDirectNavAttempted,
    adzunaFallbackDirectNavSucceeded,
    adzunaExtractedRedirectUrl,
    adzunaExtractedRedirectSource,
    adzunaExtractedRedirectHtmlRead,
    adzunaExtractedRedirectFailureReason,
    adzunaExtractedRedirectNavAttempted,
    adzunaExtractedRedirectNavSucceeded,
    adzunaFallbackUrlAfter,
    resolvedHandoffClickedHref,
    resolvedHandoffClickedText,
    resolvedHandoffUrlBefore,
    resolvedHandoffUrlAfter,
  });

  const readPageTitle = async (page?: Page | null) => {
    if (!page) return undefined;

    const title = await page.title().catch(() => "");
    const normalized = title.trim();
    return normalized.length ? normalized : undefined;
  };

  const captureStopPoint = async (
    page?: Page | null,
    overrides?: {
      lastActionText?: string;
      lastActionSelector?: string;
    },
  ) => {
    stoppedAtUrl = captureCurrentUrl(page);
    stoppedAtTitle = await readPageTitle(page);

    return {
      stoppedAtUrl,
      stoppedAtTitle,
      lastActionText:
        overrides?.lastActionText ??
        latestActionText,
      lastActionSelector:
        overrides?.lastActionSelector ??
        latestActionSelector,
    };
  };

  const mergeCookiePromptPhase = (result: CookieConsentPhaseResult) => {
    cookiePromptDetected = cookiePromptDetected || result.detected;
    cookiePromptClicked = cookiePromptClicked || result.clicked;
    if (result.clickedText) {
      cookiePromptClickedText = result.clickedText;
    }
    if (result.clickedSelector) {
      cookiePromptSelector = result.clickedSelector;
    }
    postCookieWaitAttempted =
      postCookieWaitAttempted || result.postCookieWaitAttempted;
    if (result.postCookieUrlBefore) {
      postCookieUrlBefore = result.postCookieUrlBefore;
    }
    if (result.postCookieUrlAfter) {
      postCookieUrlAfter = result.postCookieUrlAfter;
    }
    postCookieUrlChanged =
      postCookieUrlChanged || Boolean(result.postCookieUrlChanged);
    postCookieProgressDetected =
      postCookieProgressDetected ||
      Boolean(result.postCookieProgressDetected);
    if (result.postCookieTitleAfter) {
      postCookieTitleAfter = result.postCookieTitleAfter;
    }
    if (result.attempts.length > 0) {
      cookiePromptAttempts = [...cookiePromptAttempts, ...result.attempts];
      ctaAttempts = [...ctaAttempts, ...result.attempts];
    }
    if (result.clicks.length > 0) {
      cookiePhaseClicks = [...cookiePhaseClicks, ...result.clicks];
      latestActionText = result.clickedText ?? latestActionText;
      latestActionSelector = result.clickedSelector ?? latestActionSelector;
    }
    if (result.urlsVisited.length > 0) {
      cookiePhaseUrlsVisited = dedupeUrls([
        ...cookiePhaseUrlsVisited,
        ...result.urlsVisited,
      ]);
    }
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
      entryUrl,
      targetUrl,
      mode: args.mode ?? "AUTO",
      usingRemoteBrowser: Boolean(remoteSession),
      remoteProvider: remoteSession?.provider ?? null,
      headless: remoteSession ? true : headless,
      requestedHeadless: process.env.PLAYWRIGHT_HEADLESS ?? null,
    });

    context = await browser.newContext();
    let page = await context.newPage();
    activePage = page;
    await args.onPageReady?.(page, context);

    console.log("[AUTO_APPLY_PLAYWRIGHT] navigating", {
      entryUrl,
      targetUrl,
    });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(page);
    initialLoadedUrl = captureCurrentUrl(page);
    domain = parseHostname(initialLoadedUrl) || parseHostname(entryUrl);

    console.log("[AUTO_APPLY_PLAYWRIGHT] initial load", {
      entryUrl,
      targetUrl,
      initialLoadedUrl,
      domain,
    });

    const initialSignals = await detectPageSignals(page);
    const forceEntryCtaPhase = shouldForceEntryCtaPhase(
      domain,
      page.url(),
    );
    const realApplyDestinationPage = isImmediateApplyDestinationPage({
      hostname: domain,
      currentUrl: page.url(),
      signals: initialSignals,
    });
    const willRunEntryCtaPhase =
      forceEntryCtaPhase || !realApplyDestinationPage;

    console.log("[AUTO_APPLY_ENTRY_CTA] gating", {
      domain,
      currentUrl: page.url(),
      isRealApplyDestinationPage: realApplyDestinationPage,
      forceEntryCtaPhase,
      willRunEntryCtaPhase,
    });

    const adzunaDetailsPhase = isAdzunaDetailsPage(page.url())
      ? await runAdzunaDetailsApplyPhase({
          page,
          context,
          onPageReady: args.onPageReady,
        })
      : {
          page,
          urlsVisited: [page.url()],
          clicks: [],
          attempts: [],
          applyClicks: [],
          handled: false,
          applyClicked: false,
          applyCaptureDetected: false,
          applyCaptureSkipClicked: false,
          postApplyProgressionAttempted: false,
          postApplyProgressionSucceeded: false,
          postApplyPopupDetected: false,
          postApplyNewPageDetected: false,
          postApplyFallbackAttempted: false,
        };

    page = adzunaDetailsPhase.page;
    captureCurrentUrl(page);
    if (adzunaDetailsPhase.attempts.length > 0) {
      ctaAttempts = [...ctaAttempts, ...adzunaDetailsPhase.attempts];
    }
    if (adzunaDetailsPhase.clicks.length > 0) {
      adzunaPhaseClicks = adzunaDetailsPhase.clicks;
      adzunaPhaseUrlsVisited = adzunaDetailsPhase.urlsVisited;
    }
    if (adzunaDetailsPhase.applyClicks.length > 0) {
      realApplyPreludeClicks = adzunaDetailsPhase.applyClicks;
      applyCtaClickedText = adzunaDetailsPhase.applyClickedText;
      applyCtaClickedSelector = adzunaDetailsPhase.applyClickedSelector;
    }
    adzunaApplyCaptureDetected = adzunaDetailsPhase.applyCaptureDetected;
    adzunaApplyCaptureSkipClicked =
      adzunaDetailsPhase.applyCaptureSkipClicked;
    adzunaApplyCaptureSkipText = adzunaDetailsPhase.applyCaptureSkipText;
    adzunaApplyCaptureSkipSelector =
      adzunaDetailsPhase.applyCaptureSkipSelector;
    adzunaPostApplyProgressionAttempted =
      adzunaDetailsPhase.postApplyProgressionAttempted;
    adzunaPostApplyProgressionSucceeded =
      adzunaDetailsPhase.postApplyProgressionSucceeded;
    adzunaPostApplyUrlAfter = adzunaDetailsPhase.postApplyUrlAfter;
    adzunaPostApplyPopupDetected =
      adzunaDetailsPhase.postApplyPopupDetected;
    adzunaPostApplyNewPageDetected =
      adzunaDetailsPhase.postApplyNewPageDetected;
    adzunaPostApplyFallbackAttempted =
      adzunaDetailsPhase.postApplyFallbackAttempted;
    latestActionText =
      adzunaDetailsPhase.latestActionText ?? latestActionText;
    latestActionSelector =
      adzunaDetailsPhase.latestActionSelector ?? latestActionSelector;

    const shouldRunGenericEntryPhase =
      willRunEntryCtaPhase && !adzunaDetailsPhase.applyClicked;

    const entryPhase = shouldRunGenericEntryPhase
      ? await runEntryCtaPhase({
          page,
          context,
          domain: detectApplyDomain(initialLoadedUrl || entryUrl),
          onPageReady: args.onPageReady,
        })
      : {
          page,
          urlsVisited: [page.url()],
          clicks: [],
          attempts: [],
          ctaFound: false,
          dismissedBlocker: false,
        };

    page = entryPhase.page;
    captureCurrentUrl(page);
    entryPhaseClicks = entryPhase.clicks;
    entryPhaseUrlsVisited = entryPhase.urlsVisited;
    trackedClicks = [];
    trackedUrlsVisited = entryPhaseUrlsVisited;
    trackedHopCount = 0;
    ctaAttempts = entryPhase.attempts;
    entryCtaFound = entryPhase.ctaFound;
    entryCtaClicked = entryPhase.clicks.length > 0;
    entryCtaClickedText = entryPhase.ctaClickedText;
    entryCtaClickedSelector = entryPhase.ctaClickedSelector;
    entryDismissedBlocker = entryPhase.dismissedBlocker;
    if (entryPhase.ctaClickedText || entryPhase.ctaClickedSelector) {
      latestActionText = entryPhase.ctaClickedText ?? latestActionText;
      latestActionSelector =
        entryPhase.ctaClickedSelector ?? latestActionSelector;
    }
    cookiePhaseClicks = [];
    cookiePhaseUrlsVisited = [];
    cookiePromptAttempts = [];

    if (isAdzunaLandRedirectPage(page.url())) {
      const handoffCookiePhase = await dismissCookieConsentIfPresent({
        page,
        context,
        onPageReady: args.onPageReady,
      });
      page = handoffCookiePhase.page;
      captureCurrentUrl(page);
      mergeCookiePromptPhase(handoffCookiePhase);

      const handoffPhase = await runHandoffContinuationPhase({
        page,
        context,
        resolverSelectedLink,
        resolverCandidates,
        onPageReady: args.onPageReady,
      });

      page = handoffPhase.page;
      captureCurrentUrl(page);
      handoffPageDetected = handoffPhase.handoffPageDetected;
      handoffUrl = handoffPhase.handoffUrl;
      handoffContinuationAttempted = handoffPhase.continuationAttempted;
      handoffContinuationSucceeded = handoffPhase.continuationSucceeded;
      handoffCtaFound = handoffPhase.ctaFound;
      handoffCtaClicked = handoffPhase.ctaClicked;
      handoffCtaClickedText = handoffPhase.ctaClickedText;
      handoffCtaClickedSelector = handoffPhase.ctaClickedSelector;
      handoffAttempts = handoffPhase.attempts;
      handoffPhaseClicks = handoffPhase.clicks;
      handoffPhaseUrlsVisited = handoffPhase.urlsVisited;
      resolvedHandoffClickAttempted =
        handoffPhase.resolvedHandoffClickAttempted;
      resolvedHandoffClickSucceeded =
        handoffPhase.resolvedHandoffClickSucceeded;
      resolvedHandoffElementFound =
        handoffPhase.resolvedHandoffElementFound;
      resolvedHandoffLocatorStrategy =
        handoffPhase.resolvedHandoffLocatorStrategy;
      resolvedHandoffDirectNavAttempted =
        handoffPhase.resolvedHandoffDirectNavAttempted;
      resolvedHandoffDirectNavSucceeded =
        handoffPhase.resolvedHandoffDirectNavSucceeded;
      resolvedHandoffDirectNavUrl =
        handoffPhase.resolvedHandoffDirectNavUrl;
      resolvedHandoffDirectNavUrlAfter =
        handoffPhase.resolvedHandoffDirectNavUrlAfter;
      adzunaFallbackLinkFound = handoffPhase.adzunaFallbackLinkFound;
      adzunaFallbackLinkClicked = handoffPhase.adzunaFallbackLinkClicked;
      adzunaFallbackLinkText = handoffPhase.adzunaFallbackLinkText;
      adzunaFallbackLocatorStrategy =
        handoffPhase.adzunaFallbackLocatorStrategy;
      adzunaFallbackElementFound =
        handoffPhase.adzunaFallbackElementFound;
      adzunaFallbackClickSucceeded =
        handoffPhase.adzunaFallbackClickSucceeded;
      adzunaFallbackHref = handoffPhase.adzunaFallbackHref;
      adzunaFallbackHost = handoffPhase.adzunaFallbackHost;
      adzunaFallbackDirectNavAttempted =
        handoffPhase.adzunaFallbackDirectNavAttempted;
      adzunaFallbackDirectNavSucceeded =
        handoffPhase.adzunaFallbackDirectNavSucceeded;
      adzunaExtractedRedirectUrl =
        handoffPhase.adzunaExtractedRedirectUrl;
      adzunaExtractedRedirectSource =
        handoffPhase.adzunaExtractedRedirectSource;
      adzunaExtractedRedirectHtmlRead =
        handoffPhase.adzunaExtractedRedirectHtmlRead;
      adzunaExtractedRedirectFailureReason =
        handoffPhase.adzunaExtractedRedirectFailureReason;
      adzunaExtractedRedirectNavAttempted =
        handoffPhase.adzunaExtractedRedirectNavAttempted;
      adzunaExtractedRedirectNavSucceeded =
        handoffPhase.adzunaExtractedRedirectNavSucceeded;
      adzunaFallbackUrlAfter = handoffPhase.adzunaFallbackUrlAfter;
      resolvedHandoffClickedHref = handoffPhase.resolvedHandoffClickedHref;
      resolvedHandoffClickedText = handoffPhase.resolvedHandoffClickedText;
      resolvedHandoffUrlBefore = handoffPhase.resolvedHandoffUrlBefore;
      resolvedHandoffUrlAfter = handoffPhase.resolvedHandoffUrlAfter;
      ctaAttempts = [...ctaAttempts, ...handoffPhase.attempts];
      if (handoffPhase.ctaClickedText || handoffPhase.ctaClickedSelector) {
        latestActionText =
          handoffPhase.ctaClickedText ?? latestActionText;
        latestActionSelector =
          handoffPhase.ctaClickedSelector ?? latestActionSelector;
      }
    }

    const initialCookiePhase = await dismissCookieConsentIfPresent({
      page,
      context,
      onPageReady: args.onPageReady,
    });
    page = initialCookiePhase.page;
    captureCurrentUrl(page);
    mergeCookiePromptPhase(initialCookiePhase);

    let chase: CtaChaseResult = await chaseApplyPath({
      page,
      context,
      onPageReady: args.onPageReady,
      onStatus: args.onStatus,
      viewerUrl: remoteSession?.viewerUrl,
      remoteSessionId: remoteSession?.sessionId,
      openUrl: page.url(),
    });

    page = chase.page;
    captureCurrentUrl(page);
    let rawChaseEvidence = buildCtaEvidence(
      chase,
      page.url(),
      realApplyPreludeClicks,
    );
    const initialStopClassification = deriveStopClassification({
      targetUrl,
      finalUrl: page.url(),
      currentUrl: page.url(),
      applyCtaFound: rawChaseEvidence.applyCtaFound,
      applyCtaClicked: rawChaseEvidence.applyCtaClicked,
      hopCount: rawChaseEvidence.hopCount,
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
      !rawChaseEvidence.applyCtaFound &&
      !(handoffPageDetected && handoffContinuationAttempted)
    ) {
      const resolverResult = await resolveApplySourceFromAggregatorPage(page);
      resolverAttemptedLinks = resolverResult.attemptedLinks;
      resolverCandidates = resolverResult.candidates;
      resolverRejectedCandidates = resolverResult.rejectedCandidates;
      resolverSelectedLink = resolverResult.selectedLink;
      resolverSuccess = resolverResult.success;
      resolverNewUrl = resolverResult.newUrl;

      if (resolverResult.success) {
        captureCurrentUrl(page);
        handoffPhaseClicks = [];
        handoffPhaseUrlsVisited = [];
        handoffAttempts = [];

        if (isAdzunaLandRedirectPage(page.url())) {
          const handoffCookiePhase = await dismissCookieConsentIfPresent({
            page,
            context,
            onPageReady: args.onPageReady,
          });
          page = handoffCookiePhase.page;
          captureCurrentUrl(page);
          mergeCookiePromptPhase(handoffCookiePhase);

          const handoffPhase = await runHandoffContinuationPhase({
            page,
            context,
            resolverSelectedLink,
            resolverCandidates,
            onPageReady: args.onPageReady,
          });

          page = handoffPhase.page;
          captureCurrentUrl(page);
          handoffPageDetected = handoffPhase.handoffPageDetected;
          handoffUrl = handoffPhase.handoffUrl;
          handoffContinuationAttempted =
            handoffPhase.continuationAttempted;
          handoffContinuationSucceeded =
            handoffPhase.continuationSucceeded;
          handoffCtaFound = handoffPhase.ctaFound;
          handoffCtaClicked = handoffPhase.ctaClicked;
          handoffCtaClickedText = handoffPhase.ctaClickedText;
          handoffCtaClickedSelector = handoffPhase.ctaClickedSelector;
          handoffAttempts = handoffPhase.attempts;
          handoffPhaseClicks = handoffPhase.clicks;
          handoffPhaseUrlsVisited = handoffPhase.urlsVisited;
          resolvedHandoffClickAttempted =
            handoffPhase.resolvedHandoffClickAttempted;
          resolvedHandoffClickSucceeded =
            handoffPhase.resolvedHandoffClickSucceeded;
          resolvedHandoffElementFound =
            handoffPhase.resolvedHandoffElementFound;
          resolvedHandoffLocatorStrategy =
            handoffPhase.resolvedHandoffLocatorStrategy;
          resolvedHandoffDirectNavAttempted =
            handoffPhase.resolvedHandoffDirectNavAttempted;
          resolvedHandoffDirectNavSucceeded =
            handoffPhase.resolvedHandoffDirectNavSucceeded;
          resolvedHandoffDirectNavUrl =
            handoffPhase.resolvedHandoffDirectNavUrl;
          resolvedHandoffDirectNavUrlAfter =
            handoffPhase.resolvedHandoffDirectNavUrlAfter;
          adzunaFallbackLinkFound =
            handoffPhase.adzunaFallbackLinkFound;
          adzunaFallbackLinkClicked =
            handoffPhase.adzunaFallbackLinkClicked;
          adzunaFallbackLinkText =
            handoffPhase.adzunaFallbackLinkText;
          adzunaFallbackLocatorStrategy =
            handoffPhase.adzunaFallbackLocatorStrategy;
          adzunaFallbackElementFound =
            handoffPhase.adzunaFallbackElementFound;
          adzunaFallbackClickSucceeded =
            handoffPhase.adzunaFallbackClickSucceeded;
          adzunaFallbackHref = handoffPhase.adzunaFallbackHref;
          adzunaFallbackHost = handoffPhase.adzunaFallbackHost;
          adzunaFallbackDirectNavAttempted =
            handoffPhase.adzunaFallbackDirectNavAttempted;
          adzunaFallbackDirectNavSucceeded =
            handoffPhase.adzunaFallbackDirectNavSucceeded;
          adzunaExtractedRedirectUrl =
            handoffPhase.adzunaExtractedRedirectUrl;
          adzunaExtractedRedirectSource =
            handoffPhase.adzunaExtractedRedirectSource;
          adzunaExtractedRedirectHtmlRead =
            handoffPhase.adzunaExtractedRedirectHtmlRead;
          adzunaExtractedRedirectFailureReason =
            handoffPhase.adzunaExtractedRedirectFailureReason;
          adzunaExtractedRedirectNavAttempted =
            handoffPhase.adzunaExtractedRedirectNavAttempted;
          adzunaExtractedRedirectNavSucceeded =
            handoffPhase.adzunaExtractedRedirectNavSucceeded;
          adzunaFallbackUrlAfter =
            handoffPhase.adzunaFallbackUrlAfter;
          resolvedHandoffClickedHref =
            handoffPhase.resolvedHandoffClickedHref;
          resolvedHandoffClickedText =
            handoffPhase.resolvedHandoffClickedText;
          resolvedHandoffUrlBefore = handoffPhase.resolvedHandoffUrlBefore;
          resolvedHandoffUrlAfter = handoffPhase.resolvedHandoffUrlAfter;
          ctaAttempts = [...ctaAttempts, ...handoffPhase.attempts];
        }

        const resolvedCookiePhase = await dismissCookieConsentIfPresent({
          page,
          context,
          onPageReady: args.onPageReady,
        });
        page = resolvedCookiePhase.page;
        captureCurrentUrl(page);
        mergeCookiePromptPhase(resolvedCookiePhase);

        const resolvedChase = await chaseApplyPath({
          page,
          context,
          onPageReady: args.onPageReady,
          onStatus: args.onStatus,
          viewerUrl: remoteSession?.viewerUrl,
          remoteSessionId: remoteSession?.sessionId,
          openUrl: page.url(),
        });

        page = resolvedChase.page;
        captureCurrentUrl(page);
        chase = mergeChaseResults({
          initial: chase,
          resolved: resolvedChase,
          resolverUrl: resolverResult.newUrl ?? resolverResult.selectedLink,
        });
        rawChaseEvidence = buildCtaEvidence(
          chase,
          page.url(),
          realApplyPreludeClicks,
        );
      }
    }

    const effectiveChase = mergePreludeIntoChase({
      preludeUrlsVisited: dedupeUrls([
        ...adzunaPhaseUrlsVisited,
        ...entryPhaseUrlsVisited,
        ...handoffPhaseUrlsVisited,
        ...cookiePhaseUrlsVisited,
      ]),
      preludeClicks: [
        ...adzunaPhaseClicks,
        ...entryPhaseClicks,
        ...handoffPhaseClicks,
        ...cookiePhaseClicks,
      ],
      chase,
    });
    const chaseEvidence = buildCtaEvidence(
      chase,
      page.url(),
      realApplyPreludeClicks,
    );
    const latestApplyClick =
      chase.clicks.at(-1) ?? realApplyPreludeClicks.at(-1);
    applyCtaClickedText = latestApplyClick?.text ?? applyCtaClickedText;
    applyCtaClickedSelector =
      latestApplyClick?.selector ?? applyCtaClickedSelector;
    if (latestApplyClick?.text || latestApplyClick?.selector) {
      latestActionText = latestApplyClick?.text ?? latestActionText;
      latestActionSelector =
        latestApplyClick?.selector ?? latestActionSelector;
    }
    trackedClicks = effectiveChase.clicks;
    trackedUrlsVisited = effectiveChase.urlsVisited;
    trackedHopCount = chaseEvidence.hopCount;

    const landedWithoutStarting = isNoInteractionOnTarget({
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      hopCount: chaseEvidence.hopCount,
      currentUrl: chaseEvidence.currentUrl,
      targetUrl,
    });

    console.log("[AUTO_APPLY_PLAYWRIGHT] CTA chase result", {
      entryUrl,
      initialLoadedUrl,
      finalUrlAfterCtaChase: page.url(),
      domain,
      targetUrl,
      applyCtaFound: chaseEvidence.applyCtaFound,
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      urlBeforeClick: chaseEvidence.urlBeforeClick ?? null,
      urlAfterClick: chaseEvidence.urlAfterClick ?? null,
      currentUrl: chaseEvidence.currentUrl,
      hopCount: chaseEvidence.hopCount,
      entryCtaFound,
      entryCtaClicked,
      entryCtaClickedText: entryCtaClickedText ?? null,
      entryCtaClickedSelector: entryCtaClickedSelector ?? null,
      entryDismissedBlocker,
      adzunaApplyCaptureDetected,
      adzunaApplyCaptureSkipClicked,
      adzunaApplyCaptureSkipText: adzunaApplyCaptureSkipText ?? null,
      adzunaApplyCaptureSkipSelector:
        adzunaApplyCaptureSkipSelector ?? null,
      adzunaPostApplyProgressionAttempted,
      adzunaPostApplyProgressionSucceeded,
      adzunaPostApplyUrlAfter: adzunaPostApplyUrlAfter ?? null,
      adzunaPostApplyPopupDetected,
      adzunaPostApplyNewPageDetected,
      adzunaPostApplyFallbackAttempted,
      handoffPageDetected,
      handoffUrl: handoffUrl ?? null,
      handoffContinuationAttempted,
      handoffContinuationSucceeded,
      handoffCtaFound,
      handoffCtaClicked,
      handoffCtaClickedText: handoffCtaClickedText ?? null,
      handoffCtaClickedSelector: handoffCtaClickedSelector ?? null,
      handoffAttempts,
      resolvedHandoffClickAttempted,
      resolvedHandoffElementFound,
      resolvedHandoffLocatorStrategy:
        resolvedHandoffLocatorStrategy ?? null,
      resolvedHandoffClickSucceeded,
      resolvedHandoffDirectNavAttempted,
      resolvedHandoffDirectNavSucceeded,
      resolvedHandoffDirectNavUrl: resolvedHandoffDirectNavUrl ?? null,
      resolvedHandoffDirectNavUrlAfter:
        resolvedHandoffDirectNavUrlAfter ?? null,
      adzunaFallbackLinkFound,
      adzunaFallbackLinkClicked,
      adzunaFallbackLinkText: adzunaFallbackLinkText ?? null,
      adzunaFallbackLocatorStrategy:
        adzunaFallbackLocatorStrategy ?? null,
      adzunaFallbackElementFound,
      adzunaFallbackClickSucceeded,
      adzunaFallbackHref: adzunaFallbackHref ?? null,
      adzunaFallbackHost: adzunaFallbackHost ?? null,
      adzunaFallbackDirectNavAttempted,
      adzunaFallbackDirectNavSucceeded,
      adzunaExtractedRedirectUrl: adzunaExtractedRedirectUrl ?? null,
      adzunaExtractedRedirectSource:
        adzunaExtractedRedirectSource ?? null,
      adzunaExtractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        adzunaExtractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter: adzunaFallbackUrlAfter ?? null,
      resolvedHandoffClickedHref: resolvedHandoffClickedHref ?? null,
      resolvedHandoffClickedText: resolvedHandoffClickedText ?? null,
      resolvedHandoffUrlBefore: resolvedHandoffUrlBefore ?? null,
      resolvedHandoffUrlAfter: resolvedHandoffUrlAfter ?? null,
      cookiePromptDetected,
      cookiePromptClicked,
      cookiePromptClickedText: cookiePromptClickedText ?? null,
      cookiePromptSelector: cookiePromptSelector ?? null,
      cookiePromptAttempts,
      postCookieWaitAttempted,
      postCookieUrlBefore: postCookieUrlBefore ?? null,
      postCookieUrlAfter: postCookieUrlAfter ?? null,
      postCookieUrlChanged,
      postCookieProgressDetected,
      postCookieTitleAfter: postCookieTitleAfter ?? null,
      applyCtaClickedText: applyCtaClickedText ?? null,
      applyCtaClickedSelector: applyCtaClickedSelector ?? null,
      ctaClickedText: latestActionText ?? null,
      ctaClickedSelector: latestActionSelector ?? null,
      dismissedBlocker: entryDismissedBlocker,
      ctaAttempts,
      resolverCandidates,
      resolverRejectedCandidates,
      resolverSelectedLink: resolverSelectedLink ?? null,
      confirmationTextFound: chase.signals.confirmationTextFound,
      confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
      successUrlPatternMatched: chase.signals.successUrlPatternMatched,
    });

    const stalledAdzunaPostApply =
      adzunaPostApplyProgressionAttempted &&
      !adzunaPostApplyProgressionSucceeded &&
      isAdzunaDetailsPage(page.url());

    if (stalledAdzunaPostApply) {
      const finalUrl = page.url();
      const finalStatus = "AUTO_APPLY_UNAVAILABLE";
      const message =
        "Adzuna apply click did not progress beyond the details page.";

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
          ...debugContext(),
          ...(await captureStopPoint(page)),
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
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: chase.signals.formDetected,
          confirmationDetected: chase.signals.confirmationDetected,
          verificationDetected: false,
          finalReason:
            chase.finalReason ??
            "Adzuna post-apply progression did not leave the details page.",
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

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
            ...debugContext(),
            ...(await captureStopPoint(page)),
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
            hopCount: chaseEvidence.hopCount,
            urlsVisited: effectiveChase.urlsVisited,
            clicks: effectiveChase.clicks,
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
          ...debugContext(),
          ...(await captureStopPoint(page)),
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
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
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
          ...debugContext(),
          ...(await captureStopPoint(page)),
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
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
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
          ...debugContext(),
          ...(await captureStopPoint(page)),
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
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
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
          ...debugContext(),
          ...(await captureStopPoint(page)),
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
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
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
          ...debugContext(),
          ...(await captureStopPoint(page)),
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
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
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
          ...debugContext(),
          ...(await captureStopPoint(page, {
            lastActionText: submitButtonClicked
              ? "Submit application"
              : undefined,
            lastActionSelector: submitUsed ?? undefined,
          })),
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
          hopCount: chaseEvidence.hopCount,
          urlsVisited: [...effectiveChase.urlsVisited, finalUrl],
          clicks: effectiveChase.clicks,
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
        ...debugContext(),
        ...(await captureStopPoint(page, {
          lastActionText: submitButtonClicked
            ? "Submit application"
            : undefined,
          lastActionSelector: submitUsed ?? undefined,
        })),
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
        hopCount: chaseEvidence.hopCount,
        urlsVisited: [...effectiveChase.urlsVisited, finalUrl],
        clicks: effectiveChase.clicks,
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
    const preErrorHopCount = trackedHopCount;
    const preErrorUrlsVisited = dedupeUrls([
      ...trackedUrlsVisited,
      finalUrl,
    ]);
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
      applyCtaFound: preErrorHopCount > 0,
      applyCtaClicked: preErrorHopCount > 0,
      currentUrl: finalUrl,
      hopCount: preErrorHopCount,
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
        ...debugContext(),
        ...(await captureStopPoint(activePage)),
        finalUrl,
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        targetUrl,
        applyCtaFound: preErrorHopCount > 0,
        applyCtaClicked: preErrorHopCount > 0,
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
        hopCount: preErrorHopCount,
        urlsVisited: preErrorUrlsVisited,
        clicks: trackedClicks,
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
    entryUrl: result.entryUrl,
    initialLoadedUrl: result.initialLoadedUrl,
    finalUrl: result.finalUrl,
    domain: result.domain,
    stoppedAtUrl: result.stoppedAtUrl,
    stoppedAtTitle: result.stoppedAtTitle,
    lastActionText: result.lastActionText,
    lastActionSelector: result.lastActionSelector,
    hopCount: result.hopCount,
    urlsVisited: result.urlsVisited,
    clicks: result.clicks,
    ctaAttempts: result.ctaAttempts,
    entryCtaFound: result.entryCtaFound,
    entryCtaClicked: result.entryCtaClicked,
    entryCtaClickedText: result.entryCtaClickedText,
    entryCtaClickedSelector: result.entryCtaClickedSelector,
    entryDismissedBlocker: result.entryDismissedBlocker,
    adzunaApplyCaptureDetected: result.adzunaApplyCaptureDetected,
    adzunaApplyCaptureSkipClicked:
      result.adzunaApplyCaptureSkipClicked,
    adzunaApplyCaptureSkipText: result.adzunaApplyCaptureSkipText,
    adzunaApplyCaptureSkipSelector:
      result.adzunaApplyCaptureSkipSelector,
    adzunaPostApplyProgressionAttempted:
      result.adzunaPostApplyProgressionAttempted,
    adzunaPostApplyProgressionSucceeded:
      result.adzunaPostApplyProgressionSucceeded,
    adzunaPostApplyUrlAfter: result.adzunaPostApplyUrlAfter,
    adzunaPostApplyPopupDetected: result.adzunaPostApplyPopupDetected,
    adzunaPostApplyNewPageDetected:
      result.adzunaPostApplyNewPageDetected,
    adzunaPostApplyFallbackAttempted:
      result.adzunaPostApplyFallbackAttempted,
    handoffPageDetected: result.handoffPageDetected,
    handoffUrl: result.handoffUrl,
    handoffContinuationAttempted: result.handoffContinuationAttempted,
    handoffContinuationSucceeded: result.handoffContinuationSucceeded,
    handoffCtaFound: result.handoffCtaFound,
    handoffCtaClicked: result.handoffCtaClicked,
    handoffCtaClickedText: result.handoffCtaClickedText,
    handoffCtaClickedSelector: result.handoffCtaClickedSelector,
    handoffAttempts: result.handoffAttempts,
    cookiePromptDetected: result.cookiePromptDetected,
    cookiePromptClicked: result.cookiePromptClicked,
    cookiePromptClickedText: result.cookiePromptClickedText,
    cookiePromptSelector: result.cookiePromptSelector,
    cookiePromptAttempts: result.cookiePromptAttempts,
    postCookieWaitAttempted: result.postCookieWaitAttempted,
    postCookieUrlBefore: result.postCookieUrlBefore,
    postCookieUrlAfter: result.postCookieUrlAfter,
    postCookieUrlChanged: result.postCookieUrlChanged,
    postCookieProgressDetected: result.postCookieProgressDetected,
    postCookieTitleAfter: result.postCookieTitleAfter,
    applyCtaClickedText: result.applyCtaClickedText,
    applyCtaClickedSelector: result.applyCtaClickedSelector,
    ctaClickedText: result.ctaClickedText,
    ctaClickedSelector: result.ctaClickedSelector,
    dismissedBlocker: result.dismissedBlocker,
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
    resolverAttemptedLinks: result.resolverAttemptedLinks,
    resolverCandidates: result.resolverCandidates,
    resolverRejectedCandidates: result.resolverRejectedCandidates,
    resolverSelectedLink: result.resolverSelectedLink,
    resolverSuccess: result.resolverSuccess,
    resolverNewUrl: result.resolverNewUrl,
    resolvedHandoffClickAttempted: result.resolvedHandoffClickAttempted,
    resolvedHandoffClickSucceeded: result.resolvedHandoffClickSucceeded,
    resolvedHandoffClickedHref: result.resolvedHandoffClickedHref,
    resolvedHandoffClickedText: result.resolvedHandoffClickedText,
    resolvedHandoffUrlBefore: result.resolvedHandoffUrlBefore,
    resolvedHandoffUrlAfter: result.resolvedHandoffUrlAfter,
    adzunaExtractedRedirectUrl: result.adzunaExtractedRedirectUrl,
    adzunaExtractedRedirectSource:
      result.adzunaExtractedRedirectSource,
    adzunaExtractedRedirectHtmlRead:
      result.adzunaExtractedRedirectHtmlRead,
    adzunaExtractedRedirectFailureReason:
      result.adzunaExtractedRedirectFailureReason ?? [],
    adzunaExtractedRedirectNavAttempted:
      result.adzunaExtractedRedirectNavAttempted,
    adzunaExtractedRedirectNavSucceeded:
      result.adzunaExtractedRedirectNavSucceeded,
  } as ApplySessionDebug;
}
