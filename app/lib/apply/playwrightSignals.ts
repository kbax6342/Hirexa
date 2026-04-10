import type { Page } from "playwright-core";

export type PageSignals = {
  html: string;
  pageText: string;
  verificationSignals: string[];
  confirmationSignals: string[];
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

export const APPLY_SETTLE_DELAY_MS = 1200;

function containsSignal(text: string, checks: readonly string[]) {
  const lower = text.toLowerCase();
  return checks.filter((check) => lower.includes(check));
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

  const aggregateText = [page.url(), currentTitle, html, pageText].join("\n");
  const verificationSignals = [
    ...new Set(containsSignal(aggregateText, HUMAN_VERIFICATION_CHECKS)),
  ];
  const confirmationSignals = [
    ...new Set(containsSignal(aggregateText, CONFIRMATION_CHECKS)),
  ];
  const accountSignals = [
    ...new Set(containsSignal(aggregateText, ACCOUNT_CREATION_CHECKS)),
  ];

  return {
    html,
    pageText,
    verificationSignals,
    confirmationSignals,
    accountSignals,
    needsHuman:
      verificationSignals.length > 0 ||
      accountSignals.length > 0 ||
      form.hasPassword,
    confirmationDetected:
      confirmationSignals.length > 0 ||
      /confirmation|submitted|thank-you|thankyou|success/i.test(page.url()),
    formDetected: form.formDetected,
  };
}
