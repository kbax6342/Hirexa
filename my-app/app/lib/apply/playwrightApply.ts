import { chromium } from "playwright-core";
import { cssEscape } from "@/app/lib/apply/cssEscape";
import { closeRemoteSession, createRemoteSession } from "@/app/lib/apply/remoteBrowser";

export type PlaywrightApplyResult = {
  ok: boolean;
  finalUrl?: string;
  needsHuman?: boolean;
  message?: string;
  debug?: {
    attemptedSelectors: string[];
    missingNames: string[];
    finalUrl?: string;
    submitSelectorUsed?: string | null;
    verificationSignals: string[];
    pageText?: string;
    pageHtml?: string;
    sessionId?: string;
    viewerUrl?: string;
    success: boolean;
    needsHuman: boolean;
  };
};

type AnswerValue = string | string[];

function asArray(value: AnswerValue) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [String(value ?? "")];
}

function containsSignal(text: string, checks: string[]) {
  const lower = text.toLowerCase();
  return checks.filter((check) => lower.includes(check));
}

function shouldUseRemoteBrowser() {
  return process.env.REMOTE_BROWSER_PROVIDER?.toLowerCase() === "browserbase";
}

export async function applyWithPlaywright(args: {
  jobUrl: string;
  values: Record<string, string | string[]>;
  resumePath?: string | null;
}): Promise<PlaywrightApplyResult> {
  let browser;
  let context;
  let remoteSession: Awaited<ReturnType<typeof createRemoteSession>> | null = null;
  let keepRemoteAlive = false;

  const attemptedSelectors: string[] = [];
  const missingNames: string[] = [];
  const verificationChecks = ["verify you are human", "captcha", "turnstile", "cloudflare", "security check"];

  try {
    if (shouldUseRemoteBrowser()) {
      remoteSession = await createRemoteSession();
      const useCdp = remoteSession.connectUrl.startsWith("http://") || remoteSession.connectUrl.startsWith("https://");
      browser = useCdp
        ? await chromium.connectOverCDP(remoteSession.connectUrl)
        : await chromium.connect(remoteSession.connectUrl);
      console.log("[REMOTE_APPLY] connected to remote browser", {
        sessionId: remoteSession.sessionId,
        transport: useCdp ? "cdp" : "ws",
      });
    } else {
      browser = await chromium.launch({ headless: true });
      console.log("[REMOTE_APPLY] using local browser");
    }

    context = await browser.newContext();
    const page = await context.newPage();

    console.log("[REMOTE_APPLY] goto", args.jobUrl);
    await page.goto(args.jobUrl, { waitUntil: "domcontentloaded" });
    console.log("[REMOTE_APPLY] landed", page.url());

    await page.waitForSelector("form input, form textarea, form select", { timeout: 15_000 });

    for (const [name, rawValue] of Object.entries(args.values)) {
      const selector = `[name="${cssEscape(name)}"]`;
      attemptedSelectors.push(selector);
      const locator = page.locator(selector);
      const count = await locator.count();

      if (count === 0) {
        missingNames.push(name);
        continue;
      }

      const first = locator.first();
      const tagName = await first.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
      const inputType =
        tagName === "input"
          ? await first.evaluate((el) => (el as HTMLInputElement).type?.toLowerCase() || "text").catch(() => "text")
          : "";

      if (tagName === "select") {
        const value = Array.isArray(rawValue) ? rawValue[0] ?? "" : rawValue;
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
          const labelText = (await checkbox.evaluate((el) => {
            const input = el as HTMLInputElement;
            const id = input.id;
            if (id) {
              const explicit = document.querySelector(`label[for="${id}"]`);
              if (explicit?.textContent) return explicit.textContent;
            }
            return input.closest("label")?.textContent ?? "";
          }))
            .toLowerCase()
            .trim();

          const shouldCheck = values.some((target) => {
            const normalized = target.toLowerCase().trim();
            if (elementValue && elementValue.toLowerCase() === normalized) return true;
            return Boolean(labelText) && labelText.includes(normalized);
          });

          if (shouldCheck) {
            await checkbox.check().catch(() => undefined);
          }
        }
        continue;
      }

      if (inputType === "radio") {
        const value = Array.isArray(rawValue) ? rawValue[0] ?? "" : rawValue;
        const option = page.locator(`${selector}[value="${cssEscape(String(value))}"]`).first();
        if ((await option.count()) > 0) {
          await option.check().catch(() => option.click());
        }
        continue;
      }

      if (inputType === "file") {
        if (args.resumePath) {
          await first.setInputFiles(args.resumePath);
        }
        continue;
      }

      const value = Array.isArray(rawValue) ? rawValue[0] ?? "" : rawValue;
      await first.fill(String(value ?? ""));
    }

    if (args.resumePath) {
      const fileInput = page.locator('input[type="file"]:visible').first();
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles(args.resumePath);
        console.log("[REMOTE_APPLY] resume uploaded", args.resumePath);
      }
    }

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
      console.log("[REMOTE_APPLY] clicking submit", submitSelector);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null),
        button.click(),
      ]);
      break;
    }

    if (!submitUsed) {
      const finalUrl = page.url();
      return {
        ok: false,
        message: "Submit button not found.",
        debug: {
          attemptedSelectors,
          missingNames,
          finalUrl,
          submitSelectorUsed: null,
          verificationSignals: [],
          pageText: "",
          pageHtml: await page.content().catch(() => ""),
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          success: false,
          needsHuman: false,
        },
      };
    }

    await page.waitForTimeout(1500);

    const finalUrl = page.url();
    const html = await page.content();
    const pageText = await page.innerText("body").catch(() => "");
    const verificationSignals = [
      ...new Set([...containsSignal(html, verificationChecks), ...containsSignal(pageText, verificationChecks)]),
    ];
    const success =
      finalUrl.toLowerCase().includes("/confirmation") ||
      /thank you|application submitted/i.test(html) ||
      /thank you|application submitted/i.test(pageText);
    const needsHuman = verificationSignals.length > 0;

    console.log("[REMOTE_APPLY] final url", finalUrl);

    if (needsHuman) {
      keepRemoteAlive = true;
    }

    return {
      ok: success,
      finalUrl,
      needsHuman,
      message: success ? undefined : needsHuman ? "Human verification required" : "Submission could not be confirmed.",
      debug: {
        attemptedSelectors,
        missingNames,
        finalUrl,
        submitSelectorUsed: submitUsed,
        verificationSignals,
        pageText,
        pageHtml: html,
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        success,
        needsHuman,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Playwright submit failed.";
    console.log("[REMOTE_APPLY] error", message);

    return {
      ok: false,
      message,
      debug: {
        attemptedSelectors,
        missingNames,
        submitSelectorUsed: null,
        verificationSignals: [],
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        success: false,
        needsHuman: false,
      },
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);

    if (remoteSession && !keepRemoteAlive) {
      await closeRemoteSession(remoteSession.sessionId).catch(() => undefined);
    }
  }
}
