import { chromium } from "playwright";
import { cssEscape } from "@/app/lib/apply/cssEscape";

export type PlaywrightApplyResult = {
  ok: boolean;
  finalUrl?: string;
  needsHuman?: boolean;
  message?: string;
  debug?: {
    attemptedSelectors: string[];
    missingNames: string[];
    finalUrl?: string;
    success: boolean;
    needsHuman: boolean;
  };
};

type AnswerValue = string | string[];

function asArray(value: AnswerValue) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [String(value ?? "")];
}

function lowerIncludesAny(text: string, checks: string[]) {
  const lower = text.toLowerCase();
  return checks.some((check) => lower.includes(check));
}

export async function applyWithPlaywright(args: {
  jobUrl: string;
  values: Record<string, string | string[]>;
  resumePath?: string | null;
}): Promise<PlaywrightApplyResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const attemptedSelectors: string[] = [];
  const missingNames: string[] = [];

  try {
    console.log("[PW_APPLY] goto", args.jobUrl);
    await page.goto(args.jobUrl, { waitUntil: "domcontentloaded" });
    console.log("[PW_APPLY] landed", page.url());

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
        console.log("[PW_APPLY] resume uploaded", args.resumePath);
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
      console.log("[PW_APPLY] clicking submit", submitSelector);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null),
        button.click(),
      ]);
      break;
    }

    if (!submitUsed) {
      return {
        ok: false,
        message: "Submit button not found.",
        debug: {
          attemptedSelectors,
          missingNames,
          finalUrl: page.url(),
          success: false,
          needsHuman: false,
        },
      };
    }

    await page.waitForTimeout(1500);

    const finalUrl = page.url();
    const html = (await page.content()).toLowerCase();
    const success = finalUrl.toLowerCase().includes("/confirmation") || lowerIncludesAny(html, ["thank you", "application submitted"]);
    const needsHuman = lowerIncludesAny(html, [
      "verify you are human",
      "captcha",
      "turnstile",
      "cloudflare",
      "security check",
    ]);

    console.log("[PW_APPLY] final url", finalUrl);
    if (needsHuman) {
      console.log("[PW_APPLY] bot-check detected");
    }

    return {
      ok: success,
      finalUrl,
      needsHuman,
      message: success ? undefined : needsHuman ? "Human verification required." : "Submission could not be confirmed.",
      debug: {
        attemptedSelectors,
        missingNames,
        finalUrl,
        success,
        needsHuman,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Playwright submit failed.";
    console.log("[PW_APPLY] error", message);

    return {
      ok: false,
      message,
      debug: {
        attemptedSelectors,
        missingNames,
        finalUrl: page.url(),
        success: false,
        needsHuman: false,
      },
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
