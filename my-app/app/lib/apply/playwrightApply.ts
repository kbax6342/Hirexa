// Install: npm i playwright
// Install browser: npx playwright install chromium

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

export type ApplyResult = {
  ok: boolean;
  finalUrl?: string;
  reason?: string;
  screenshotPath?: string;
  htmlSnippet?: string;
};

type AnswerValue = string | string[];
type AnswersMap = Record<string, AnswerValue>;

type FillCandidate = {
  tag: "input" | "textarea" | "select";
  type: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  labelText: string;
  key: string;
};

const SUCCESS_URL_RE = /\/(confirmation|thank|submitted)/i;
const SUCCESS_TEXT_RE = /thank you|application submitted|we have received/i;
const CAPTCHA_RE = /captcha|turnstile|cloudflare/i;

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function flattenText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function pickBestAnswer(answers: AnswersMap, candidate: FillCandidate): { key: string; value: AnswerValue } | null {
  const fields = [candidate.name, candidate.id, candidate.labelText, candidate.placeholder, candidate.ariaLabel, candidate.key]
    .map((v) => normalizeText(v))
    .filter(Boolean);

  for (const [answerKey, answerValue] of Object.entries(answers)) {
    const normalizedKey = normalizeText(answerKey);
    if (!normalizedKey) continue;
    if (fields.some((field) => field === normalizedKey || field.includes(normalizedKey) || normalizedKey.includes(field))) {
      return { key: answerKey, value: answerValue };
    }
  }

  return null;
}

function resolveTmpDir() {
  const cwd = process.cwd();
  if (cwd.endsWith(`${path.sep}my-app`) || cwd === "my-app") return path.join(cwd, ".tmp");
  return path.join(cwd, "my-app", ".tmp");
}

function toBooleanAnswer(value: AnswerValue) {
  if (Array.isArray(value)) {
    return value.some((item) => /^(true|yes|y|1|on|checked)$/i.test(String(item).trim()));
  }
  return /^(true|yes|y|1|on|checked)$/i.test(String(value).trim());
}

