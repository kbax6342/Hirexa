import type { Page } from "playwright-core";

export type PageSignals = {
  html: string;
  pageText: string;
  verificationSignals: string[];
  searchEngineChallengeSignals: string[];
  searchEngineChallengeDetected: boolean;
  confirmationSignals: string[];
  confirmationTextFound: boolean;
  confirmationTextSnippet?: string | null;
  successUrlPatternMatched: boolean;
  accountSignals: string[];
  needsHuman: boolean;
  confirmationDetected: boolean;
  formDetected: boolean;
};

export type MeaningfulFormControlSummary = {
  controlCount: number;
  hasPassword: boolean;
};

export const HUMAN_VERIFICATION_CHECKS = [
  "just a moment",
  "performing security verification",
  "verify you are human",
  "verify you're human",
  "verify that you are human",
  "prove you are human",
  "are you human",
  "are you a human",
  "human verification",
  "checking if you are human",
  "checking your browser",
  "checking if the site connection is secure",
  "please enable javascript and cookies",
  "press & hold",
  "press and hold",
  "captcha",
  "hcaptcha",
  "recaptcha",
  "turnstile",
  "cloudflare",
  "cf-chl",
  "security check",
  "security verification",
  "verification required",
  "email verification",
  "verify your email",
  "check your email",
  "verification code",
  "one-time passcode",
  "one time passcode",
  "one-time code",
  "one time code",
  "otp",
] as const;

const VERIFICATION_DOM_MARKERS: Array<{ selector: string; signal: string }> = [
  { selector: "iframe[src*='turnstile']", signal: "turnstile iframe" },
  { selector: "iframe[title*='turnstile' i]", signal: "turnstile iframe" },
  {
    selector: "iframe[src*='challenges.cloudflare.com']",
    signal: "cloudflare challenge iframe",
  },
  { selector: ".cf-turnstile", signal: "turnstile widget" },
  { selector: "[id*='turnstile' i]", signal: "turnstile container" },
  { selector: "input[name='cf-turnstile-response']", signal: "turnstile response field" },
  { selector: "#challenge-form", signal: "challenge form" },
  { selector: "#challenge-running", signal: "challenge running indicator" },
  { selector: "[class*='challenge-form' i]", signal: "challenge form" },
  { selector: "[data-testid*='challenge' i]", signal: "challenge container" },
];

export const SEARCH_ENGINE_CHALLENGE_CHECKS = [
  "unusual traffic",
  "automated queries",
  "sorry, but your computer or network",
  "prove you are human",
  "please solve this challenge",
  "security challenge",
  "are you a robot",
] as const;

const CONFIRMATION_CHECKS = [
  "application submitted",
  "thank you",
  "thanks for applying",
  "we have received your application",
  "your application has been submitted",
  "successfully applied",
  "application received",
] as const;

const ACCOUNT_CREATION_CHECKS = [
  "create account",
  "create your account",
  "sign up",
  "register",
  "finish creating your account",
  "set your password",
  "confirm your email",
] as const;

const SUCCESS_URL_PATTERN =
  /(?:^|[/?#&=_-])(thank-you|thankyou|application-submitted|submission-confirmed|submitted|confirmation|success)(?:$|[/?#&=_-])/i;

export const APPLY_SETTLE_DELAY_MS = 1200;

function containsSignal(text: string, checks: readonly string[]) {
  const lower = text.toLowerCase();
  return checks.filter((check) => lower.includes(check));
}

export function collectVerificationSignals(
  values: Array<string | null | undefined>,
) {
  const text = values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
  return [...new Set(containsSignal(text, HUMAN_VERIFICATION_CHECKS))];
}

function extractSignalSnippet(text: string, signals: string[]) {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source) return null;

  const lower = source.toLowerCase();
  for (const signal of signals) {
    const index = lower.indexOf(signal.toLowerCase());
    if (index < 0) continue;

    const start = Math.max(0, index - 60);
    const end = Math.min(source.length, index + signal.length + 120);
    return source.slice(start, end).trim();
  }

  return null;
}

function matchesSuccessUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return SUCCESS_URL_PATTERN.test(
      `${parsed.pathname}${parsed.search}${parsed.hash}`,
    );
  } catch {
    return SUCCESS_URL_PATTERN.test(rawUrl);
  }
}

async function detectForm(page: Page) {
  const result = await readMeaningfulFormControlSummary(page).catch(() => ({
    controlCount: 0,
    hasPassword: false,
  }));

  return {
    formDetected: result.controlCount > 0,
    hasPassword: result.hasPassword,
  };
}

