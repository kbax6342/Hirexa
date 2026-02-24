import { chromium } from "playwright";

export type AuditItem = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  reason: string;
  options?: string[];
};

export async function runAuditMode(jobUrl: string): Promise<{ action?: string; method?: string; auditItems: AuditItem[] }> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    const result = await page.evaluate(() => {
      const form = document.querySelector("form");
      const controls = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input, select, textarea",
        ),
      );

      const items = controls
        .map((node) => {
          const el = node as HTMLInputElement;
          const labelEl =
            (el.id && document.querySelector(`label[for=\"${el.id.replace(/\"/g, "")}\"]`)) ||
            el.closest("label");

          const options = node instanceof HTMLSelectElement
            ? Array.from(node.options)
                .map((opt) => opt.textContent?.trim() ?? "")
                .filter(Boolean)
            : undefined;

          const name = el.name || el.id || el.getAttribute("aria-label") || el.placeholder || "unknown";

          return {
            name,
            label: (labelEl?.textContent || el.getAttribute("aria-label") || el.placeholder || name).trim(),
            type: node instanceof HTMLSelectElement ? "select" : el.type || el.tagName.toLowerCase(),
            required: el.required || el.getAttribute("aria-required") === "true",
            reason: "Detected from live form control",
            options,
          };
        })
        .filter((item) => item.name !== "unknown");

      return {
        action: form?.getAttribute("action") ?? undefined,
        method: form?.getAttribute("method") ?? "post",
        auditItems: items,
      };
    });

    return result;
  } finally {
    await page.close();
    await browser.close();
  }
}
