import type { Page } from "playwright-core";

export type PageSignals = {
  html: string;
  pageText: string;
  verificationSignals: string[];
  confirmationSignals: string[];
  confirmationTextFound: boolean;
  confirmationTextSnippet?: string | null;
  successUrlPatternMatched: boolean;
  accountSignals: string[];
  needsHuman: boolean;
  confirmationDetected: boolean;
  formDetected: boolean;
};

const HUMAN_VERIFICATION_CHECKS = [
  "verify you are human",
  "human verification",
  "captcha",
  "recaptcha",
  "turnstile",
  "cloudflare",
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
  const result = await page
    .evaluate(() => {
      const selector =
        "form input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']), form textarea, form select, input[type='file']";
      const nodes = Array.from(document.querySelectorAll(selector));

      const visibleControls = nodes.filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          !node.hasAttribute("disabled")
        );
      });

      return {
        controlCount: visibleControls.length,
        hasPassword: visibleControls.some(
          (node) => node instanceof HTMLInputElement && node.type === "password",
        ),
      };
    })
    .catch(() => ({ controlCount: 0, hasPassword: false }));

  return {
    formDetected: result.controlCount > 0,
    hasPassword: result.hasPassword,
  };
}

export async function waitForDomAndSettle(page: Page) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(APPLY_SETTLE_DELAY_MS);
}

export async function detectPageSignals(page: Page): Promise<PageSignals> {
  const [html, pageText, currentTitle, form] = await Promise.all([
    page.content().catch(() => ""),
    page.innerText("body").catch(() => ""),
    page.title().catch(() => ""),
    detectForm(page),
  ]);

  const visibleText = [currentTitle, pageText].join("\n");
  const verificationText = [page.url(), currentTitle, pageText, html].join("\n");
  const verificationSignals = [
    ...new Set(containsSignal(verificationText, HUMAN_VERIFICATION_CHECKS)),
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
    confirmationSignals,
    confirmationTextFound,
    confirmationTextSnippet,
    successUrlPatternMatched,
    accountSignals,
    needsHuman:
      verificationSignals.length > 0 ||
      accountSignals.length > 0 ||
      form.hasPassword,
    confirmationDetected: confirmationTextFound,
    formDetected: form.formDetected,
  };
}
