import { chromium } from "playwright";

type ApplyArgs = {
  jobUrl: string;
  values: Record<string, unknown>;
  resumePath?: string | null;
};

export type ApplyResult =
  | { ok: true; submissionProof: { url: string; timestamp: string; confirmationText?: string } }
  | { ok: false; verificationRequired: true; reason: string }
  | { ok: false; verificationRequired: false; reason: string };

const fieldAliases: Record<string, string[]> = {
  firstName: ["first", "first_name", "given name"],
  lastName: ["last", "last_name", "family name", "surname"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile"],
  address: ["address", "street"],
  city: ["city", "town"],
  state: ["state", "province"],
  postalCode: ["zip", "postal", "postcode"],
  linkedin: ["linkedin"],
  website: ["website", "portfolio", "url"],
};

function hasVerificationSignals(title: string, html: string) {
  const lowerTitle = title.toLowerCase();
  const lowerHtml = html.toLowerCase();
  return (
    lowerHtml.includes("recaptcha") ||
    lowerHtml.includes("turnstile") ||
    lowerHtml.includes("cf-challenge") ||
    lowerTitle.includes("just a moment")
  );
}

export async function runApplyMode(args: ApplyArgs): Promise<ApplyResult> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(args.jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    const html = await page.content();
    const title = await page.title();

    if (hasVerificationSignals(title, html)) {
      return { ok: false, verificationRequired: true, reason: "Verification required" };
    }

    for (const [key, value] of Object.entries(args.values)) {
      const text = String(value ?? "").trim();
      if (!text) continue;

      const aliases = fieldAliases[key] ?? [key];

      for (const alias of aliases) {
        const selector = [
          `input[name*='${alias}' i]`,
          `input[id*='${alias}' i]`,
          `textarea[name*='${alias}' i]`,
          `select[name*='${alias}' i]`,
          `[aria-label*='${alias}' i]`,
          `[placeholder*='${alias}' i]`,
        ].join(",");

        const control = page.locator(selector).first();
        if ((await control.count()) === 0) continue;

        const tagName = await control.evaluate((node) => node.tagName.toLowerCase());
        if (tagName === "select") {
          await control.selectOption({ label: text }).catch(async () => {
            await control.selectOption({ value: text }).catch(() => undefined);
          });
        } else {
          await control.fill(text).catch(() => undefined);
        }
        break;
      }
    }

    if (args.resumePath) {
      const fileInput = page.locator("input[type='file']").first();
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles(args.resumePath).catch(() => undefined);
      }
    }

    const submit = page
      .locator("button[type='submit'], input[type='submit'], button:has-text('Apply'), button:has-text('Submit'), button:has-text('Continue'), button:has-text('Next')")
      .first();

    if ((await submit.count()) === 0) {
      return { ok: false, verificationRequired: false, reason: "Submit button not found" };
    }

    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => undefined),
      submit.click().catch(() => undefined),
    ]);

    const finalUrl = page.url();
    const bodyText = (await page.textContent("body")) ?? "";
    const successText = /thank you|application submitted|confirmation/i.exec(bodyText)?.[0];

    if (finalUrl.toLowerCase().includes("thank") || finalUrl.toLowerCase().includes("confirmation") || successText) {
      return {
        ok: true,
        submissionProof: {
          url: finalUrl,
          timestamp: new Date().toISOString(),
          confirmationText: successText ?? undefined,
        },
      };
    }

    return { ok: false, verificationRequired: false, reason: "Submission could not be confirmed" };
  } catch (error: unknown) {
    return {
      ok: false,
      verificationRequired: false,
      reason: error instanceof Error ? error.message : "Apply failed",
    };
  } finally {
    await page.close();
    await browser.close();
  }
}
