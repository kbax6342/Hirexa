import type { Browser, BrowserContext, Frame, Page, Response } from "playwright-core";
import { isAdzunaUnresolvedHandoffUrl, isAdzunaUrl } from "@/app/lib/apply/adzunaHandoff";
import {
  connectScrapflyBrowser,
  disconnectScrapflyBrowserSession,
} from "@/app/lib/apply/scrapfly-browser";
import { detectVerificationGate } from "@/app/lib/apply/verification";
import { validateAutomationStartUrl } from "@/app/lib/apply/urlValidation";
import {
  isLikelyAtsUrl,
  isLikelyCompanyCareersUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

type ResolutionCandidate = {
  url: string;
  source: string;
  score: number;
  reason: string;
};

type CtaScanCandidate = {
  index: number;
  text: string;
  href: string | null;
  tagName: string;
  role: string | null;
  ariaLabel: string | null;
  title: string | null;
  visible: boolean;
  source: string;
};

type AdzunaHandoffEvidence = {
  provider?: "scrapfly";
  source?: "adzuna";
  scrapflyAttempted?: boolean;
  scrapflySessionId?: string;
  aggregatorUrl?: string;
  finalUrl?: string;
  responseStatus?: number;
  resolvedDirectUrl?: string;
  handoffClickAttempted: boolean;
  handoffClickMethod?: "element_click" | "continuation_click" | "direct_goto";
  handoffClickUrl?: string;
  handoffClickText?: string;
  handoffBeforeUrl?: string;
  handoffAfterUrl?: string;
  continuationAttempted?: boolean;
  continuationText?: string;
  continuationHref?: string;
  directGotoFallbackAttempted?: boolean;
  directGotoFallbackReason?: string;
  directGotoResponseUrl?: string;
  directGotoStatus?: number;
  handoffPopupUrl?: string | null;
  handoffFinalUrl?: string;
  handoffLeftAdzunaDomain?: boolean;
  handoffResponseStatus?: number;
  handoffPageTitle?: string;
  errorCode?: string;
  adzunaHandoffAccessDenied?: boolean;
  adzunaLoginContinueGateDetected?: boolean;
  adzunaLoginContinueDetected?: boolean;
  adzunaSuspiciousBehaviorGateDetected?: boolean;
  adzunaLoginToContinueAvailable?: boolean;
  adzunaAuthenticateUrl?: string;
  adzunaLoginToContinueClicked?: boolean;
  adzunaLoginPageDetected?: boolean;
  adzunaCredentialAvailable?: boolean;
  adzunaLoginAttempted?: boolean;
  adzunaLoginSucceeded?: boolean;
  adzunaLoginFailedReason?: string;
  adzunaPostLoginHandoffRetried?: boolean;
  adzunaPostLoginResolvedDirectUrl?: string;
  manualContinuationRequired?: boolean;
  suggestedAction?: string;
  downstreamCandidateCount: number;
  rejectedTrackingCandidateCount: number;
  rejectedFinalCandidateReasons: string[];
  unresolvedReason?: string;
};

type CandidateEvaluation =
  | {
      candidate: ResolutionCandidate;
      rejectionReason?: null;
    }
  | {
      candidate: null;
      rejectionReason: string;
    };

export type AdzunaScrapflyResolutionResult =
  | {
      ok: true;
      resolvedUrl: string;
      reason?: string;
      method:
        | "final_navigation"
        | "popup"
        | "apply_cta_href"
        | "network_redirect"
        | "script_redirect"
        | "meta_refresh"
        | "external_link";
      sessionId: string;
      urlsVisited: string[];
      candidates: ResolutionCandidate[];
    } & AdzunaHandoffEvidence
  | {
      ok: false;
      error: string;
      errorCode?: string;
      reason?: string;
      pageType?: string;
      suggestedAction?: string;
      manualContinuationRequired?: boolean;
      sessionId?: string;
      urlsVisited: string[];
      candidates: ResolutionCandidate[];
      verificationRequired?: boolean;
      loginRequired?: boolean;
      stoppedAtUrl?: string | null;
    } & AdzunaHandoffEvidence;

const CTA_TEXT_PATTERN =
  /(apply now|apply|apply on company site|apply on employer site|view job|view job details|view original job|continue|continue to application|external apply|start application|go to job|see job)/i;
const CONTINUATION_TEXT_PATTERN =
  /(no thanks,?\s*take me to the job|take me to the job|continue to job|continue to application|continue|skip alert|skip|not now|no thanks|view job|go to job|apply for this job)/i;
const JOB_PATH_PATTERN =
  /(\/job\/|\/jobs\/|\/careers\/|\/career\/|\/position\/|\/positions\/|\/apply|requisition|jobid|job_id)/i;
const STATIC_ASSET_PATTERN =
  /(\.css$|\.js$|\.png$|\.jpe?g$|\.gif$|\.svg$|\.webp$|\.ico$|\/favicon\.ico$)/i;
const SCRIPT_REDIRECT_PATTERN =
  /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi;
const OPEN_REDIRECT_PATTERN =
  /window\.open\(\s*["']([^"']+)["']/gi;
const REDIRECT_PARAM_KEYS = ["redirect", "url", "target", "dest", "destination"] as const;
const LOGIN_TEXT_PATTERN =
  /(sign in|log in|login|create account|create profile|returning candidate|candidate home|login to apply|create an account to apply|continue with google|continue with microsoft|continue with linkedin)/i;
const TRACKING_HOST_PATTERNS = [
  "creativecdn.com",
  "px.ads.linkedin.com",
  "linkedin.com",
  "google-analytics.com",
  "googletagmanager.com",
  "facebook.com",
  "doubleclick.net",
  "segment.io",
];
const TRACKING_PATH_PATTERNS = [
  "/px/",
  "/pixel",
  "/collect",
  "/beacon",
  "/analytics",
  "/gtm",
  "/track",
];
const CTA_PRIORITY_PATTERNS = [
  /apply for this job/i,
  /apply now/i,
  /^apply$/i,
];
const ADZUNA_ACCESS_DENIED_TEXT_PATTERN =
  /(access denied|forbidden|blocked|request denied|unable to access)/i;
const ADZUNA_SUSPICIOUS_BEHAVIOR_TEXT_PATTERN =
  /(suspicious behaviou?r|login to continue|unusual behaviou?r|vpn|company internet gateway)/i;
const ADZUNA_LOGIN_URL_PATTERN = /(login|signin|sign-in|account|authenticate)/i;
const ADZUNA_RATE_LIMIT_TEXT_PATTERN = /(rate[-\s]?limited|too many requests)/i;
const ADZUNA_RATE_LIMIT_STATUS_CODES = new Set([429]);
const ADZUNA_DENIED_STATUS_CODES = new Set([401, 403]);
const ADZUNA_LOGIN_TO_CONTINUE_REQUIRED_CODE = "ADZUNA_LOGIN_TO_CONTINUE_REQUIRED";
const ADZUNA_HANDOFF_RATE_LIMITED_CODE = "ADZUNA_HANDOFF_RATE_LIMITED";
const ADZUNA_HANDOFF_ACCESS_DENIED_CODE = "ADZUNA_HANDOFF_ACCESS_DENIED";

function logAggregatorHandoff(
  step:
    | "start"
    | "page opened"
    | "cta scan started"
    | "cta candidate found"
    | "handoff click starting"
    | "same-tab navigation detected"
    | "popup detected"
    | "response status detected"
    | "rate limit stop prepared"
    | "login gate detected"
    | "manual continuation required"
    | "resolved employer url"
    | "unresolved",
  payload?: Record<string, unknown>,
) {
  console.info("[AGGREGATOR_SCRAPFLY_HANDOFF] " + step, payload ?? {});
}

function detectAdzunaHandoffRateLimited(args: {
  responseStatus?: number;
  finalUrl?: string | null;
  pageTitle?: string | null;
  bodyText?: string | null;
}) {
  const textSignals = [args.pageTitle, args.bodyText]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
  const hasRateLimitText = ADZUNA_RATE_LIMIT_TEXT_PATTERN.test(textSignals);
  const isHandoffUrl = isAdzunaLandAdHandoffUrl(args.finalUrl);
  const statusRateLimited = ADZUNA_RATE_LIMIT_STATUS_CODES.has(
    args.responseStatus ?? -1,
  );

  return isHandoffUrl && (statusRateLimited || hasRateLimitText);
}

function parseHostname(rawUrl: string | null | undefined) {
  try {
    return new URL(String(rawUrl ?? "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAdzunaLandAdHandoffUrl(rawUrl: string | null | undefined) {
  const normalizedUrl = normalizeCandidateUrl(rawUrl);
  if (!normalizedUrl || !isAdzunaUrl(normalizedUrl)) return false;
  try {
    const parsed = new URL(normalizedUrl);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.includes("/land/ad/");
  } catch {
    return false;
  }
}

function extractAdzunaJobId(rawUrl: string | null | undefined) {
  const normalizedUrl = normalizeCandidateUrl(rawUrl);
  if (!normalizedUrl) return null;
  try {
    const parsed = new URL(normalizedUrl);
    const pathname = parsed.pathname.toLowerCase();
    const landAdMatch = pathname.match(/\/land\/ad\/(\d+)/);
    if (landAdMatch?.[1]) return landAdMatch[1];
    const detailsMatch = pathname.match(/\/details\/(\d+)/);
    if (detailsMatch?.[1]) return detailsMatch[1];
  } catch {
    return null;
  }
  return null;
}

function normalizeSourceJobId(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return null;
  const numeric = cleaned.match(/(\d{6,})/);
  return numeric?.[1] ?? cleaned;
}

function getRedirectChain(response: Response | null | undefined) {
  if (!response) return [];

  const chain: string[] = [];
  let cursor = response.request();
  while (cursor) {
    chain.push(cursor.url());
    const previous = cursor.redirectedFrom();
    if (!previous) break;
    cursor = previous;
  }
  return [...chain].reverse();
}

function continuationScore(args: {
  text: string;
  href: string | null;
  visible: boolean;
  handoffUrl?: string;
}) {
  let score = 0;
  if (args.visible) score += 60;
  if (args.handoffUrl && args.href && args.href === args.handoffUrl) score += 50;
  if (/no thanks,?\s*take me to the job/i.test(args.text)) score += 40;
  if (/take me to the job/i.test(args.text)) score += 35;
  if (/continue/i.test(args.text)) score += 20;
  if (/apply for this job/i.test(args.text)) score += 15;
  return score;
}

function detectAdzunaHandoffAccessDenied(args: {
  responseStatus?: number;
  finalUrl?: string | null;
  pageTitle?: string | null;
  bodyText?: string | null;
}) {
  const statusDenied =
    args.responseStatus === 401 ||
    args.responseStatus === 403;
  const stillOnAdzunaHandoffUrl = isAdzunaLandAdHandoffUrl(args.finalUrl);
  const textSignals = [args.pageTitle, args.bodyText]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
  const hasDeniedText = ADZUNA_ACCESS_DENIED_TEXT_PATTERN.test(textSignals);

  return stillOnAdzunaHandoffUrl && (statusDenied || hasDeniedText);
}

function sanitizeCredentialEnv(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.replace(/^['"`]+|['"`]+$/g, "").trim();
}

function readAdzunaLoginCredentials() {
  const email = sanitizeCredentialEnv(process.env.ADZUNA_LOGIN_EMAIL);
  const password = sanitizeCredentialEnv(process.env.ADZUNA_LOGIN_PASSWORD);
  return {
    email,
    password,
    ready: Boolean(email && password),
  };
}

async function detectAdzunaLoginContinueGate(args: {
  page: Page;
  responseStatus?: number;
  finalUrl?: string | null;
  pageTitle?: string | null;
  bodyText?: string | null;
}) {
  const gateByAccessDenied = detectAdzunaHandoffAccessDenied({
    responseStatus: args.responseStatus,
    finalUrl: args.finalUrl,
    pageTitle: args.pageTitle,
    bodyText: args.bodyText,
  });
  const gateText = [args.pageTitle, args.bodyText]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
  const hasSuspiciousSignals = ADZUNA_SUSPICIOUS_BEHAVIOR_TEXT_PATTERN.test(gateText);
  const isLandAdUrl = isAdzunaLandAdHandoffUrl(args.finalUrl);
  const statusSignalsGate =
    ADZUNA_RATE_LIMIT_STATUS_CODES.has(args.responseStatus ?? -1) ||
    ADZUNA_DENIED_STATUS_CODES.has(args.responseStatus ?? -1);
  const extracted = await args.page
    .evaluate(() => {
      const toAbsolute = (raw: string | null | undefined) => {
        const normalized = String(raw ?? "").trim();
        if (!normalized) return null;
        try {
          return new URL(normalized, window.location.href).toString();
        } catch {
          return null;
        }
      };
      const allNodes = Array.from(
        document.querySelectorAll(
          'a,button,[role="button"],input[type="submit"],input[type="button"]',
        ),
      );
      const authCandidates = new Set<string>();
      const pageText = (
        document.body?.innerText ||
        document.documentElement?.innerText ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      const pageTitle = (document.title || "").trim();

      for (const node of allNodes) {
        const element = node as HTMLElement;
        const text =
          node instanceof HTMLInputElement
            ? node.value || ""
            : node.textContent ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              "";
        const href =
          node instanceof HTMLAnchorElement
            ? node.href
            : element.getAttribute("href");
        const normalizedText = text.replace(/\s+/g, " ").trim();
        if (/login to continue/i.test(normalizedText) && href) {
          const absoluteHref = toAbsolute(href);
          if (absoluteHref) authCandidates.add(absoluteHref);
        }
        if (href && /\/authenticate/i.test(String(href))) {
          const absoluteHref = toAbsolute(href);
          if (absoluteHref) authCandidates.add(absoluteHref);
        }
      }

      for (const anchor of Array.from(document.querySelectorAll('a[href*="/authenticate"]'))) {
        if (!(anchor instanceof HTMLAnchorElement)) continue;
        const absoluteHref = toAbsolute(anchor.href);
        if (absoluteHref) authCandidates.add(absoluteHref);
      }

      for (const form of Array.from(document.querySelectorAll('form[action*="/authenticate"]'))) {
        if (!(form instanceof HTMLFormElement)) continue;
        const absoluteAction = toAbsolute(form.action);
        if (absoluteAction) authCandidates.add(absoluteAction);
      }

      const scriptRegex =
        /(https?:\/\/www\.adzuna\.com\/authenticate[^"'\s]*)|(\/authenticate[^"'\s]*)/gi;
      for (const script of Array.from(document.querySelectorAll("script"))) {
        const content = script.textContent || "";
        scriptRegex.lastIndex = 0;
        let match = scriptRegex.exec(content);
        while (match) {
          const candidate = match[1] || match[2];
          const absoluteCandidate = toAbsolute(candidate);
          if (absoluteCandidate) authCandidates.add(absoluteCandidate);
          match = scriptRegex.exec(content);
        }
      }

      const loginToContinueAvailable = allNodes.some((node) => {
        const element = node as HTMLElement;
        const text =
          node instanceof HTMLInputElement
            ? node.value || ""
            : node.textContent ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              "";
        return /login to continue/i.test(text.replace(/\s+/g, " ").trim());
      }) ||
      /login to continue/i.test(pageText) ||
      /login to continue/i.test(pageTitle);
      const authenticateUrl =
        [...authCandidates].find((url) => /\/authenticate/i.test(url)) ?? null;

      return {
        loginToContinueAvailable:
          loginToContinueAvailable || Boolean(authenticateUrl),
        authenticateUrl,
        bodyTextPreview: pageText.slice(0, 1000),
        pageTitle,
      };
    })
    .catch(() => ({
      loginToContinueAvailable: false,
      authenticateUrl: null as string | null,
      bodyTextPreview: "",
      pageTitle: "",
    }));

  const detected = Boolean(
    isLandAdUrl &&
      (statusSignalsGate || gateByAccessDenied || hasSuspiciousSignals),
  );
  return {
    detected,
    responseStatus: args.responseStatus,
    pageType: "adzuna_login_continue_gate" as const,
    loginToContinueAvailable: extracted.loginToContinueAvailable,
    authenticateUrl: extracted.authenticateUrl,
    bodyTextPreview: extracted.bodyTextPreview,
    pageTitle: extracted.pageTitle,
    reason: detected
      ? gateByAccessDenied
        ? "adzuna_handoff_access_denied"
        : detectAdzunaHandoffRateLimited({
            responseStatus: args.responseStatus,
            finalUrl: args.finalUrl,
            pageTitle: args.pageTitle,
            bodyText: args.bodyText,
          })
          ? "adzuna_rate_limited"
          : "adzuna_login_continue_gate"
      : undefined,
  };
}

async function continueThroughAdzunaLoginGate(args: {
  page: Page;
  context: BrowserContext;
  authenticateUrl?: string | null;
}) {
  const beforeUrl = args.page.url();
  const popupPromise = args.context
    .waitForEvent("page", { timeout: 12_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForURL((url) => url.toString() !== beforeUrl, { timeout: 10_000 })
    .then(() => "same_tab_navigation")
    .catch(() => null);
  let method: "authenticate_url_goto" | "element_click" = "element_click";
  let clicked = false;
  let responseStatus: number | undefined;

  if (args.authenticateUrl) {
    method = "authenticate_url_goto";
    const gotoResponse = await args.page
      .goto(args.authenticateUrl, { waitUntil: "domcontentloaded" })
      .catch(() => null);
    responseStatus = gotoResponse?.status() ?? undefined;
    clicked = true;
  } else {
    clicked = await args.page
      .evaluate(() => {
        const selectors = [
          "button",
          "a",
          '[role="button"]',
          'input[type="submit"]',
          'input[type="button"]',
        ];
        const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
        const target = nodes.find((node) => {
          const element = node as HTMLElement;
          const text =
            node instanceof HTMLInputElement
              ? node.value || ""
              : node.textContent ||
                element.getAttribute("aria-label") ||
                element.getAttribute("title") ||
                "";
          return /login to continue/i.test(text.replace(/\s+/g, " ").trim());
        });
        if (!target) return false;
        (target as HTMLElement).click();
        return true;
      })
      .catch(() => false);
  }

  await Promise.race([
    navigationPromise,
    args.page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(
      () => null,
    ),
    args.page.waitForTimeout(2_500).then(() => "timeout"),
  ]).catch(() => undefined);
  await args.page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(
    () => undefined,
  );
  await args.page.waitForTimeout(1_200).catch(() => undefined);

  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(
      () => undefined,
    );
  }
  const activePage = popup ?? args.page;
  const afterUrl = activePage.url();
  const pageTitle = await activePage.title().catch(() => "");
  const loginPageDetected = ADZUNA_LOGIN_URL_PATTERN.test(afterUrl);

  return {
    method,
    clicked,
    beforeUrl,
    afterUrl,
    responseStatus,
    pageTitle,
    popupUrl: popup?.url() ?? null,
    activePage,
    loginPageDetected,
  };
}

async function detectAdzunaLoginPage(page: Page) {
  return page
    .evaluate(() => {
      const hasEmailInput = Boolean(
        document.querySelector(
          'input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="username"], input[name*="username" i], input[id*="username" i]',
        ),
      );
      const hasPasswordInput = Boolean(
        document.querySelector(
          'input[type="password"], input[name*="password" i], input[id*="password" i], input[autocomplete="current-password"], input[autocomplete="password"]',
        ),
      );
      const hasLoginButton = Array.from(
        document.querySelectorAll("button,a,[role='button'],input[type='submit'],input[type='button']"),
      ).some((node) => {
        const element = node as HTMLElement;
        const text =
          node instanceof HTMLInputElement
            ? node.value || ""
            : node.textContent ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              "";
        return /(login|log in|sign in|continue)/i.test(text);
      });

      return {
        hasEmailInput,
        hasPasswordInput,
        hasLoginButton,
      };
    })
    .catch(() => ({
      hasEmailInput: false,
      hasPasswordInput: false,
      hasLoginButton: false,
    }));
}

async function attemptAdzunaCredentialLogin(args: {
  page: Page;
  email: string;
  password: string;
}) {
  const emailSelectors = [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[autocomplete="username"]',
    'input[name*="username" i]',
    'input[id*="username" i]',
  ];
  const passwordSelectors = [
    'input[type="password"]',
    'input[name*="password" i]',
    'input[id*="password" i]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="password"]',
  ];
  const submitSelectors = [
    'button:has-text("Login")',
    'button:has-text("Log in")',
    'button:has-text("Sign in")',
    'button:has-text("Continue")',
    'a:has-text("Login")',
    'a:has-text("Log in")',
    'a:has-text("Sign in")',
    '[role="button"]:has-text("Login")',
    '[role="button"]:has-text("Log in")',
    '[role="button"]:has-text("Sign in")',
    'input[type="submit"]',
    'input[type="button"]',
  ];

  const findFirst = async (selectors: string[]) => {
    for (const selector of selectors) {
      const locator = args.page.locator(selector).first();
      const count = await locator.count().catch(() => 0);
      if (count > 0) {
        return { locator, selector };
      }
    }
    return null;
  };

  const emailTarget = await findFirst(emailSelectors);
  const passwordTarget = await findFirst(passwordSelectors);
  if (!emailTarget || !passwordTarget) {
    return {
      attempted: false,
      succeeded: false,
      failureReason: "adzuna_login_form_fields_missing",
    };
  }

  await emailTarget.locator.fill(args.email).catch(() => undefined);
  await passwordTarget.locator.fill(args.password).catch(() => undefined);

  const beforeUrl = args.page.url();
  const submitTarget = await findFirst(submitSelectors);
  let submitted = false;
  if (submitTarget) {
    submitted = await submitTarget.locator
      .click({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!submitted) {
    submitted = await passwordTarget.locator
      .press("Enter")
      .then(() => true)
      .catch(() => false);
  }
  if (!submitted) {
    return {
      attempted: true,
      succeeded: false,
      failureReason: "adzuna_login_submit_failed",
    };
  }

  await Promise.race([
    args.page.waitForURL((url) => url.toString() !== beforeUrl, { timeout: 12_000 }).catch(
      () => null,
    ),
    args.page.waitForLoadState("domcontentloaded", { timeout: 12_000 }).catch(
      () => null,
    ),
    args.page.waitForTimeout(3_000).then(() => "timeout"),
  ]).catch(() => undefined);
  await args.page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(
    () => undefined,
  );
  await args.page.waitForTimeout(1_200).catch(() => undefined);

  const postLoginSignals = await detectAdzunaLoginPage(args.page);
  const currentUrl = args.page.url();
  const stillOnLogin =
    ADZUNA_LOGIN_URL_PATTERN.test(currentUrl) &&
    postLoginSignals.hasPasswordInput;

  return {
    attempted: true,
    succeeded: !stillOnLogin,
    failureReason: stillOnLogin ? "adzuna_login_still_on_login_page" : undefined,
  };
}

function detectTrackingUrl(rawUrl: string | null | undefined) {
  const normalizedUrl = normalizeCandidateUrl(rawUrl);
  if (!normalizedUrl) {
    return { isTracking: false, reason: null as string | null };
  }

  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (TRACKING_HOST_PATTERNS.some((pattern) => hostname.includes(pattern))) {
      return { isTracking: true, reason: "tracking_host" };
    }
    if (TRACKING_PATH_PATTERNS.some((pattern) => pathname.includes(pattern))) {
      return { isTracking: true, reason: "tracking_path" };
    }
    if (hostname.includes("linkedin.com") && pathname.startsWith("/px/")) {
      return { isTracking: true, reason: "linkedin_pixel" };
    }
  } catch {
    return { isTracking: false, reason: null as string | null };
  }

  return { isTracking: false, reason: null as string | null };
}

function isLoginLikeUrl(rawUrl: string) {
  const normalized = rawUrl.toLowerCase();
  return (
    normalized.includes("/login") ||
    normalized.includes("/signin") ||
    normalized.includes("/sign-in") ||
    normalized.includes("/register") ||
    normalized.includes("create-account")
  );
}

function normalizeCandidateUrl(rawUrl: string | null | undefined) {
  const normalized = normalizeJobUrl(String(rawUrl ?? ""));
  if (!normalized) return "";
  return normalized;
}

function looksLikeGenericHomepage(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return pathname === "/" && !parsed.search;
  } catch {
    return false;
  }
}

function evaluateCandidate(args: {
  rawUrl: string;
  source: string;
  title?: string | null;
  company?: string | null;
}): CandidateEvaluation {
  const normalizedUrl = normalizeCandidateUrl(args.rawUrl);
  if (!normalizedUrl) {
    return {
      candidate: null,
      rejectionReason: "invalid_or_empty_url",
    };
  }

  const hostname = parseHostname(normalizedUrl);
  if (!hostname) {
    return {
      candidate: null,
      rejectionReason: "missing_hostname",
    };
  }
  if (isAdzunaUrl(normalizedUrl)) {
    return {
      candidate: null,
      rejectionReason: "adzuna_domain",
    };
  }
  if (STATIC_ASSET_PATTERN.test(normalizedUrl)) {
    return {
      candidate: null,
      rejectionReason: "static_asset",
    };
  }
  if (hostname.includes("google.") || hostname.includes("gstatic.") || hostname.includes("doubleclick.")) {
    return {
      candidate: null,
      rejectionReason: "search_or_tracking_host",
    };
  }
  if (isLoginLikeUrl(normalizedUrl)) {
    return {
      candidate: null,
      rejectionReason: "login_like_url",
    };
  }

  const validation = validateAutomationStartUrl(normalizedUrl, {
    rejectAggregator: true,
    rejectSearchEngine: true,
  });
  if (!validation.isValid) {
    return {
      candidate: null,
      rejectionReason: `invalid_start_url:${validation.reason ?? "unknown"}`,
    };
  }

  const sourceWeight =
    args.source === "popup"
      ? 44
      : args.source === "final_navigation"
        ? 40
        : args.source === "network_redirect"
          ? 38
          : args.source === "apply_cta_href"
            ? 34
            : args.source === "meta_refresh" || args.source === "script_redirect"
              ? 30
              : 22;
  const atsWeight = isLikelyAtsUrl(normalizedUrl) ? 35 : 0;
  const careersWeight = isLikelyCompanyCareersUrl(normalizedUrl) ? 22 : 0;
  const pathWeight = JOB_PATH_PATTERN.test(normalizedUrl) ? 18 : 0;
  const titleMatch =
    args.title && args.title.length > 0
      ? normalizedUrl.toLowerCase().includes(args.title.toLowerCase().slice(0, 24))
        ? 9
        : 0
      : 0;
  const companyMatch =
    args.company && args.company.length > 0
      ? normalizedUrl.toLowerCase().includes(args.company.toLowerCase().split(/\s+/)[0] ?? "")
        ? 8
        : 0
      : 0;
  const homepagePenalty = looksLikeGenericHomepage(normalizedUrl) ? -35 : 0;
  const score = sourceWeight + atsWeight + careersWeight + pathWeight + titleMatch + companyMatch + homepagePenalty;

  if (score < 30) {
    return {
      candidate: null,
      rejectionReason: `score_below_threshold:${score}`,
    };
  }

  return {
    candidate: {
      url: normalizedUrl,
      source: args.source,
      score,
      reason: [
        `source=${args.source}`,
        atsWeight > 0 ? "ats" : null,
        careersWeight > 0 ? "careers" : null,
        pathWeight > 0 ? "job_path" : null,
        titleMatch > 0 ? "title_match" : null,
        companyMatch > 0 ? "company_match" : null,
      ]
        .filter(Boolean)
        .join(";"),
    } satisfies ResolutionCandidate,
  };
}

function readMetaRefreshUrl(content: string | null | undefined) {
  const raw = String(content ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/url\s*=\s*([^;]+)/i);
  return match?.[1]?.trim() ?? null;
}

function extractRedirectCandidatesFromScript(scriptText: string) {
  const links: string[] = [];
  for (const regex of [SCRIPT_REDIRECT_PATTERN, OPEN_REDIRECT_PATTERN]) {
    regex.lastIndex = 0;
    let match = regex.exec(scriptText);
    while (match) {
      if (match[1]) links.push(match[1]);
      match = regex.exec(scriptText);
    }
  }
  return links;
}

async function capturePageSnapshot(page: Page) {
  return page
    .evaluate((patternSource) => {
      const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
      const scripts = Array.from(document.querySelectorAll("script"))
        .map((script) => script.textContent || "")
        .filter(Boolean);
      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => {
          if (!(anchor instanceof HTMLAnchorElement)) return null;
          return {
            href: anchor.href,
            text: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
            ariaLabel: (anchor.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(),
            title: (anchor.getAttribute("title") || "").replace(/\s+/g, " ").trim(),
          };
        })
        .filter(Boolean) as Array<{
        href: string;
        text: string;
        ariaLabel: string;
        title: string;
      }>;
      const ctaRegex = new RegExp(patternSource, "i");
      const ctaLinks = links.filter((link) =>
        ctaRegex.test([link.text, link.ariaLabel, link.title].join(" ")),
      );

      return {
        title: document.title || "",
        bodyText: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 4000),
        links,
        ctaLinks,
        metaRefreshContent: metaRefresh?.getAttribute("content") || "",
        scripts,
      };
    }, CTA_TEXT_PATTERN.source)
    .catch(() => ({
      title: "",
      bodyText: "",
      links: [] as Array<{
        href: string;
        text: string;
        ariaLabel: string;
        title: string;
      }>,
      ctaLinks: [] as Array<{
        href: string;
        text: string;
        ariaLabel: string;
        title: string;
      }>,
      metaRefreshContent: "",
      scripts: [] as string[],
    }));
}

async function scanCtaCandidates(page: Page): Promise<CtaScanCandidate[]> {
  return page
    .evaluate(() => {
      const selectors = [
        "a[href]",
        "button",
        '[role="button"]',
        'input[type="submit"]',
        'input[type="button"]',
      ];
      const nodes = Array.from(
        document.querySelectorAll(selectors.join(",")),
      ).slice(0, 80);

      return nodes.map((node, index) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0;

        const text =
          node instanceof HTMLInputElement
            ? node.value || ""
            : node.textContent || "";
        const href =
          node instanceof HTMLAnchorElement
            ? node.href
            : element.getAttribute("href");

        return {
          index,
          text: text.replace(/\s+/g, " ").trim(),
          href: href ? String(href) : null,
          tagName: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          ariaLabel: element.getAttribute("aria-label"),
          title: element.getAttribute("title"),
          visible,
          source: "dom_scan",
        } satisfies CtaScanCandidate;
      });
    })
    .catch(() => []);
}

async function clickHandoffCandidate(args: {
  page: Page;
  handoffUrl?: string;
  handoffText?: string;
}) {
  if (!args.handoffUrl && !args.handoffText) {
    return false;
  }

  return args.page
    .evaluate(({ handoffUrl, handoffText }) => {
      const selectors = [
        "a[href]",
        "button",
        '[role="button"]',
        'input[type="submit"]',
        'input[type="button"]',
      ];
      const normalizedText = String(handoffText ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const nodes = Array.from(document.querySelectorAll(selectors.join(",")));

      const pick = nodes.find((node) => {
        const element = node as HTMLElement;
        const text =
          node instanceof HTMLInputElement
            ? node.value || ""
            : node.textContent ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              "";
        const normalizedNodeText = text.replace(/\s+/g, " ").trim().toLowerCase();
        const href =
          node instanceof HTMLAnchorElement
            ? node.href
            : element.getAttribute("href") || "";

        if (handoffUrl && href && href === handoffUrl) return true;
        if (normalizedText && normalizedNodeText && normalizedNodeText.includes(normalizedText)) {
          return true;
        }
        return false;
      });

      if (!pick) return false;
      (pick as HTMLElement).click();
      return true;
    }, {
      handoffUrl: args.handoffUrl,
      handoffText: args.handoffText,
    })
    .catch(() => false);
}

async function detectVerification(page: Page) {
  const snapshot = await capturePageSnapshot(page);
  const detection = detectVerificationGate({
    url: page.url(),
    title: snapshot.title,
    pageText: snapshot.bodyText,
  });

  return {
    detection,
    snapshot,
  };
}

function absolutizeUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function pickBestCandidate(candidates: ResolutionCandidate[]) {
  const sorted = [...candidates].sort((left, right) => right.score - left.score);
  return sorted[0] ?? null;
}

function detectLoginRequired(args: {
  url: string;
  title?: string;
  pageText?: string;
}) {
  const signalText = [args.url, args.title, args.pageText]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLowerCase();
  const looksLikeLoginPath =
    signalText.includes("/login") ||
    signalText.includes("/signin") ||
    signalText.includes("/sign-in") ||
    signalText.includes("authenticate");
  return looksLikeLoginPath || LOGIN_TEXT_PATTERN.test(signalText);
}

export async function resolveAdzunaHandoffWithScrapfly(args: {
  adzunaUrl: string;
  applicationId: string;
  applySessionId?: string | null;
  sourceJobId?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
}): Promise<AdzunaScrapflyResolutionResult> {
  const adzunaDetailUrl = normalizeCandidateUrl(args.adzunaUrl) || args.adzunaUrl;
  const sourceJobId = normalizeSourceJobId(args.sourceJobId);
  const urlsVisited = new Set<string>();
  const candidateByUrl = new Map<string, ResolutionCandidate>();
  let rejectedCandidateLogCount = 0;
  const rejectedFinalCandidateReasons = new Set<string>();
  let rejectedTrackingCandidateCount = 0;
  let sessionId: string | undefined;
  let browser: Browser | null = null;
  let shouldKeepBrowserOpen = false;
  let handoffCandidate:
    | {
        href?: string;
        text?: string;
        source: string;
      }
    | null = null;
  let handoffBeforeUrl: string | undefined;
  let handoffAfterUrl: string | undefined;
  let handoffFinalUrl: string | undefined;
  let handoffLeftAdzunaDomain: boolean | undefined;
  let handoffClickMethod:
    | "element_click"
    | "continuation_click"
    | "direct_goto"
    | undefined;
  let continuationAttempted = false;
  let continuationText: string | undefined;
  let continuationHref: string | undefined;
  let directGotoFallbackAttempted = false;
  let directGotoFallbackReason: string | undefined;
  let directGotoResponseUrl: string | undefined;
  let directGotoStatus: number | undefined;
  let unresolvedReason: string | undefined;
  let currentErrorCode: string | undefined;
  let handoffPopupUrl: string | null = null;
  let handoffResponseStatus: number | undefined;
  let handoffPageTitle: string | undefined;
  let adzunaHandoffAccessDenied = false;
  let adzunaLoginContinueGateDetected = false;
  let adzunaSuspiciousBehaviorGateDetected = false;
  let adzunaLoginToContinueAvailable = false;
  let adzunaAuthenticateUrl: string | undefined;
  let adzunaLoginToContinueClicked = false;
  let adzunaLoginPageDetected = false;
  let adzunaCredentialAvailable = false;
  let adzunaLoginAttempted = false;
  let adzunaLoginSucceeded = false;
  let adzunaLoginFailedReason: string | undefined;
  let adzunaPostLoginHandoffRetried = false;
  let adzunaPostLoginResolvedDirectUrl: string | undefined;
  let manualContinuationRequired = false;
  let suggestedAction: string | undefined;
  const seenHandoffUrls = new Set<string>();

  const addVisitedUrl = (rawUrl: string | null | undefined) => {
    const normalized = normalizeCandidateUrl(rawUrl);
    if (!normalized) return;
    urlsVisited.add(normalized);
  };

  const buildEvidence = (): AdzunaHandoffEvidence => ({
    provider: "scrapfly",
    source: "adzuna",
    scrapflyAttempted: true,
    scrapflySessionId: sessionId,
    aggregatorUrl: adzunaDetailUrl,
    finalUrl: handoffFinalUrl,
    responseStatus: handoffResponseStatus ?? directGotoStatus,
    resolvedDirectUrl: adzunaPostLoginResolvedDirectUrl,
    handoffClickAttempted: Boolean(handoffCandidate),
    handoffClickMethod,
    handoffClickUrl: handoffCandidate?.href,
    handoffClickText: handoffCandidate?.text,
    handoffBeforeUrl,
    handoffAfterUrl,
    continuationAttempted,
    continuationText,
    continuationHref,
    directGotoFallbackAttempted,
    directGotoFallbackReason,
    directGotoResponseUrl,
    directGotoStatus,
    handoffPopupUrl,
    handoffFinalUrl,
    handoffLeftAdzunaDomain,
    handoffResponseStatus,
    handoffPageTitle,
    errorCode: currentErrorCode,
    adzunaHandoffAccessDenied,
    adzunaLoginContinueGateDetected,
    adzunaLoginContinueDetected: adzunaLoginContinueGateDetected,
    adzunaSuspiciousBehaviorGateDetected,
    adzunaLoginToContinueAvailable,
    adzunaAuthenticateUrl,
    adzunaLoginToContinueClicked,
    adzunaLoginPageDetected,
    adzunaCredentialAvailable,
    adzunaLoginAttempted,
    adzunaLoginSucceeded,
    adzunaLoginFailedReason,
    adzunaPostLoginHandoffRetried,
    adzunaPostLoginResolvedDirectUrl,
    manualContinuationRequired,
    suggestedAction,
    downstreamCandidateCount: candidateByUrl.size,
    rejectedTrackingCandidateCount,
    rejectedFinalCandidateReasons: [...rejectedFinalCandidateReasons],
    unresolvedReason,
  });

  const addCandidate = (rawUrl: string | null | undefined, source: ResolutionCandidate["source"]) => {
    if (!rawUrl) return;
    const normalizedUrl = normalizeCandidateUrl(rawUrl);
    if (!normalizedUrl) return;

    if (isAdzunaLandAdHandoffUrl(normalizedUrl)) {
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff cta accepted", {
        text: handoffCandidate?.text ?? null,
        href: normalizedUrl,
        reason: "adzuna_land_ad_handoff",
      });
      return;
    }

    if (isAdzunaUrl(normalizedUrl)) {
      rejectedFinalCandidateReasons.add("adzuna_domain");
      return;
    }

    const tracking = detectTrackingUrl(normalizedUrl);
    if (tracking.isTracking) {
      rejectedTrackingCandidateCount += 1;
      rejectedFinalCandidateReasons.add(String(tracking.reason ?? "tracking_url"));
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] tracking url ignored", {
        url: normalizedUrl,
        reason: tracking.reason,
      });
      return;
    }

    const evaluated = evaluateCandidate({
      rawUrl: normalizedUrl,
      source,
      title: args.title,
      company: args.company,
    });
    if (!evaluated.candidate) {
      rejectedFinalCandidateReasons.add(evaluated.rejectionReason);
      if (rejectedCandidateLogCount < 80) {
        rejectedCandidateLogCount += 1;
        console.info("[ADZUNA_SCRAPFLY_RESOLVER] candidate rejected", {
          url: normalizedUrl,
          source,
          reason: evaluated.rejectionReason,
        });
      }
      return;
    }
    const scored = evaluated.candidate;

    const existing = candidateByUrl.get(scored.url);
      if (!existing || scored.score > existing.score) {
        candidateByUrl.set(scored.url, scored);
        console.info("[ADZUNA_SCRAPFLY_RESOLVER] candidate collected", {
          url: scored.url,
          source: scored.source,
          score: scored.score,
          reason: scored.reason,
        });
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] downstream candidate collected", {
          url: scored.url,
          source: scored.source,
          score: scored.score,
          reason: scored.reason,
        });
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] final candidate url", {
          url: scored.url,
          source: scored.source,
          score: scored.score,
        });
      }
  };

  try {
    console.info("[ADZUNA_SCRAPFLY_RESOLVER] input adzunaUrl", {
      adzunaUrl: adzunaDetailUrl,
      applicationId: args.applicationId,
    });
    console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] input adzunaUrl", {
      adzunaUrl: adzunaDetailUrl,
      applicationId: args.applicationId,
    });
    const connected = await connectScrapflyBrowser({
      applicationId: args.applicationId,
      applySessionId: args.applySessionId,
      purpose: "adzuna_handoff",
      keepAlive: true,
    });
    browser = connected.browser;
    sessionId = connected.sessionId;
    console.info("[ADZUNA_SCRAPFLY_RESOLVER] scrapflySessionId", {
      sessionId,
      applicationId: args.applicationId,
    });
    console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] scrapflySessionId", {
      sessionId,
      applicationId: args.applicationId,
    });
    console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] session context attached", {
      scrapflySessionId: sessionId ?? null,
      applicationId: args.applicationId,
    });

    console.info("[ADZUNA_SCRAPFLY_RESOLVER] start", {
      applicationId: args.applicationId,
      adzunaUrl: adzunaDetailUrl,
      sessionId,
    });
    console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] start", {
      applicationId: args.applicationId,
      adzunaUrl: adzunaDetailUrl,
      sessionId,
    });
    logAggregatorHandoff("start", {
      applicationId: args.applicationId,
      source: "adzuna",
      provider: "scrapfly",
      adzunaUrl: adzunaDetailUrl,
      sessionId,
    });

    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    let lastMainFrameUrl = "";

    page.on("framenavigated", (frame: Frame) => {
      if (frame !== page.mainFrame()) return;
      const nextUrl = frame.url();
      if (lastMainFrameUrl && lastMainFrameUrl !== nextUrl) {
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] same-tab navigation detected", {
          from: lastMainFrameUrl,
          to: nextUrl,
        });
        logAggregatorHandoff("same-tab navigation detected", {
          from: lastMainFrameUrl,
          to: nextUrl,
          sessionId,
        });
      }
      lastMainFrameUrl = nextUrl;
      addVisitedUrl(nextUrl);
      addCandidate(nextUrl, "final_navigation");
    });

    page.on("response", (response: Response) => {
      const responseUrl = response.url();
      addVisitedUrl(responseUrl);
      if (isAdzunaLandAdHandoffUrl(responseUrl)) {
        handoffResponseStatus = response.status();
        logAggregatorHandoff("response status detected", {
          status: response.status(),
          url: responseUrl,
          sessionId,
        });
      }
      if (response.status() >= 300 && response.status() < 400) {
        addCandidate(responseUrl, "network_redirect");
        if (!response.headers()["location"]) {
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] network redirect detected", {
            from: responseUrl,
            to: null,
            status: response.status(),
          });
        }
      }
      const locationHeader = response.headers()["location"];
      if (locationHeader) {
        const redirectTarget = absolutizeUrl(locationHeader, responseUrl);
        addCandidate(redirectTarget, "network_redirect");
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] network redirect detected", {
          from: responseUrl,
          to: redirectTarget,
          status: response.status(),
        });
      }
    });

    await page.goto(adzunaDetailUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_200).catch(() => undefined);
    addVisitedUrl(page.url());
    addCandidate(page.url(), "final_navigation");
    console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] page opened", {
      applicationId: args.applicationId,
      adzunaDetailUrl,
      currentUrl: page.url(),
      scrapflySessionId: sessionId ?? null,
    });
    logAggregatorHandoff("page opened", {
      adzunaDetailUrl,
      currentUrl: page.url(),
      sessionId,
    });

    const initialVerification = await detectVerification(page);
    if (initialVerification.detection.detected) {
      shouldKeepBrowserOpen = true;
      console.warn("[ADZUNA_SCRAPFLY_RESOLVER] verification required", {
        stoppedAtUrl: page.url(),
        sessionId,
      });
      return {
        ok: false,
        error: initialVerification.detection.reason,
        sessionId,
        verificationRequired: true,
        stoppedAtUrl: page.url(),
        urlsVisited: [...urlsVisited],
        candidates: [...candidateByUrl.values()],
        ...buildEvidence(),
      };
    }

    const snapshot = initialVerification.snapshot;
    const currentUrl = page.url();
    console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] cta scan started", {
      currentUrl,
    });
    logAggregatorHandoff("cta scan started", {
      currentUrl,
      sessionId,
    });
    const scannedCtas = await scanCtaCandidates(page);
    const prioritizedHandoffCandidates: Array<{
      href: string;
      text: string;
      source: string;
      visible: boolean;
      score: number;
      sameJobId: boolean;
    }> = [];
    for (const candidate of scannedCtas) {
      const normalizedHref = candidate.href
        ? absolutizeUrl(candidate.href, page.url())
        : null;
      const candidateText = [candidate.text, candidate.ariaLabel, candidate.title]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] cta candidate found", {
        index: candidate.index,
        text: candidate.text,
        href: normalizedHref,
        tagName: candidate.tagName,
        role: candidate.role,
        ariaLabel: candidate.ariaLabel,
        visible: candidate.visible,
        source: candidate.source,
      });
      logAggregatorHandoff("cta candidate found", {
        index: candidate.index,
        text: candidate.text,
        href: normalizedHref,
        visible: candidate.visible,
      });

      if (!CTA_TEXT_PATTERN.test(candidateText)) {
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] cta candidate rejected", {
          text: candidateText,
          href: normalizedHref,
          reason: "cta_text_not_matched",
        });
        continue;
      }

      if (normalizedHref && isAdzunaLandAdHandoffUrl(normalizedHref)) {
        const handoffJobId = extractAdzunaJobId(normalizedHref);
        if (sourceJobId && !handoffJobId) {
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff candidate rejected", {
            href: normalizedHref,
            reason: "missing_adzuna_job_id",
          });
          continue;
        }
        const sameJobId =
          sourceJobId && handoffJobId
            ? handoffJobId === sourceJobId
            : true;
        if (sourceJobId && handoffJobId && !sameJobId) {
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff candidate rejected", {
            href: normalizedHref,
            reason: "different_adzuna_job_id",
          });
          continue;
        }

        if (seenHandoffUrls.has(normalizedHref)) {
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff candidate rejected", {
            href: normalizedHref,
            reason: "duplicate_handoff_url",
          });
          continue;
        }
        seenHandoffUrls.add(normalizedHref);

        let priorityScore = 0;
        if (sameJobId) priorityScore += 80;
        if (candidate.visible) priorityScore += 40;
        if (candidateText && CTA_PRIORITY_PATTERNS.some((pattern) => pattern.test(candidateText))) {
          priorityScore += 25;
        }
        if (/apply/i.test(candidateText)) priorityScore += 15;

        prioritizedHandoffCandidates.push({
          href: normalizedHref,
          text: candidateText,
          source: "cta_scan_adzuna_land_ad",
          visible: candidate.visible,
          score: priorityScore,
          sameJobId,
        });

        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff candidate prioritized", {
          sourceJobId,
          href: normalizedHref,
          sameJobId,
          visible: candidate.visible,
          text: candidateText,
        });
        continue;
      }

      if (!candidate.visible) {
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] cta candidate rejected", {
          text: candidateText,
          href: normalizedHref,
          reason: "not_visible",
        });
        continue;
      }

      if (normalizedHref && isAdzunaUrl(normalizedHref)) {
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] cta candidate rejected", {
          text: candidateText,
          href: normalizedHref,
          reason: "adzuna_non_handoff_url",
        });
        continue;
      }

      handoffCandidate = handoffCandidate ?? {
        href: normalizedHref ?? undefined,
        text: candidateText || candidate.text,
        source: "cta_scan",
      };

      if (normalizedHref) {
        addCandidate(normalizedHref, "apply_cta_href");
      }
    }

    if (prioritizedHandoffCandidates.length > 0) {
      prioritizedHandoffCandidates.sort((left, right) => right.score - left.score);
      const chosen = prioritizedHandoffCandidates[0];
      handoffCandidate = {
        href: chosen.href,
        text: chosen.text,
        source: chosen.source,
      };
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff cta accepted", {
        text: chosen.text,
        href: chosen.href,
        reason: "adzuna_land_ad_handoff",
      });
    }

    if (!handoffCandidate) {
      const adzunaSnapshotCandidate = snapshot.ctaLinks.find((link) => {
        const label = [link.text, link.ariaLabel, link.title].join(" ").trim();
        return CTA_TEXT_PATTERN.test(label);
      });
      if (adzunaSnapshotCandidate?.href) {
        const normalizedHref = absolutizeUrl(adzunaSnapshotCandidate.href, page.url());
        const handoffJobId = extractAdzunaJobId(normalizedHref);
        if (sourceJobId && !handoffJobId) {
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff candidate rejected", {
            href: normalizedHref,
            reason: "missing_adzuna_job_id",
          });
        } else {
        const sameJobId =
          sourceJobId && handoffJobId
            ? handoffJobId === sourceJobId
            : true;
        if (sourceJobId && handoffJobId && !sameJobId) {
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff candidate rejected", {
            href: normalizedHref,
            reason: "different_adzuna_job_id",
          });
        } else {
          handoffCandidate = {
            href: normalizedHref,
            text: [adzunaSnapshotCandidate.text, adzunaSnapshotCandidate.ariaLabel, adzunaSnapshotCandidate.title]
              .filter(Boolean)
              .join(" ")
              .trim(),
            source: "snapshot_fallback",
          };
          if (isAdzunaLandAdHandoffUrl(normalizedHref)) {
            console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff candidate prioritized", {
              sourceJobId,
              href: normalizedHref,
              sameJobId,
              visible: false,
              text: handoffCandidate.text,
            });
            console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff cta accepted", {
              text: handoffCandidate.text,
              href: normalizedHref,
              reason: "adzuna_land_ad_handoff",
            });
          }
        }
        }
      }
    }

    for (const cta of snapshot.ctaLinks) {
      const normalizedHref = absolutizeUrl(cta.href, currentUrl);
      if (!isAdzunaUrl(normalizedHref)) {
        addCandidate(normalizedHref, "apply_cta_href");
      }
    }

    const metaRefreshUrl = readMetaRefreshUrl(snapshot.metaRefreshContent);
    if (metaRefreshUrl) {
      addCandidate(absolutizeUrl(metaRefreshUrl, currentUrl), "meta_refresh");
    }

    for (const scriptText of snapshot.scripts.slice(0, 40)) {
      for (const extracted of extractRedirectCandidatesFromScript(scriptText)) {
        addCandidate(absolutizeUrl(extracted, currentUrl), "script_redirect");
      }
    }

    for (const key of REDIRECT_PARAM_KEYS) {
      try {
        const parsed = new URL(currentUrl);
        const redirectParam = parsed.searchParams.get(key);
        if (redirectParam) {
          addCandidate(absolutizeUrl(redirectParam, currentUrl), "script_redirect");
        }
      } catch {
        // ignore malformed URL
      }
    }

    for (const link of snapshot.links) {
      addCandidate(link.href, "external_link");
    }

    handoffBeforeUrl = page.url();
    handoffAfterUrl = handoffBeforeUrl;
    handoffFinalUrl = handoffBeforeUrl;
    handoffLeftAdzunaDomain = !isAdzunaUrl(handoffBeforeUrl);

    if (handoffCandidate) {
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff click starting", {
        text: handoffCandidate.text ?? null,
        handoffClickUrl: handoffCandidate.href ?? null,
        beforeUrl: handoffBeforeUrl,
      });
      logAggregatorHandoff("handoff click starting", {
        text: handoffCandidate.text ?? null,
        handoffClickUrl: handoffCandidate.href ?? null,
        beforeUrl: handoffBeforeUrl,
      });
      const handoffPopupPromise = context
        .waitForEvent("page", { timeout: 12_000 })
        .catch(() => null);
      const clickBeforeUrl = page.url();
      const sameTabNavigationPromise = page
        .waitForURL((url) => url.toString() !== clickBeforeUrl, { timeout: 8_000 })
        .then(() => "same_tab_navigation")
        .catch(() => null);
      const clicked = await clickHandoffCandidate({
        page,
        handoffUrl: handoffCandidate.href,
        handoffText: handoffCandidate.text,
      });
      handoffClickMethod = clicked ? "element_click" : undefined;
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff click attempted", {
        method: handoffClickMethod ?? "element_click",
        handoffClickUrl: handoffCandidate.href ?? null,
      });

      await Promise.race([
        sameTabNavigationPromise,
        page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(
          () => null,
        ),
        page.waitForTimeout(2_500).then(() => "timeout"),
      ]).catch(() => undefined);
      await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(
        () => undefined,
      );
      await page.waitForTimeout(2_000).catch(() => undefined);
      handoffAfterUrl = page.url();

      if (handoffBeforeUrl !== handoffAfterUrl) {
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] same-tab navigation detected", {
          from: handoffBeforeUrl,
          to: handoffAfterUrl,
        });
        logAggregatorHandoff("same-tab navigation detected", {
          from: handoffBeforeUrl,
          to: handoffAfterUrl,
          sessionId,
        });
      }

      const popup = await handoffPopupPromise;
      if (popup) {
        await popup.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(
          () => undefined,
        );
        handoffPopupUrl = popup.url();
        addVisitedUrl(handoffPopupUrl);
        addCandidate(handoffPopupUrl, "popup");
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] popup detected", {
          popupUrl: handoffPopupUrl,
        });
        logAggregatorHandoff("popup detected", {
          popupUrl: handoffPopupUrl,
          sessionId,
        });
      }

      addVisitedUrl(handoffAfterUrl);
      addCandidate(handoffAfterUrl, "final_navigation");
      handoffFinalUrl = handoffPopupUrl || handoffAfterUrl;
      handoffLeftAdzunaDomain = Boolean(
        handoffFinalUrl && !isAdzunaUrl(handoffFinalUrl),
      );
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff click completed", {
        beforeUrl: handoffBeforeUrl,
        afterUrl: handoffAfterUrl,
        popupUrl: handoffPopupUrl,
        finalUrl: handoffFinalUrl,
        leftAdzunaDomain: handoffLeftAdzunaDomain,
      });

      if (!handoffLeftAdzunaDomain) {
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] post-click still on adzuna", {
          currentUrl: handoffFinalUrl ?? page.url(),
          handoffClickUrl: handoffCandidate.href ?? null,
        });
        await page.waitForTimeout(1_200).catch(() => undefined);
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] post-click continuation scan started");
        const continuationCandidates = await scanCtaCandidates(page);
        const matchingContinuationCandidates: Array<{
          text: string;
          href: string | null;
          visible: boolean;
          score: number;
        }> = [];

        for (const continuation of continuationCandidates) {
          const continuationTextRaw = [
            continuation.text,
            continuation.ariaLabel,
            continuation.title,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          const continuationHref = continuation.href
            ? absolutizeUrl(continuation.href, page.url())
            : null;
          const matchesContinuationText = CONTINUATION_TEXT_PATTERN.test(
            continuationTextRaw,
          );
          const matchesHandoffUrl =
            Boolean(handoffCandidate.href) &&
            Boolean(continuationHref) &&
            continuationHref === handoffCandidate.href;
          if (!matchesContinuationText && !matchesHandoffUrl) {
            continue;
          }

          const reason = matchesHandoffUrl
            ? "matches_handoff_url"
            : "continuation_text_matched";
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] continuation candidate found", {
            text: continuationTextRaw,
            href: continuationHref,
            visible: continuation.visible,
            reason,
          });
          matchingContinuationCandidates.push({
            text: continuationTextRaw,
            href: continuationHref,
            visible: continuation.visible,
            score: continuationScore({
              text: continuationTextRaw,
              href: continuationHref,
              visible: continuation.visible,
              handoffUrl: handoffCandidate.href,
            }),
          });
        }

        matchingContinuationCandidates.sort((left, right) => right.score - left.score);
        const topContinuation = matchingContinuationCandidates[0];
        if (topContinuation) {
          continuationAttempted = true;
          continuationText = topContinuation.text || undefined;
          continuationHref = topContinuation.href ?? undefined;

          if (topContinuation.visible) {
            const continuationPopupPromise = context
              .waitForEvent("page", { timeout: 10_000 })
              .catch(() => null);
            const continuationBeforeUrl = page.url();
            const continuationNavPromise = page
              .waitForURL((url) => url.toString() !== continuationBeforeUrl, {
                timeout: 8_000,
              })
              .then(() => "same_tab_navigation")
              .catch(() => null);
            const continuationClicked = await clickHandoffCandidate({
              page,
              handoffUrl: topContinuation.href ?? undefined,
              handoffText: topContinuation.text,
            });
            if (continuationClicked) {
              handoffClickMethod = "continuation_click";
              console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] continuation clicked", {
                text: topContinuation.text,
                href: topContinuation.href,
              });
              logAggregatorHandoff("handoff click starting", {
                text: topContinuation.text,
                handoffClickUrl: topContinuation.href,
                mode: "continuation_click",
              });
              await Promise.race([
                continuationNavPromise,
                page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(
                  () => null,
                ),
                page.waitForTimeout(2_500).then(() => "timeout"),
              ]).catch(() => undefined);
              await page
                .waitForLoadState("domcontentloaded", { timeout: 8_000 })
                .catch(() => undefined);
              await page.waitForTimeout(1_500).catch(() => undefined);
            }
            const continuationPopup = await continuationPopupPromise;
            if (continuationPopup) {
              await continuationPopup
                .waitForLoadState("domcontentloaded", { timeout: 8_000 })
                .catch(() => undefined);
              handoffPopupUrl = continuationPopup.url();
              addVisitedUrl(handoffPopupUrl);
              addCandidate(handoffPopupUrl, "popup");
              console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] popup detected", {
                popupUrl: handoffPopupUrl,
              });
              logAggregatorHandoff("popup detected", {
                popupUrl: handoffPopupUrl,
                sessionId,
              });
            }
            handoffAfterUrl = page.url();
            addVisitedUrl(handoffAfterUrl);
            addCandidate(handoffAfterUrl, "final_navigation");
            handoffFinalUrl = handoffPopupUrl || handoffAfterUrl;
            handoffLeftAdzunaDomain = Boolean(
              handoffFinalUrl && !isAdzunaUrl(handoffFinalUrl),
            );
          } else if (topContinuation.href && topContinuation.href === handoffCandidate.href) {
            directGotoFallbackReason = "hidden_continuation_handoff_url";
          }
        }
      }

      if (!handoffLeftAdzunaDomain && handoffCandidate.href) {
        directGotoFallbackAttempted = true;
        if (!directGotoFallbackReason) {
          directGotoFallbackReason = "element_click_no_navigation";
        }
        console.info(
          "[ADZUNA_SCRAPFLY_NAVIGATOR] direct handoff goto fallback starting",
          {
            handoffClickUrl: handoffCandidate.href,
            reason: directGotoFallbackReason,
          },
        );

        const directGotoPopupPromise = context
          .waitForEvent("page", { timeout: 10_000 })
          .catch(() => null);
        const gotoBeforeUrl = page.url();
        const gotoResponse = await page
          .goto(handoffCandidate.href, {
            waitUntil: "domcontentloaded",
          })
          .catch(() => null);
        await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(
          () => undefined,
        );
        await page.waitForTimeout(2_000).catch(() => undefined);
        const gotoAfterUrl = page.url();
        const directGotoPopup = await directGotoPopupPromise;
        if (directGotoPopup) {
          await directGotoPopup
            .waitForLoadState("domcontentloaded", { timeout: 8_000 })
            .catch(() => undefined);
          handoffPopupUrl = directGotoPopup.url();
          addVisitedUrl(handoffPopupUrl);
          addCandidate(handoffPopupUrl, "popup");
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] popup detected", {
            popupUrl: handoffPopupUrl,
          });
          logAggregatorHandoff("popup detected", {
            popupUrl: handoffPopupUrl,
            sessionId,
          });
        }

        const redirectChain = getRedirectChain(gotoResponse);
        handoffClickMethod = "direct_goto";
        directGotoResponseUrl = gotoResponse?.url() ?? undefined;
        directGotoStatus = gotoResponse?.status() ?? undefined;
        if (typeof directGotoStatus === "number") {
          handoffResponseStatus = directGotoStatus;
          logAggregatorHandoff("response status detected", {
            status: directGotoStatus,
            url: directGotoResponseUrl ?? handoffCandidate.href,
            sessionId,
          });
        }
        handoffAfterUrl = gotoAfterUrl;
        handoffFinalUrl = handoffPopupUrl || gotoAfterUrl;
        handoffLeftAdzunaDomain = Boolean(
          handoffFinalUrl && !isAdzunaUrl(handoffFinalUrl),
        );
        addVisitedUrl(gotoAfterUrl);
        addCandidate(gotoAfterUrl, "final_navigation");
        if (directGotoResponseUrl) {
          addVisitedUrl(directGotoResponseUrl);
          addCandidate(directGotoResponseUrl, "network_redirect");
        }
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] goto response", {
          requestedUrl: handoffCandidate.href,
          responseUrl: directGotoResponseUrl ?? null,
          status: directGotoStatus ?? null,
          finalPageUrl: gotoAfterUrl,
        });
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] goto redirect chain", {
          chain: redirectChain,
        });
        console.info(
          "[ADZUNA_SCRAPFLY_NAVIGATOR] direct handoff goto fallback completed",
          {
            beforeUrl: gotoBeforeUrl,
            afterUrl: gotoAfterUrl,
            finalUrl: handoffFinalUrl,
            leftAdzunaDomain: handoffLeftAdzunaDomain,
          },
        );
      }
    } else {
      rejectedFinalCandidateReasons.add("no_handoff_cta_candidate");
      unresolvedReason = "adzuna_handoff_did_not_leave_aggregator";
      console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] unresolved", {
        reason: "adzuna_handoff_did_not_leave_aggregator",
        handoffClickAttempted: false,
        handoffClickUrl: null,
        finalUrl: page.url(),
        scrapflySessionId: sessionId ?? null,
      });
      logAggregatorHandoff("unresolved", {
        reason: "adzuna_handoff_did_not_leave_aggregator",
        finalUrl: page.url(),
        sessionId,
      });
    }

    const postClickPage = handoffPopupUrl
      ? context.pages().find((candidate) => candidate.url() === handoffPopupUrl) ??
        page
      : page;
    const postClickVerification = await detectVerification(postClickPage);
    if (postClickVerification.detection.detected) {
      shouldKeepBrowserOpen = true;
      console.warn("[ADZUNA_SCRAPFLY_RESOLVER] verification required", {
        stoppedAtUrl: postClickPage.url(),
        sessionId,
      });
      return {
        ok: false,
        error: postClickVerification.detection.reason,
        reason: "verification_required",
        sessionId,
        verificationRequired: true,
        stoppedAtUrl: postClickPage.url(),
        urlsVisited: [...urlsVisited],
        candidates: [...candidateByUrl.values()],
        ...buildEvidence(),
      };
    }

    await postClickPage
      .waitForLoadState("domcontentloaded", { timeout: 8_000 })
      .catch(() => undefined);
    await postClickPage.waitForTimeout(1_000).catch(() => undefined);
    let postClickSnapshot = await capturePageSnapshot(postClickPage);
    let loginCheckUrl = postClickPage.url();
    handoffPageTitle = postClickSnapshot.title || handoffPageTitle;

    const loginContinueGate = await detectAdzunaLoginContinueGate({
      page: postClickPage,
      responseStatus: handoffResponseStatus ?? directGotoStatus,
      finalUrl: handoffFinalUrl ?? loginCheckUrl,
      pageTitle: postClickSnapshot.title,
      bodyText: postClickSnapshot.bodyText,
    });
    if (loginContinueGate.detected) {
      adzunaLoginContinueGateDetected = true;
      adzunaSuspiciousBehaviorGateDetected = true;
      adzunaHandoffAccessDenied = true;
      adzunaLoginToContinueAvailable = Boolean(
        loginContinueGate.loginToContinueAvailable ||
          loginContinueGate.authenticateUrl ||
          /login to continue/i.test(loginContinueGate.bodyTextPreview ?? "") ||
          /login to continue/i.test(loginContinueGate.pageTitle ?? ""),
      );
      adzunaAuthenticateUrl = loginContinueGate.authenticateUrl ?? undefined;
      unresolvedReason =
        loginContinueGate.reason ?? "adzuna_handoff_access_denied";
      console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] login continue gate detected", {
        pageType: loginContinueGate.pageType,
        loginToContinueAvailable: adzunaLoginToContinueAvailable,
        authenticateUrlFound: Boolean(adzunaAuthenticateUrl),
        applicationId: args.applicationId,
        sourceJobId,
        finalUrl: handoffFinalUrl ?? loginCheckUrl,
        responseStatus: handoffResponseStatus ?? directGotoStatus ?? null,
        pageTitle: postClickSnapshot.title || null,
        scrapflySessionId: sessionId ?? null,
      });
      logAggregatorHandoff("login gate detected", {
        pageType: loginContinueGate.pageType,
        loginToContinueAvailable: adzunaLoginToContinueAvailable,
        authenticateUrlFound: Boolean(adzunaAuthenticateUrl),
        responseStatus: handoffResponseStatus ?? directGotoStatus ?? null,
        finalUrl: handoffFinalUrl ?? loginCheckUrl,
      });
        if (adzunaAuthenticateUrl) {
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] authenticate url extracted", {
            authenticateUrlFound: true,
            authenticateUrlPath: (() => {
            try {
              const parsed = new URL(adzunaAuthenticateUrl);
              return parsed.pathname;
            } catch {
              return null;
            }
          })(),
        });
      }

      if (adzunaAuthenticateUrl || adzunaLoginToContinueAvailable) {
        const loginMethod = adzunaAuthenticateUrl
          ? "authenticate_url_goto"
          : "element_click";
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] login to continue starting", {
          method: loginMethod,
          currentUrl: loginCheckUrl,
        });
        const loginContinuation = await continueThroughAdzunaLoginGate({
          page: postClickPage,
          context,
          authenticateUrl: adzunaAuthenticateUrl,
        });
        adzunaLoginToContinueClicked =
          loginMethod === "element_click"
            ? loginContinuation.clicked
            : Boolean(adzunaAuthenticateUrl);
        if (typeof loginContinuation.responseStatus === "number") {
          handoffResponseStatus = loginContinuation.responseStatus;
          logAggregatorHandoff("response status detected", {
            status: loginContinuation.responseStatus,
            url: loginContinuation.afterUrl,
            sessionId,
          });
        }
        if (loginContinuation.popupUrl) {
          handoffPopupUrl = loginContinuation.popupUrl;
          addVisitedUrl(handoffPopupUrl);
          addCandidate(handoffPopupUrl, "popup");
          logAggregatorHandoff("popup detected", {
            popupUrl: handoffPopupUrl,
            sessionId,
          });
        }
        loginCheckUrl = loginContinuation.afterUrl;
        addVisitedUrl(loginCheckUrl);
        addCandidate(loginCheckUrl, "final_navigation");
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] login to continue completed", {
          beforeUrl: loginContinuation.beforeUrl,
          afterUrl: loginContinuation.afterUrl,
          responseStatus: loginContinuation.responseStatus ?? null,
          pageTitle: loginContinuation.pageTitle || null,
          popupUrl: loginContinuation.popupUrl,
        });

        const loginSignals = await detectAdzunaLoginPage(loginContinuation.activePage);
        adzunaLoginPageDetected =
          loginContinuation.loginPageDetected ||
          loginSignals.hasEmailInput ||
          loginSignals.hasPasswordInput ||
          ADZUNA_LOGIN_URL_PATTERN.test(loginCheckUrl);
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] adzuna login page detected", {
          currentUrl: loginCheckUrl,
          hasEmailInput: loginSignals.hasEmailInput,
          hasPasswordInput: loginSignals.hasPasswordInput,
        });

        if (adzunaLoginPageDetected) {
          const credentials = readAdzunaLoginCredentials();
          adzunaCredentialAvailable = credentials.ready;
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] adzuna credential lookup", {
            credentialHost: "adzuna.com",
            credentialAvailable: adzunaCredentialAvailable,
          });

            if (!credentials.ready) {
            shouldKeepBrowserOpen = true;
            manualContinuationRequired = true;
            suggestedAction = "login_to_continue";
            currentErrorCode = ADZUNA_LOGIN_TO_CONTINUE_REQUIRED_CODE;
            adzunaLoginFailedReason = "missing_adzuna_credentials";
            console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] manual login required", {
              reason: "missing_adzuna_credentials",
              currentUrl: loginCheckUrl,
              scrapflySessionId: sessionId ?? null,
            });
            logAggregatorHandoff("manual continuation required", {
              reason: "missing_adzuna_credentials",
              currentUrl: loginCheckUrl,
              sessionId,
            });
            return {
              ok: false,
              error:
                "Adzuna requires login to continue. Complete login and resume the handoff flow.",
              errorCode: ADZUNA_LOGIN_TO_CONTINUE_REQUIRED_CODE,
              reason: "adzuna_login_to_continue_required",
              pageType: "adzuna_login_continue_gate",
              suggestedAction,
              manualContinuationRequired: true,
              sessionId,
              loginRequired: true,
              stoppedAtUrl: loginCheckUrl,
              urlsVisited: [...urlsVisited],
              candidates: [...candidateByUrl.values()],
              ...buildEvidence(),
            };
          }

          adzunaLoginAttempted = true;
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] adzuna login attempted");
          const loginResult = await attemptAdzunaCredentialLogin({
            page: loginContinuation.activePage,
            email: credentials.email,
            password: credentials.password,
          });
          adzunaLoginAttempted = adzunaLoginAttempted || loginResult.attempted;
          adzunaLoginSucceeded = loginResult.succeeded;
          adzunaLoginFailedReason = loginResult.failureReason;
          loginCheckUrl = loginContinuation.activePage.url();
          addVisitedUrl(loginCheckUrl);
          addCandidate(loginCheckUrl, "final_navigation");
          console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] adzuna login completed", {
            loginSucceeded: adzunaLoginSucceeded,
            currentUrl: loginCheckUrl,
          });

          if (!adzunaLoginSucceeded) {
            shouldKeepBrowserOpen = true;
            manualContinuationRequired = true;
            suggestedAction = "login_to_continue";
            currentErrorCode = ADZUNA_LOGIN_TO_CONTINUE_REQUIRED_CODE;
            logAggregatorHandoff("manual continuation required", {
              reason: adzunaLoginFailedReason ?? "adzuna_login_failed",
              currentUrl: loginCheckUrl,
              sessionId,
            });
            return {
              ok: false,
              error:
                "Adzuna login did not complete successfully. Complete login and resume.",
              errorCode: ADZUNA_LOGIN_TO_CONTINUE_REQUIRED_CODE,
              reason: "adzuna_login_to_continue_required",
              pageType: "adzuna_login_continue_gate",
              suggestedAction,
              manualContinuationRequired: true,
              sessionId,
              loginRequired: true,
              stoppedAtUrl: loginCheckUrl,
              urlsVisited: [...urlsVisited],
              candidates: [...candidateByUrl.values()],
              ...buildEvidence(),
            };
          }

          if (handoffCandidate?.href) {
            adzunaPostLoginHandoffRetried = true;
            console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] retrying handoff after login", {
              handoffClickUrl: handoffCandidate.href,
            });
            const retryResponse = await loginContinuation.activePage
              .goto(handoffCandidate.href, {
                waitUntil: "domcontentloaded",
              })
              .catch(() => null);
            await loginContinuation.activePage
              .waitForLoadState("domcontentloaded", { timeout: 10_000 })
              .catch(() => undefined);
            await loginContinuation.activePage.waitForTimeout(1_500).catch(() => undefined);
            const retryFinalUrl = loginContinuation.activePage.url();
            handoffAfterUrl = retryFinalUrl;
            handoffFinalUrl = retryFinalUrl;
            handoffLeftAdzunaDomain = !isAdzunaUrl(retryFinalUrl);
            handoffResponseStatus = retryResponse?.status() ?? handoffResponseStatus;
            directGotoStatus = retryResponse?.status() ?? directGotoStatus;
            directGotoResponseUrl = retryResponse?.url() ?? directGotoResponseUrl;
            addVisitedUrl(retryFinalUrl);
            addCandidate(retryFinalUrl, "final_navigation");
            if (directGotoResponseUrl) {
              addVisitedUrl(directGotoResponseUrl);
              addCandidate(directGotoResponseUrl, "network_redirect");
            }
            if (handoffLeftAdzunaDomain) {
              adzunaPostLoginResolvedDirectUrl = retryFinalUrl;
            }
            console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] post-login handoff completed", {
              finalUrl: retryFinalUrl,
              leftAdzunaDomain: handoffLeftAdzunaDomain,
              resolvedDirectUrl: adzunaPostLoginResolvedDirectUrl ?? null,
            });
          }

          postClickSnapshot = await capturePageSnapshot(loginContinuation.activePage);
          handoffPageTitle = postClickSnapshot.title || handoffPageTitle;
          loginCheckUrl = loginContinuation.activePage.url();
        }
      }

      if (!adzunaLoginSucceeded && !manualContinuationRequired) {
        const blockedStatus = handoffResponseStatus ?? directGotoStatus;
        const blockedFinalUrl = handoffFinalUrl ?? loginCheckUrl;
        const isRateLimited = detectAdzunaHandoffRateLimited({
          responseStatus: blockedStatus,
          finalUrl: blockedFinalUrl,
          pageTitle: postClickSnapshot.title || null,
          bodyText: postClickSnapshot.bodyText,
        });
        currentErrorCode = isRateLimited
          ? ADZUNA_HANDOFF_RATE_LIMITED_CODE
          : ADZUNA_HANDOFF_ACCESS_DENIED_CODE;
        unresolvedReason = isRateLimited
          ? "adzuna_rate_limited"
          : "adzuna_handoff_access_denied";
        suggestedAction = isRateLimited
          ? "try_again_later_or_employer_direct_search"
          : "try_employer_direct_search";
        if (isRateLimited) {
          console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] rate limit detected", {
            applicationId: args.applicationId,
            sourceJobId,
            handoffClickUrl: handoffCandidate?.href ?? null,
            responseStatus: blockedStatus ?? null,
            finalUrl: blockedFinalUrl,
            pageTitle: postClickSnapshot.title || null,
            scrapflySessionId: sessionId ?? null,
          });
          logAggregatorHandoff("rate limit stop prepared", {
            reason: unresolvedReason,
            responseStatus: blockedStatus ?? null,
            finalUrl: blockedFinalUrl,
            handoffClickUrl: handoffCandidate?.href ?? null,
            sessionId: sessionId ?? null,
          });
        }
        if (!isRateLimited) {
          console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] handoff access denied detected", {
            applicationId: args.applicationId,
            sourceJobId,
            handoffClickUrl: handoffCandidate?.href ?? null,
            responseStatus: blockedStatus ?? null,
            finalUrl: handoffFinalUrl ?? loginCheckUrl,
            pageTitle: postClickSnapshot.title || null,
            scrapflySessionId: sessionId ?? null,
          });
        }
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] fallback to employer direct search", {
          reason: "adzuna_handoff_access_denied",
          title: args.title ?? null,
          company: args.company ?? null,
          location: args.location ?? null,
        });

        return {
          ok: false,
          error: isRateLimited
            ? "Adzuna rate-limited the handoff page before the employer posting could load."
            : "Adzuna handoff page was blocked with Access Denied before reaching the employer posting.",
          errorCode: currentErrorCode,
          reason: unresolvedReason,
          pageType: isRateLimited
            ? "adzuna_rate_limited"
            : "adzuna_login_continue_gate",
          suggestedAction,
          sessionId,
          stoppedAtUrl: loginCheckUrl,
          urlsVisited: [...urlsVisited],
          candidates: [...candidateByUrl.values()],
          ...buildEvidence(),
        };
      }
    }

    if (
      !isAdzunaUrl(loginCheckUrl) &&
      detectLoginRequired({
        url: loginCheckUrl,
        title: postClickSnapshot.title,
        pageText: postClickSnapshot.bodyText,
      })
    ) {
      shouldKeepBrowserOpen = true;
      console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] login required", {
        stoppedAtUrl: loginCheckUrl,
        sessionId,
      });
      return {
        ok: false,
        error: "Login is required before continuing to the employer application.",
        reason: "login_required",
        sessionId,
        loginRequired: true,
        stoppedAtUrl: loginCheckUrl,
        urlsVisited: [...urlsVisited],
        candidates: [...candidateByUrl.values()],
        ...buildEvidence(),
      };
    }

    const bestCandidate = pickBestCandidate([...candidateByUrl.values()]);
    if (bestCandidate) {
      const method = ([
        "final_navigation",
        "popup",
        "apply_cta_href",
        "network_redirect",
        "script_redirect",
        "meta_refresh",
        "external_link",
      ] as const).includes(bestCandidate.source as never)
        ? (bestCandidate.source as
            | "final_navigation"
            | "popup"
            | "apply_cta_href"
            | "network_redirect"
            | "script_redirect"
            | "meta_refresh"
            | "external_link")
        : "external_link";

      console.info("[ADZUNA_SCRAPFLY_RESOLVER] resolved employer url", {
        resolvedUrl: bestCandidate.url,
        method,
        sessionId,
      });
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] resolved employer url", {
        resolvedUrl: bestCandidate.url,
        method,
        sessionId,
      });
      console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] final target accepted", {
        resolvedDirectUrl: bestCandidate.url,
        source: bestCandidate.source,
        reason: bestCandidate.reason,
      });
      logAggregatorHandoff("resolved employer url", {
        resolvedDirectUrl: bestCandidate.url,
        source: bestCandidate.source,
        reason: bestCandidate.reason,
        sessionId,
      });
      console.info("[ADZUNA_SCRAPFLY_RESOLVER] resolved real posting", {
        resolvedUrl: bestCandidate.url,
        method,
        sessionId,
      });
      unresolvedReason = undefined;
      if (adzunaPostLoginHandoffRetried && !adzunaPostLoginResolvedDirectUrl) {
        adzunaPostLoginResolvedDirectUrl = bestCandidate.url;
      }

      return {
        ok: true,
        resolvedUrl: bestCandidate.url,
        method,
        sessionId: sessionId ?? "unknown",
        urlsVisited: [...urlsVisited],
        candidates: [...candidateByUrl.values()],
        ...buildEvidence(),
      };
    }

    if (handoffFinalUrl) {
      const reason = isAdzunaUrl(handoffFinalUrl)
        ? "final_url_still_adzuna_domain"
        : "final_url_not_employer_or_ats";
      rejectedFinalCandidateReasons.add(reason);
      console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] final target rejected", {
        url: handoffFinalUrl,
        reason,
      });
    }
    const finalBlockedStatus = handoffResponseStatus ?? directGotoStatus;
    const shouldClassifyAsRateLimited =
      detectAdzunaHandoffRateLimited({
        responseStatus: finalBlockedStatus,
        finalUrl: handoffFinalUrl ?? postClickPage.url(),
        pageTitle: handoffPageTitle || postClickSnapshot.title || null,
        bodyText: postClickSnapshot.bodyText,
      });
    const shouldClassifyAsAccessDenied =
      adzunaHandoffAccessDenied &&
      (ADZUNA_DENIED_STATUS_CODES.has(finalBlockedStatus ?? -1) ||
        isAdzunaLandAdHandoffUrl(handoffFinalUrl ?? postClickPage.url()));
    unresolvedReason = shouldClassifyAsRateLimited
      ? "adzuna_rate_limited"
      : shouldClassifyAsAccessDenied
        ? "adzuna_handoff_access_denied"
        : !handoffFinalUrl || isAdzunaUrl(handoffFinalUrl)
          ? "adzuna_handoff_did_not_leave_aggregator"
          : "adzuna_handoff_did_not_resolve_to_employer";
    if (!currentErrorCode) {
      currentErrorCode = unresolvedReason === "adzuna_rate_limited"
        ? ADZUNA_HANDOFF_RATE_LIMITED_CODE
        : unresolvedReason === "adzuna_handoff_access_denied"
          ? ADZUNA_HANDOFF_ACCESS_DENIED_CODE
          : undefined;
    }
    if (!suggestedAction) {
      suggestedAction = unresolvedReason === "adzuna_rate_limited"
        ? "try_again_later_or_employer_direct_search"
        : unresolvedReason === "adzuna_handoff_access_denied"
          ? "try_employer_direct_search"
          : undefined;
    }
    const unresolvedMessage =
      unresolvedReason === "adzuna_rate_limited"
        ? "Adzuna rate-limited this handoff request before the employer posting could be opened."
        : unresolvedReason === "adzuna_handoff_access_denied"
        ? "Adzuna handoff page is blocked (Access Denied) and could not reach the employer posting."
        : unresolvedReason === "adzuna_handoff_did_not_leave_aggregator"
        ? "Adzuna handoff did not leave the aggregator page."
        : isAdzunaUnresolvedHandoffUrl(postClickPage.url())
          ? "Adzuna handoff could not be resolved to a real employer posting."
          : "No real employer/ATS URL candidate was found.";
    const unresolvedEvidence = buildEvidence();
    console.warn("[ADZUNA_SCRAPFLY_RESOLVER] unresolved", {
      adzunaUrl: adzunaDetailUrl,
      urlsVisited: [...urlsVisited],
      candidateCount: candidateByUrl.size,
    });
    console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] unresolved", {
      reason: unresolvedReason,
      handoffClickAttempted: unresolvedEvidence.handoffClickAttempted,
      handoffClickUrl: unresolvedEvidence.handoffClickUrl ?? null,
      finalUrl: unresolvedEvidence.handoffFinalUrl ?? postClickPage.url(),
      scrapflySessionId: sessionId ?? null,
    });
    logAggregatorHandoff("unresolved", {
      reason: unresolvedReason,
      handoffClickAttempted: unresolvedEvidence.handoffClickAttempted,
      handoffClickUrl: unresolvedEvidence.handoffClickUrl ?? null,
      finalUrl: unresolvedEvidence.handoffFinalUrl ?? postClickPage.url(),
      sessionId,
    });
    if (unresolvedReason === "adzuna_rate_limited") {
      console.warn("[ADZUNA_SCRAPFLY_NAVIGATOR] rate limit detected", {
        applicationId: args.applicationId,
        sourceJobId,
        responseStatus: finalBlockedStatus ?? null,
        finalUrl: unresolvedEvidence.handoffFinalUrl ?? postClickPage.url(),
        pageTitle: unresolvedEvidence.handoffPageTitle ?? null,
        scrapflySessionId: sessionId ?? null,
      });
      logAggregatorHandoff("rate limit stop prepared", {
        reason: unresolvedReason,
        responseStatus: finalBlockedStatus ?? null,
        finalUrl: unresolvedEvidence.handoffFinalUrl ?? postClickPage.url(),
        handoffClickUrl: unresolvedEvidence.handoffClickUrl ?? null,
        sessionId: sessionId ?? null,
      });
    }

    return {
      ok: false,
      error: unresolvedMessage,
      errorCode: currentErrorCode,
      reason: unresolvedReason,
      pageType:
        unresolvedReason === "adzuna_rate_limited"
          ? "adzuna_rate_limited"
          : unresolvedReason === "adzuna_handoff_access_denied"
            ? "adzuna_login_continue_gate"
          : undefined,
      suggestedAction,
      sessionId,
      urlsVisited: [...urlsVisited],
      candidates: [...candidateByUrl.values()],
      stoppedAtUrl: postClickPage.url(),
      ...unresolvedEvidence,
    };
  } catch (error) {
    const errorEvidence = buildEvidence();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to resolve Adzuna handoff.",
      sessionId,
      urlsVisited: [...urlsVisited],
      candidates: [...candidateByUrl.values()],
      ...errorEvidence,
    };
  } finally {
    if (browser) {
      if (shouldKeepBrowserOpen) {
        await disconnectScrapflyBrowserSession(browser, {
          scrapflySessionId: sessionId ?? null,
        }).catch(() => undefined);
        console.info("[SCRAPFLY_BROWSER] session lifecycle", {
          scrapflySessionId: sessionId ?? null,
          disconnectMode: "disconnect",
          sessionPreserved: true,
        });
        console.info("[SCRAPFLY_BROWSER] session preserved", {
          sessionId: sessionId ?? null,
          autoClose: false,
          sessionPreserved: true,
        });
      } else {
        await browser.close().catch(() => undefined);
        console.info("[SCRAPFLY_BROWSER] session lifecycle", {
          scrapflySessionId: sessionId ?? null,
          disconnectMode: "close",
          sessionPreserved: false,
        });
      }
    }
  }
}

export async function runScrapflyAggregatorHandoff(args: {
  adzunaUrl: string;
  applicationId: string;
  applySessionId?: string | null;
  sourceJobId?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  return resolveAdzunaHandoffWithScrapfly(args);
}
