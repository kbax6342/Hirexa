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
import type {
  ApplySessionClickRecord,
  ApplySessionDebug,
} from "@/app/lib/apply/applySessionStore";
import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";

export type PlaywrightApplyResult = {
  ok: boolean;
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

function shouldUseCdp(connectUrl: string) {
  return connectUrl.startsWith("http://") || connectUrl.startsWith("https://");
}

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

  const attemptedSelectors: string[] = [];
  const missingNames: string[] = [];
  const targetUrl = args.form?.embedUrl ?? args.jobUrl;

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
      browser = await chromium.launch({
        headless: args.mode === "HUMAN_ASSIST" ? false : true,
      });
      console.log("[AUTO_APPLY_REMOTE] using local browser");
    }

    context = await browser.newContext();
    let page = await context.newPage();
    await args.onPageReady?.(page, context);

    console.log("[AUTO_APPLY_REMOTE] goto", targetUrl);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(page);

    const chase: CtaChaseResult = await chaseApplyPath({
      page,
      context,
      onPageReady: args.onPageReady,
      onStatus: args.onStatus,
      viewerUrl: remoteSession?.viewerUrl,
      remoteSessionId: remoteSession?.sessionId,
      openUrl: targetUrl,
    });

    page = chase.page;

    if (chase.signals.confirmationDetected) {
      const finalUrl = page.url();
      await args.onStatus?.({
        status: "SUBMITTED",
        lastUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      return {
        ok: true,
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

      return {
        ok: false,
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
        }),
      };
    }

    if ("unavailable" in chase && chase.unavailable) {
      const finalUrl = page.url();
      const message =
        "Auto apply is not available for this job application because no usable apply path was found.";

      await args.onStatus?.({
        status: "AUTO_APPLY_UNAVAILABLE",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      return {
        ok: false,
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
        }),
      };
    }

    await args.onStatus?.({
      status: "OPENING_FORM",
      lastUrl: page.url(),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: page.url(),
      remoteSessionId: remoteSession?.sessionId,
    });

    await page.waitForSelector("input, textarea, select", {
      timeout: 15_000,
    });

    await args.onStatus?.({
      status: "FILLING_FORM",
      lastUrl: page.url(),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: page.url(),
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

      return {
        ok: false,
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
        }),
      };
    }

    await args.onStatus?.({
      status: "SUBMITTING",
      lastUrl: page.url(),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: page.url(),
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
    for (const submitSelector of submitSelectors) {
      const button = page.locator(submitSelector).first();
      if ((await button.count()) === 0) continue;
      if (!(await button.isVisible().catch(() => false))) continue;
      if (!(await button.isEnabled().catch(() => false))) continue;

      submitUsed = submitSelector;
      console.log("[AUTO_APPLY_CRAWL] clicking submit", submitSelector);
      await Promise.all([
        page
          .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 })
          .catch(() => null),
        button.click(),
      ]);
      break;
    }

    if (!submitUsed) {
      const finalUrl = page.url();
      const message = "Submit button not found.";

      await args.onStatus?.({
        status: "FAILED",
        lastUrl: finalUrl,
        error: message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      return {
        ok: false,
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
        }),
      };
    }

    await args.onStatus?.({
      status: "WAITING_CONFIRMATION",
      lastUrl: page.url(),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: page.url(),
      remoteSessionId: remoteSession?.sessionId,
    });

    await waitForDomAndSettle(page);

    const finalUrl = page.url();
    const finalSignals = await detectPageSignals(page);
    const success = finalSignals.confirmationDetected;

    console.log("[AUTO_APPLY_CRAWL] final page state", {
      finalUrl,
      success,
      verificationDetected: finalSignals.needsHuman,
      confirmationDetected: finalSignals.confirmationDetected,
      hopCount: chase.hopCount,
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
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chase.hopCount,
          urlsVisited: [...chase.urlsVisited, finalUrl],
          clicks: chase.clicks,
          formDetected: true,
          confirmationDetected: finalSignals.confirmationDetected,
          verificationDetected: true,
          finalReason: "Verification detected after submit.",
        }),
      };
    }

    await args.onStatus?.({
      status: success ? "SUBMITTED" : "FAILED",
      lastUrl: finalUrl,
      error: success ? undefined : "Submission could not be confirmed.",
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: finalUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    return {
      ok: success,
      finalUrl,
      openUrl: finalUrl,
      viewerUrl: remoteSession?.viewerUrl,
      message: success ? undefined : "Submission could not be confirmed.",
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
        success,
        needsHuman: false,
        unavailable: false,
        hopCount: chase.hopCount,
        urlsVisited: [...chase.urlsVisited, finalUrl],
        clicks: chase.clicks,
        formDetected: true,
        confirmationDetected: finalSignals.confirmationDetected,
        verificationDetected: false,
        finalReason: success
          ? "Submission confirmed."
          : "Submission could not be confirmed.",
      }),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Playwright submit failed.";
    console.log("[AUTO_APPLY_CRAWL] error", message);

    await args.onStatus?.({
      status: "FAILED",
      error: message,
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: targetUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    return {
      ok: false,
      message,
      openUrl: targetUrl,
      viewerUrl: remoteSession?.viewerUrl,
      debug: buildDebugPayload({
        attemptedSelectors,
        missingNames,
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        targetUrl,
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
    hopCount: result.hopCount,
    urlsVisited: result.urlsVisited,
    clicks: result.clicks,
    formDetected: result.formDetected,
    confirmationDetected: result.confirmationDetected,
    verificationDetected: result.verificationDetected,
    finalReason: result.finalReason,
  };
}
