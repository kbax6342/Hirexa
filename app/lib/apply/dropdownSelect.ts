import type { Locator, Page } from "playwright-core";
import type { FormFieldDescriptor } from "@/app/lib/apply/formIntelligence/types";

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeOptionText(value: unknown) {
  return text(value)
    .replace(/\*/g, "")
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGenericDropdownOption(value: string | null | undefined, desiredValue: string) {
  const normalized = normalizeOptionText(value);
  const desired = normalizeOptionText(desiredValue);
  if (!normalized) return true;
  if (["select", "search", "choose", "please select", "type to search", "start typing"].includes(normalized)) {
    return true;
  }
  if ((normalized === "none" || normalized === "n a" || normalized === "na") && desired !== normalized) {
    return true;
  }
  return false;
}

function combinedFieldText(field: FormFieldDescriptor) {
  return [
    field.label,
    field.inferredLabel,
    field.name,
    field.idAttribute,
    field.ariaLabel,
    field.ariaLabelledByText,
    field.ariaDescribedByText,
    field.placeholder,
    field.parentGroupText,
    field.nearbyText,
    field.selector,
  ]
    .filter(Boolean)
    .join(" ");
}

function isGenericChoicePlaceholder(value: string | null | undefined) {
  return /^(select|select\.\.\.|search|type to search|choose|choose\.\.\.|please select|start typing)$/i.test(
    text(value),
  );
}

export function isDropdownLikeField(field: FormFieldDescriptor) {
  if (field.inputType === "select") return true;
  const textBlob = combinedFieldText(field);
  return (
    field.roleAttribute === "combobox" ||
    isGenericChoicePlaceholder(field.placeholder) ||
    /\b(react-select|listbox|combobox|aria-haspopup|select a country|country-error|country-placeholder)\b/i.test(
      textBlob,
    ) ||
    (field.required &&
      /\b(select|search|dropdown|country|location|located|hear about|source|referral|phone country)\b/i.test(
        textBlob,
      ) &&
      /select|search|choose/i.test(field.placeholder ?? ""))
  );
}

function locatorForField(page: Page, field: FormFieldDescriptor) {
  const frame = field.frameUrl
    ? page.frames().find((candidate) => candidate.url() === field.frameUrl)
    : null;
  return (frame ?? page).locator(field.selector).first();
}

async function readElementValue(locator: Locator) {
  return locator
    .evaluate((element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value ?? "";
      }
      if (element instanceof HTMLSelectElement) return element.value ?? "";
      if (element instanceof HTMLElement && element.isContentEditable) {
        return element.innerText?.trim() || element.textContent?.trim() || "";
      }
      if (element instanceof HTMLElement) return element.textContent?.trim() || "";
      return "";
    })
    .catch(() => "");
}

