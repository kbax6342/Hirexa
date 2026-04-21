import type { Locator, Page } from "playwright-core";
import { cssEscape } from "@/app/lib/apply/cssEscape";

const FIELD_ALIASES: Record<string, string[]> = {
  firstName: ["first name", "first_name", "firstname", "given name"],
  lastName: ["last name", "last_name", "lastname", "family name", "surname"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "phone number", "telephone"],
  address: ["address", "street", "street address"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  postalCode: ["zip", "zip code", "postal", "postcode", "postal code"],
  linkedin: ["linkedin", "linkedin url"],
  website: ["website", "portfolio", "personal site", "url"],
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFieldAliases(name: string) {
  const normalized = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return [...new Set([name, normalized, ...(FIELD_ALIASES[name] ?? [])])];
}

async function pickPreferredFieldLocator(args: {
  locator: Locator;
  allowChoiceControls: boolean;
}) {
  const count = await args.locator.count().catch(() => 0);
  const max = Math.min(count, 12);

  for (let index = 0; index < max; index += 1) {
    const candidate = args.locator.nth(index);
    const verdict = await candidate
      .evaluate((element, options) => {
        if (!(element instanceof HTMLElement)) {
          return { usable: false };
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          return { usable: false };
        }

        if (
          element.hasAttribute("disabled") ||
          element.getAttribute("aria-disabled") === "true"
        ) {
          return { usable: false };
        }

        if (element.closest("header, nav, footer, [role='navigation']")) {
          return { usable: false };
        }

        const cookieContainer = element.closest(
          '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [aria-label*="cookie"], [aria-label*="consent"], [data-testid*="cookie"], [data-testid*="consent"]',
        );
        if (cookieContainer) {
          const contextText = (cookieContainer.textContent ?? "").toLowerCase();
          if (
            contextText.includes("cookie") ||
            contextText.includes("consent") ||
            contextText.includes("privacy") ||
            contextText.includes("preferences")
          ) {
            return { usable: false };
          }
        }

        if (element instanceof HTMLInputElement) {
          const type = (element.type || "text").toLowerCase();
          if (
            type === "hidden" ||
            type === "submit" ||
            type === "button" ||
            type === "reset" ||
            type === "image"
          ) {
            return { usable: false };
          }

          if (
            (type === "checkbox" || type === "radio") &&
            options.allowChoiceControls !== true
          ) {
            return { usable: false };
          }
        }

        return { usable: true };
      }, { allowChoiceControls: args.allowChoiceControls })
      .catch(() => ({ usable: false }));

    if (verdict.usable) {
      return candidate;
    }
  }

  return null;
}

export async function extractLocatorText(locator: Locator) {
  return locator
    .evaluate((element) => {
      if (
        element instanceof HTMLInputElement &&
        (element.type === "submit" || element.type === "button")
      ) {
        return element.value ?? "";
      }

      return (
        element.textContent ??
        element.getAttribute("aria-label") ??
        element.getAttribute("title") ??
        ""
      );
    })
    .catch(() => "");
}

export async function findMatchingLocator(
  page: Page,
  name: string,
  attemptedSelectors: string[],
  options?: {
    allowChoiceControls?: boolean;
  },
): Promise<Locator | null> {
  const allowChoiceControls = options?.allowChoiceControls === true;
  const exactSelector = `[name="${cssEscape(name)}"]`;
  attemptedSelectors.push(exactSelector);

  const exactLocator = page.locator(exactSelector).first();
  if ((await exactLocator.count()) > 0) {
    if (allowChoiceControls) return page.locator(exactSelector);
    const preferred = await pickPreferredFieldLocator({
      locator: page.locator(exactSelector),
      allowChoiceControls,
    });
    if (preferred) return preferred;
  }

  for (const alias of normalizeFieldAliases(name)) {
    const trimmedAlias = alias.trim();
    if (!trimmedAlias) continue;

    const labelPattern = new RegExp(escapeRegex(trimmedAlias), "i");
    attemptedSelectors.push(`label:${trimmedAlias}`);
    const labelLocator = page.getByLabel(labelPattern);
    if ((await labelLocator.count()) > 0) {
      if (allowChoiceControls) return labelLocator;
      const preferred = await pickPreferredFieldLocator({
        locator: labelLocator,
        allowChoiceControls,
      });
      if (preferred) return preferred;
    }

    attemptedSelectors.push(`placeholder:${trimmedAlias}`);
    const placeholderLocator = page.getByPlaceholder(labelPattern);
    if ((await placeholderLocator.count()) > 0) {
      const preferred = await pickPreferredFieldLocator({
        locator: placeholderLocator,
        allowChoiceControls,
      });
      if (preferred) return preferred;
    }

    attemptedSelectors.push(`role:textbox:${trimmedAlias}`);
    const roleTextboxLocator = page.getByRole("textbox", {
      name: labelPattern,
    });
    if ((await roleTextboxLocator.count()) > 0) {
      const preferred = await pickPreferredFieldLocator({
        locator: roleTextboxLocator,
        allowChoiceControls,
      });
      if (preferred) return preferred;
    }

    attemptedSelectors.push(`role:combobox:${trimmedAlias}`);
    const roleComboLocator = page.getByRole("combobox", {
      name: labelPattern,
    });
    if ((await roleComboLocator.count()) > 0) {
      const preferred = await pickPreferredFieldLocator({
        locator: roleComboLocator,
        allowChoiceControls,
      });
      if (preferred) return preferred;
    }

    const fuzzySelector = [
      `input[name*="${cssEscape(trimmedAlias)}" i]`,
      `textarea[name*="${cssEscape(trimmedAlias)}" i]`,
      `select[name*="${cssEscape(trimmedAlias)}" i]`,
      `input[id*="${cssEscape(trimmedAlias)}" i]`,
      `textarea[id*="${cssEscape(trimmedAlias)}" i]`,
      `select[id*="${cssEscape(trimmedAlias)}" i]`,
      `input[placeholder*="${cssEscape(trimmedAlias)}" i]`,
      `textarea[placeholder*="${cssEscape(trimmedAlias)}" i]`,
      `input[aria-label*="${cssEscape(trimmedAlias)}" i]`,
      `textarea[aria-label*="${cssEscape(trimmedAlias)}" i]`,
      `select[aria-label*="${cssEscape(trimmedAlias)}" i]`,
    ].join(", ");

    attemptedSelectors.push(fuzzySelector);
    const fuzzyLocator = page.locator(fuzzySelector);
    if ((await fuzzyLocator.count()) > 0) {
      if (allowChoiceControls) return fuzzyLocator;
      const preferred = await pickPreferredFieldLocator({
        locator: fuzzyLocator,
        allowChoiceControls,
      });
      if (preferred) return preferred;
    }
  }

  return null;
}
