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
): Promise<Locator | null> {
  const exactSelector = `[name="${cssEscape(name)}"]`;
  attemptedSelectors.push(exactSelector);

  const exactLocator = page.locator(exactSelector).first();
  if ((await exactLocator.count()) > 0) {
    return exactLocator;
  }

  for (const alias of normalizeFieldAliases(name)) {
    const trimmedAlias = alias.trim();
    if (!trimmedAlias) continue;

    const labelPattern = new RegExp(escapeRegex(trimmedAlias), "i");
    attemptedSelectors.push(`label:${trimmedAlias}`);
    const labelLocator = page.getByLabel(labelPattern).first();
    if ((await labelLocator.count()) > 0) {
      return labelLocator;
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
    const fuzzyLocator = page.locator(fuzzySelector).first();
    if ((await fuzzyLocator.count()) > 0) {
      return fuzzyLocator;
    }
  }

  return null;
}