async function readContainerText(locator: Locator) {
  return locator
    .evaluate((element) => {
      if (!(element instanceof HTMLElement)) return "";
      const container = element.closest(
        "li, fieldset, .field, .form-field, .question, .application-question, [class*='field' i], [class*='question' i], [data-qa], [data-testid], div",
      );
      return (container?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    })
    .catch(() => "");
}

async function readAriaInvalid(locator: Locator) {
  return locator
    .evaluate((element) => element.getAttribute("aria-invalid") === "true")
    .catch(() => false);
}

export async function readDropdownValueState(page: Page, field: FormFieldDescriptor) {
  const locator = locatorForField(page, field);
  const value = text(await readElementValue(locator));
  const visibleText = text(await readContainerText(locator));
  const ariaInvalid = await readAriaInvalid(locator);
  const onlyShowsPlaceholder = /\b(select\.\.\.|search|type to search|please select)\s*$/i.test(
    visibleText,
  );
  return {
    value,
    visibleText,
    ariaInvalid,
    hasValue: Boolean(value) || (Boolean(visibleText) && !onlyShowsPlaceholder && !ariaInvalid),
  };
}

function answerCandidates(field: FormFieldDescriptor, desiredValue: string) {
  const candidates = [desiredValue];
  const textBlob = combinedFieldText(field).toLowerCase();
  if (/phone.*country|country.*code/.test(textBlob)) {
    candidates.unshift("United States +1");
    candidates.push("+1", "US +1", "United States");
  } else if (/country/.test(textBlob)) {
    candidates.unshift("United States");
    candidates.push("United States of America", "USA", "US");
  } else if (/location|located|city|state/.test(textBlob)) {
    candidates.push("United States", desiredValue.replace(/,\s*United States$/i, ""));
  } else if (/hear about|source|referr/.test(textBlob)) {
    candidates.unshift("Job board");
    candidates.push("Other", "Hirexa AI", "LinkedIn");
  }
  return Array.from(new Set(candidates.map(text).filter(Boolean)));
}

type CandidateOption = {
  label: string;
  value: string;
  index: number;
};

export type SelectDropdownValueResult = {
  success: boolean;
  selectedText: string;
  selectedValue: string;
  valueBefore: string;
  valueAfter: string;
  failureReason: string;
};

function bestNativeOption(options: CandidateOption[], desiredValue: string) {
  const desired = normalizeOptionText(desiredValue);
  const usable = options.filter((option) => !isGenericDropdownOption(option.label || option.value, desiredValue));
  return (
    usable.find((option) => normalizeOptionText(option.label) === desired || normalizeOptionText(option.value) === desired) ??
    usable.find((option) => normalizeOptionText(option.label).startsWith(desired)) ??
    usable.find((option) => normalizeOptionText(option.label).includes(desired)) ??
    usable.find((option) => desired.includes(normalizeOptionText(option.label))) ??
    usable[0] ??
    null
  );
}

async function nativeSelectOptions(locator: Locator) {
  return locator
    .evaluate((element) => {
      if (!(element instanceof HTMLSelectElement)) return [];
      return Array.from(element.options).map((option, index) => ({
        label: (option.textContent ?? "").replace(/\s+/g, " ").trim(),
        value: option.value,
        index,
      }));
    })
    .catch(() => [] as CandidateOption[]);
}

async function isNativeSelect(locator: Locator, field: FormFieldDescriptor) {
  if (field.inputType === "select" || field.tagName?.toLowerCase() === "select") return true;
  return locator
    .evaluate((element) => element instanceof HTMLSelectElement)
    .catch(() => false);
}

async function visibleOptions(page: Page, field: FormFieldDescriptor) {
  const frame = field.frameUrl
    ? page.frames().find((candidate) => candidate.url() === field.frameUrl)
    : null;
  const context = frame ?? page;
  const locators = context.locator(
    "[role='option'], [role='menuitem'], [id*='react-select'][id*='option'], li, [data-testid*='option']",
  );
  const count = Math.min(await locators.count().catch(() => 0), 50);
  const options: Array<{ label: string; index: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const option = locators.nth(index);
    if (!(await option.isVisible().catch(() => false))) continue;
    const label = text(await option.textContent().catch(() => ""));
    if (label) options.push({ label, index });
  }
  return { context, locators, options };
}

function bestVisibleOption(
  options: Array<{ label: string; index: number }>,
  desiredValue: string,
) {
  const desired = normalizeOptionText(desiredValue);
  const usable = options.filter((option) => !isGenericDropdownOption(option.label, desiredValue));
  return (
    usable.find((option) => normalizeOptionText(option.label) === desired) ??
    usable.find((option) => normalizeOptionText(option.label).startsWith(desired)) ??
    usable.find((option) => normalizeOptionText(option.label).includes(desired)) ??
    usable.find((option) => desired.includes(normalizeOptionText(option.label))) ??
    usable[0] ??
    null
  );
}

export async function selectDropdownValue(
  page: Page,
  field: FormFieldDescriptor,
  desiredValue: string,
  options?: {
    applicationId?: string | null;
    sessionId?: string | null;
    retry?: boolean;
  },
): Promise<SelectDropdownValueResult> {
  const locator = locatorForField(page, field);
  const native = await isNativeSelect(locator, field);
  const isCombobox = field.roleAttribute === "combobox";
  const valueBefore = text(await readElementValue(locator));
  const desiredCandidates = answerCandidates(field, desiredValue);
  const nativeOptions = native ? await nativeSelectOptions(locator) : [];

  console.log("[AI_FORM_DROPDOWN_SELECT_ATTEMPT]", {
    applicationId: options?.applicationId ?? null,
    sessionId: options?.sessionId ?? null,
    label: field.label,
    desiredValue,
    fieldType: field.inputType,
    isNativeSelect: native,
    isCombobox,
    placeholder: field.placeholder ?? null,
    optionCount: nativeOptions.length,
  });

  if (nativeOptions.length > 0) {
    console.log("[AI_FORM_DROPDOWN_OPTIONS]", {
      applicationId: options?.applicationId ?? null,
      sessionId: options?.sessionId ?? null,
      label: field.label,
      options: nativeOptions.map((option) => option.label).filter(Boolean).slice(0, 30),
    });
  }

  let selectedText = "";
  let selectedValue = "";
  let success = false;
  let failureReason = "";

  if (native) {
    for (const candidate of desiredCandidates) {
      const option = bestNativeOption(nativeOptions, candidate);
      if (!option) continue;
      selectedText = option.label;
      selectedValue = option.value || option.label;
      const selected = await locator
        .selectOption({ value: option.value })
        .catch(() => locator.selectOption({ label: option.label }))
        .catch(() => locator.selectOption({ index: option.index }));
      await locator
        .evaluate((element) => {
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          if (element instanceof HTMLElement) element.blur();
        })
        .catch(() => undefined);
      success = selected.length > 0;
      if (success) break;
    }
  } else {
    for (const candidate of desiredCandidates) {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await locator.click({ timeout: 3000 }).catch(async () => {
        await locator.focus();
      });
      await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
      await locator.press("Backspace").catch(() => undefined);
      await locator.fill(candidate, { timeout: 3000 }).catch(async () => {
        await locator.type(candidate, { delay: 20 });
      });
      await page.waitForTimeout(350);

      const { locators, options: listOptions } = await visibleOptions(page, field);
      if (listOptions.length > 0) {
        console.log("[AI_FORM_DROPDOWN_OPTIONS]", {
          applicationId: options?.applicationId ?? null,
          sessionId: options?.sessionId ?? null,
          label: field.label,
          options: listOptions.map((option) => option.label).slice(0, 30),
        });
      }

      let best = bestVisibleOption(listOptions, candidate);
      if (!best) {
        const exactOption = (field.frameUrl
          ? page.frames().find((frame) => frame.url() === field.frameUrl) ?? page
          : page
        )
          .getByRole("option", { name: new RegExp(`^\\s*${escapeRegExp(candidate)}\\s*$`, "i") })
          .first();
        if ((await exactOption.count().catch(() => 0)) > 0 && (await exactOption.isVisible().catch(() => false))) {
          best = { label: text(await exactOption.textContent().catch(() => candidate)) || candidate, index: -1 };
          await exactOption.click({ timeout: 3000 });
        }
      }

      if (best && best.index >= 0) {
        selectedText = best.label;
        selectedValue = best.label;
        await locators.nth(best.index).click({ timeout: 3000 });
      } else if (best) {
        selectedText = best.label;
        selectedValue = best.label;
      } else if (!best) {
        await locator.press("ArrowDown").catch(() => undefined);
        await locator.press("Enter").catch(() => undefined);
        selectedText = candidate;
        selectedValue = candidate;
      }

      await locator
        .evaluate((element) => {
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          if (element instanceof HTMLElement) element.blur();
        })
        .catch(() => undefined);
      await page.waitForTimeout(150);

      const state = await readDropdownValueState(page, field);
      success =
        state.hasValue ||
        new RegExp(escapeRegExp(selectedText || candidate), "i").test(state.visibleText) ||
        new RegExp(escapeRegExp(candidate), "i").test(state.visibleText);
      if (success) break;
    }
  }

  const stateAfter = await readDropdownValueState(page, field);
  const valueAfter = stateAfter.value || stateAfter.visibleText;
  if (!success && !options?.retry) {
    const retryResult: SelectDropdownValueResult = await selectDropdownValue(page, field, desiredValue, {
      ...options,
      retry: true,
    });
    if (retryResult.success) return retryResult;
    failureReason = retryResult.failureReason || "Dropdown value was not committed after retry.";
  } else if (!success) {
    failureReason = "Dropdown value was not committed.";
  }

  console.log("[AI_FORM_DROPDOWN_SELECT_RESULT]", {
    applicationId: options?.applicationId ?? null,
    sessionId: options?.sessionId ?? null,
    label: field.label,
    desiredValue,
    selectedText,
    selectedValue,
    valueBefore,
    valueAfter,
    success,
    failureReason: success ? null : failureReason,
  });

  return {
    success,
    selectedText,
    selectedValue,
    valueBefore,
    valueAfter,
    failureReason,
  };
}