async function detectVerificationDomSignals(page: Page) {
  return page
    .evaluate((markers) => {
      const found = new Set<string>();
      for (const marker of markers) {
        try {
          if (document.querySelector(marker.selector)) {
            found.add(marker.signal);
          }
        } catch {
          // Ignore selector parse errors from malformed pages.
        }
      }
      return Array.from(found);
    }, VERIFICATION_DOM_MARKERS)
    .catch(() => [] as string[]);
}

export async function readMeaningfulFormControlSummary(
  page: Page,
): Promise<MeaningfulFormControlSummary> {
  return page
    .evaluate(() => {
      const selector = "input, textarea, select";
      const nodes = Array.from(document.querySelectorAll(selector));

      function isVisible(node: HTMLElement) {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function hasCookieContext(node: Element) {
        const container = node.closest(
          '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [aria-label*="cookie"], [aria-label*="consent"], [data-testid*="cookie"], [data-testid*="consent"]',
        );
        if (!container) return false;
        const text = (container.textContent ?? "").toLowerCase();
        return (
          text.includes("cookie") ||
          text.includes("consent") ||
          text.includes("privacy") ||
          text.includes("preference")
        );
      }

      const visibleControls = nodes.filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (!isVisible(node)) return false;
        if (node.hasAttribute("disabled")) return false;
        if (node.getAttribute("aria-disabled") === "true") return false;
        if (node.closest("header, nav, footer, [role='navigation']")) {
          return false;
        }
        if (hasCookieContext(node)) return false;

        if (node instanceof HTMLInputElement) {
          const type = (node.type || "text").toLowerCase();
          if (
            type === "hidden" ||
            type === "submit" ||
            type === "button" ||
            type === "reset" ||
            type === "image" ||
            type === "checkbox" ||
            type === "radio"
          ) {
            return false;
          }
        }

        return true;
      });

      return {
        controlCount: visibleControls.length,
        hasPassword: visibleControls.some(
          (node) => node instanceof HTMLInputElement && node.type === "password",
        ),
      };
    })
    .catch(() => ({ controlCount: 0, hasPassword: false }));
}

export async function waitForMeaningfulFormControls(
  page: Page,
  options?: {
    timeoutMs?: number;
    minCount?: number;
    pollMs?: number;
  },
) {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const minCount = options?.minCount ?? 1;
  const pollMs = options?.pollMs ?? 300;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const summary = await readMeaningfulFormControlSummary(page);
    if (summary.controlCount >= minCount) {
      return summary;
    }

    await page.waitForTimeout(pollMs).catch(() => undefined);
  }

  return null;
}

export async function waitForDomAndSettle(page: Page) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(APPLY_SETTLE_DELAY_MS);
}

export async function detectPageSignals(page: Page): Promise<PageSignals> {
  const [html, pageText, currentTitle, form, verificationDomSignals] = await Promise.all([
    page.content().catch(() => ""),
    page.innerText("body").catch(() => ""),
    page.title().catch(() => ""),
    detectForm(page),
    detectVerificationDomSignals(page),
  ]);

  const visibleText = [currentTitle, pageText].join("\n");
  const verificationText = [page.url(), currentTitle, pageText, html].join("\n");
  const verificationSignals = [
    ...new Set([
      ...collectVerificationSignals([verificationText]),
      ...verificationDomSignals,
    ]),
  ];
  const searchEngineChallengeSignals = [
    ...new Set(containsSignal(verificationText, SEARCH_ENGINE_CHALLENGE_CHECKS)),
  ];
  const confirmationSignals = [
    ...new Set(containsSignal(visibleText, CONFIRMATION_CHECKS)),
  ];
  const accountSignals = [
    ...new Set(containsSignal(visibleText, ACCOUNT_CREATION_CHECKS)),
  ];
  const confirmationTextFound = confirmationSignals.length > 0;
  const confirmationTextSnippet = extractSignalSnippet(
    visibleText,
    confirmationSignals,
  );
  const successUrlPatternMatched = matchesSuccessUrl(page.url());

  return {
    html,
    pageText,
    verificationSignals,
    searchEngineChallengeSignals,
    searchEngineChallengeDetected: searchEngineChallengeSignals.length > 0,
    confirmationSignals,
    confirmationTextFound,
    confirmationTextSnippet,
    successUrlPatternMatched,
    accountSignals,
    needsHuman:
      verificationSignals.length > 0 ||
      currentTitle.toLowerCase().includes("just a moment") ||
      accountSignals.length > 0 ||
      form.hasPassword,
    confirmationDetected: confirmationTextFound,
    formDetected: form.formDetected,
  };
}