export async function applyWithPlaywright(args: {
  jobUrl: string;
  answers: AnswersMap;
  resume?: { fileName: string; mimeType: string; buffer: Buffer };
  timeoutMs?: number;
}): Promise<ApplyResult> {
  const timeoutMs = args.timeoutMs ?? 90_000;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(Math.min(timeoutMs, 20_000));

  let screenshotPath: string | undefined;
  let resumeTempPath: string | undefined;

  try {
    console.info("[apply:pw] opening job URL", { jobUrl: args.jobUrl, timeoutMs, answerKeys: Object.keys(args.answers).length });

    await page.goto(args.jobUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

    const bodyText = flattenText(await page.locator("body").innerText().catch(() => ""));
    if (CAPTCHA_RE.test(bodyText)) {
      console.info("[apply:pw] captcha detected before fill");
      return {
        ok: false,
        finalUrl: page.url(),
        reason: "Captcha detected",
        htmlSnippet: bodyText.slice(0, 300),
      };
    }

    const candidates = await page.evaluate(() => {
      function text(v: string | null | undefined) {
        return (v ?? "").replace(/\s+/g, " ").trim();
      }

      const all = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])"
        )
      );

      return all.map((el) => {
        const tag = el.tagName.toLowerCase() as "input" | "textarea" | "select";
        const type = tag === "input" ? (el.getAttribute("type") ?? "text").toLowerCase() : tag;
        const id = text(el.id);
        const name = text(el.getAttribute("name"));
        const placeholder = text(el.getAttribute("placeholder"));
        const ariaLabel = text(el.getAttribute("aria-label"));

        let labelText = "";
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          labelText = text(label?.textContent ?? "");
        }
        if (!labelText) {
          const closestLabel = el.closest("label");
          labelText = text(closestLabel?.textContent ?? "");
        }

        const key = text([name, id, labelText, placeholder, ariaLabel].filter(Boolean).join(" "));

        return { tag, type, name, id, placeholder, ariaLabel, labelText, key };
      });
    });

    console.info("[apply:pw] field candidates", { count: candidates.length });

    for (const candidate of candidates as FillCandidate[]) {
      const match = pickBestAnswer(args.answers, candidate);
      if (!match) continue;

      let locator = page.locator("__never__");
      if (candidate.id) {
        locator = page.locator(`#${candidate.id}`).first();
      } else if (candidate.name) {
        locator = page.locator(`[name="${candidate.name}"]`).first();
      }

      if ((await locator.count()) === 0) continue;
      if (!(await locator.isVisible().catch(() => false))) continue;

      const raw = match.value;
      const textValue = Array.isArray(raw) ? raw[0] ?? "" : String(raw ?? "");

      try {
        if (candidate.tag === "textarea") {
          await locator.fill(textValue);
        } else if (candidate.tag === "select") {
          const selected = Array.isArray(raw) ? raw.map((v) => String(v)) : [String(raw)];
          await locator.selectOption(selected.map((v) => ({ value: v })));
        } else if (candidate.type === "checkbox") {
          if (toBooleanAnswer(raw) || (Array.isArray(raw) && raw.length > 0)) {
            await locator.check().catch(() => undefined);
          }
        } else if (candidate.type === "radio") {
          await locator.check().catch(() => undefined);
        } else if (["email", "tel", "url", "text", "number", "date", "search"].includes(candidate.type)) {
          await locator.fill(textValue);
        }

        console.info("[apply:pw] filled field", { field: candidate.key, answerKey: match.key });
      } catch (error) {
        try {
          if (candidate.tag === "select") {
            const selected = Array.isArray(raw) ? raw.map((v) => ({ label: String(v) })) : [{ label: String(raw) }];
            await locator.selectOption(selected);
            console.info("[apply:pw] selected by label fallback", { field: candidate.key, answerKey: match.key });
            continue;
          }
        } catch {
          // no-op, handled by log below
        }

        console.info("[apply:pw] field fill skipped", {
          candidate: candidate.key,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (args.resume) {
      const fileInput = page.locator('input[type="file"]').first();
      if ((await fileInput.count()) > 0) {
        const tmpDir = resolveTmpDir();
        await mkdir(tmpDir, { recursive: true });
        resumeTempPath = path.join(tmpDir, `resume-upload-${Date.now()}.pdf`);
        await writeFile(resumeTempPath, args.resume.buffer);

        await fileInput.setInputFiles(resumeTempPath);
        console.info("[apply:pw] resume uploaded", { path: resumeTempPath });
      }
    }

    const beforeSubmitUrl = page.url();
    const submitButton = page.getByRole("button", { name: /submit application|submit|apply|send application|finish/i }).first();
    if ((await submitButton.count()) > 0) {
      await submitButton.click({ timeout: 10_000 });
      console.info("[apply:pw] clicked button submit");
    } else {
      const submitInput = page.locator('input[type="submit"]').first();
      if ((await submitInput.count()) > 0) {
        await submitInput.click({ timeout: 10_000 });
        console.info("[apply:pw] clicked input submit");
      } else {
        return {
          ok: false,
          finalUrl: page.url(),
          reason: "Submit button not found",
        };
      }
    }

    await Promise.race([
      page.waitForURL((url) => url.toString() !== beforeSubmitUrl, { timeout: 12_000 }),
      page.waitForLoadState("domcontentloaded", { timeout: 12_000 }),
      page.waitForSelector("text=/thank you|application submitted|we have received/i", { timeout: 12_000 }),
    ]).catch(() => undefined);

    await page.waitForTimeout(1_000);

    const finalUrl = page.url();
    const finalText = flattenText(await page.locator("body").innerText().catch(() => ""));

    if (SUCCESS_URL_RE.test(finalUrl) || SUCCESS_TEXT_RE.test(finalText)) {
      console.info("[apply:pw] submission confirmed", { finalUrl });
      return { ok: true, finalUrl };
    }

    const tmpDir = resolveTmpDir();
    await mkdir(tmpDir, { recursive: true });
    const fileName = `apply-fail-${Date.now()}.png`;
    screenshotPath = path.join("my-app", ".tmp", fileName);
    await page.screenshot({ path: path.join(tmpDir, fileName), fullPage: true });

    return {
      ok: false,
      finalUrl,
      reason: CAPTCHA_RE.test(finalText) ? "Captcha detected" : "Submission was not confirmed",
      screenshotPath,
      htmlSnippet: finalText.slice(0, 500),
    };
  } catch (error) {
    const finalUrl = page.url();
    const tmpDir = resolveTmpDir();
    await mkdir(tmpDir, { recursive: true });
    const fileName = `apply-fail-${Date.now()}.png`;
    screenshotPath = path.join("my-app", ".tmp", fileName);
    await page.screenshot({ path: path.join(tmpDir, fileName), fullPage: true }).catch(() => undefined);

    return {
      ok: false,
      finalUrl,
      reason: error instanceof Error ? error.message : "Playwright apply failed",
      screenshotPath,
    };
  } finally {
    if (resumeTempPath) {
      await unlink(resumeTempPath).catch(() => undefined);
    }
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
