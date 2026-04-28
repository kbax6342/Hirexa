import type { Page } from "playwright-core";
import type {
  FillGeneratedAnswersResult,
  FormFieldDescriptor,
  GeneratedFormAnswer,
} from "@/app/lib/apply/formIntelligence/types";
import {
  isLegalOrComplianceField,
  normalizeLabelKey,
} from "@/app/lib/apply/formIntelligence/answerPolicy";
import { scanCurrentForm } from "@/app/lib/apply/formIntelligence/formScanner";
import {
  isPreferNotEquivalent,
  isPreferNotToAnswer,
} from "@/app/lib/profile/voluntarySelfIdOptions";
import { fillTextLikeField } from "@/app/lib/apply/textFieldFiller";
import {
  isDropdownLikeField,
  readDropdownValueState,
  selectDropdownValue,
} from "@/app/lib/apply/dropdownSelect";

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGenericChoicePlaceholder(value: string | null | undefined) {
  return /^(select|select\.\.\.|search|type to search|choose|choose\.\.\.|please select|start typing)$/i.test(
    text(value),
  );
}

function isSecurityTokenField(field: FormFieldDescriptor) {
  return /(g-recaptcha-response|recaptcha|hcaptcha|cf-turnstile|turnstile|captcha|security.?token)/i.test(
    [
      field.label,
      field.name,
      field.idAttribute,
      field.ariaLabel,
      field.placeholder,
      field.selector,
    ]
      .filter(Boolean)
      .join(" "),
  );
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

function isCustomSelectOrAutocompleteField(field: FormFieldDescriptor) {
  if (field.inputType === "select") return false;
  const textBlob = combinedFieldText(field);
  return (
    field.roleAttribute === "combobox" ||
    isGenericChoicePlaceholder(field.placeholder) ||
    /\b(react-select|listbox|combobox|aria-haspopup|select a country|country-error|country-placeholder)\b/i.test(
      textBlob,
    ) ||
    (field.required &&
      /\b(select|search|dropdown|country|location|located|hear about|source)\b/i.test(textBlob) &&
      /select|search/i.test(field.placeholder ?? ""))
  );
}

function answerValues(value: string | string[] | boolean) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (typeof value === "boolean") return [value ? "true" : "false"];
  return [text(value)].filter(Boolean);
}

function answerForField(
  field: FormFieldDescriptor,
  answers: GeneratedFormAnswer[],
) {
  const byId = answers.find((answer) => answer.fieldId === field.id);
  if (byId) return byId;

  const fieldKey = normalizeLabelKey(field.label);
  return answers.find((answer) => normalizeLabelKey(answer.label) === fieldKey);
}

function findOptionValue(field: FormFieldDescriptor, value: string) {
  const normalized = normalize(value);
  if (!normalized) return "";
  if (isPreferNotToAnswer(value)) {
    const preferNot = field.options?.find((option) =>
      isPreferNotEquivalent(`${option.label} ${option.value}`),
    );
    if (preferNot) return preferNot.value || preferNot.label;
  }

  const exact = field.options?.find(
    (option) =>
      normalize(option.value) === normalized ||
      normalize(option.label) === normalized,
  );
  if (exact) return exact.value || exact.label;

  const partial = field.options?.find(
    (option) =>
      normalize(option.label).includes(normalized) ||
      normalized.includes(normalize(option.label)) ||
      normalize(option.value).includes(normalized),
  );
  return partial?.value || partial?.label || "";
}

function locatorForField(page: Page, field: FormFieldDescriptor) {
  const frame = field.frameUrl
    ? page.frames().find((candidate) => candidate.url() === field.frameUrl)
    : null;
  return (frame ?? page).locator(field.selector).first();
}

async function readFieldValue(page: Page, field: FormFieldDescriptor) {
  const locator = locatorForField(page, field);
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

async function readFieldContainerText(page: Page, field: FormFieldDescriptor) {
  const locator = locatorForField(page, field);
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

async function isFieldFilled(page: Page, field: FormFieldDescriptor) {
  if (isDropdownLikeField(field)) {
    const state = await readDropdownValueState(page, field);
    return state.hasValue;
  }

  const locator = locatorForField(page, field);
  return locator
    .evaluate((element) => {
      if (element instanceof HTMLInputElement) {
        if (element.type === "file") return (element.files?.length ?? 0) > 0;
        if (element.type === "checkbox" || element.type === "radio") {
          if (element.name) {
            return Array.from(
              document.querySelectorAll(`input[name="${CSS.escape(element.name)}"]`),
            ).some((item) => item instanceof HTMLInputElement && item.checked);
          }
          return element.checked;
        }
        return Boolean(element.value?.trim());
      }
      if (element instanceof HTMLTextAreaElement) return Boolean(element.value?.trim());
      if (element instanceof HTMLSelectElement) return Boolean(element.value?.trim());
      if (element instanceof HTMLElement && element.isContentEditable) {
        return Boolean(element.innerText?.trim() || element.textContent?.trim());
      }
      return false;
    })
    .catch(() => false);
}

function candidateAnswersForCustomSelect(field: FormFieldDescriptor, value: string) {
  const candidates = [value];
  const textBlob = combinedFieldText(field).toLowerCase();
  if (/country/.test(textBlob)) {
    candidates.unshift("United States");
    candidates.push("United States of America", "USA", "US");
  } else if (/location|located|city|state/.test(textBlob)) {
    candidates.push("United States", value.replace(/,\s*United States$/i, ""));
  } else if (/hear about|source|referr/.test(textBlob)) {
    candidates.unshift("Job board");
    candidates.push("Hirexa AI", "LinkedIn", "Other");
  }
  return Array.from(new Set(candidates.map(text).filter(Boolean)));
}

async function fillCustomSelectOrAutocompleteField(
  page: Page,
  field: FormFieldDescriptor,
  answer: string,
  options?: {
    applicationId?: string | null;
    sessionId?: string | null;
  },
) {
  const locator = locatorForField(page, field);
  const frame = field.frameUrl
    ? page.frames().find((candidate) => candidate.url() === field.frameUrl)
    : null;
  const context = frame ?? page;
  const candidates = candidateAnswersForCustomSelect(field, answer);

  for (const candidate of candidates) {
    const valueBefore = await readFieldValue(page, field);
    let optionSelected = "";
    let success = false;

    try {
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

      const exactOption = context
        .getByRole("option", { name: new RegExp(`^\\s*${escapeRegExp(candidate)}\\s*$`, "i") })
        .first();
      if ((await exactOption.count().catch(() => 0)) > 0 && (await exactOption.isVisible().catch(() => false))) {
        optionSelected = text(await exactOption.textContent().catch(() => candidate)) || candidate;
        await exactOption.click({ timeout: 3000 });
      } else {
        const partialOption = context
          .locator("[role='option'], [id*='react-select'][id*='option'], li, [data-testid*='option']")
          .filter({ hasText: new RegExp(escapeRegExp(candidate), "i") })
          .first();
        if (
          (await partialOption.count().catch(() => 0)) > 0 &&
          (await partialOption.isVisible().catch(() => false))
        ) {
          optionSelected = text(await partialOption.textContent().catch(() => candidate)) || candidate;
          await partialOption.click({ timeout: 3000 });
        } else {
          await locator.press("ArrowDown").catch(() => undefined);
          await locator.press("Enter").catch(() => undefined);
          optionSelected = candidate;
        }
      }

      await locator
        .evaluate((element) => {
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          if (element instanceof HTMLElement) element.blur();
        })
        .catch(() => undefined);
      await page.waitForTimeout(150);

      const valueAfter = await readFieldValue(page, field);
      const containerText = await readFieldContainerText(page, field);
      success =
        Boolean(valueAfter) ||
        (Boolean(optionSelected) &&
          new RegExp(escapeRegExp(optionSelected.split(/\s{2,}/)[0] ?? optionSelected), "i").test(containerText)) ||
        new RegExp(escapeRegExp(candidate), "i").test(containerText);

      console.log("[AI_FORM_CUSTOM_SELECT]", {
        applicationId: options?.applicationId ?? null,
        sessionId: options?.sessionId ?? null,
        label: field.label,
        attemptedAnswer: candidate,
        optionSelected,
        valueBeforeLength: valueBefore.length,
        valueAfterLength: valueAfter.length,
        success,
      });

      if (success) return { filled: true, method: "custom_select", optionSelected };
    } catch (error) {
      console.log("[AI_FORM_CUSTOM_SELECT]", {
        applicationId: options?.applicationId ?? null,
        sessionId: options?.sessionId ?? null,
        label: field.label,
        attemptedAnswer: candidate,
        optionSelected,
        valueBeforeLength: valueBefore.length,
        valueAfterLength: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { filled: false, method: "custom_select", optionSelected: "" };
}

export async function fillGeneratedAnswers(
  page: Page,
  answers: GeneratedFormAnswer[],
  options?: {
    fields?: FormFieldDescriptor[];
    resumePath?: string | null;
    applicationId?: string | null;
    sessionId?: string | null;
  },
): Promise<FillGeneratedAnswersResult> {
  const fields = options?.fields ?? (await scanCurrentForm(page));
  let filledCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let resumeUploadAttempted = false;
  let resumeUploadSucceeded = false;
  const filledFields: FillGeneratedAnswersResult["filledFields"] = [];
  const skippedFields: FillGeneratedAnswersResult["skippedFields"] = [];
  const failedFields: FillGeneratedAnswersResult["failedFields"] = [];

  for (const field of fields) {
    const answer = answerForField(field, answers);
    if (!answer || answer.requiresUserReview || !answer.safeToAutofill) {
      skippedCount += 1;
      skippedFields.push({
        fieldId: field.id,
        label: field.label,
        reason: answer?.reason ?? "No safe generated answer.",
      });
      continue;
    }

    if (isLegalOrComplianceField(field)) {
      skippedCount += 1;
      skippedFields.push({
        fieldId: field.id,
        label: field.label,
        reason: "Legal or consent field requires user review.",
      });
      continue;
    }

    const locator = locatorForField(page, field);
    if ((await locator.count().catch(() => 0)) === 0) {
      failedCount += 1;
      failedFields.push({
        fieldId: field.id,
        label: field.label,
        reason: "Field selector was not found.",
      });
      continue;
    }

    const values = answerValues(answer.value);
    const value = values[0] ?? "";
    let filled = false;

    try {
      if (field.inputType === "file") {
        if (!options?.resumePath || answer.value !== "__RESUME_FILE__") {
          skippedCount += 1;
          skippedFields.push({
            fieldId: field.id,
            label: field.label,
            reason: "No staged file available for upload.",
          });
          continue;
        }

        resumeUploadAttempted = true;
        await locator.setInputFiles(options.resumePath);
        resumeUploadSucceeded = true;
        filled = true;
      } else if (field.inputType === "select") {
        const selected = await selectDropdownValue(page, field, value, {
          applicationId: options?.applicationId ?? null,
          sessionId: options?.sessionId ?? null,
        });
        if (!selected.success) {
          skippedCount += 1;
          skippedFields.push({
            fieldId: field.id,
            label: field.label,
            reason: selected.failureReason || "Generated answer did not match any select option.",
          });
          continue;
        }
        filled = true;
      } else if (field.inputType === "radio") {
        const optionValue = findOptionValue(field, value);
        const option = field.options?.find(
          (item) =>
            item.value === optionValue ||
            item.label === optionValue ||
            normalize(item.value) === normalize(optionValue) ||
            normalize(item.label) === normalize(optionValue),
        );
        if (!option?.selector) {
          skippedCount += 1;
          skippedFields.push({
            fieldId: field.id,
            label: field.label,
            reason: "Generated answer did not match any radio option.",
          });
          continue;
        }
        const frame = field.frameUrl
          ? page.frames().find((candidate) => candidate.url() === field.frameUrl)
          : null;
        const radioLocator = (frame ?? page).locator(option.selector).first();
        await radioLocator.check().catch(async () => {
          await radioLocator.click();
        });
        filled = true;
      } else if (field.inputType === "checkbox") {
        const normalizedValues = values.map(normalize);
        const shouldCheck =
          normalizedValues.includes("true") ||
          normalizedValues.includes("yes") ||
          normalizedValues.includes("checked");
        if (!shouldCheck) {
          skippedCount += 1;
          skippedFields.push({
            fieldId: field.id,
            label: field.label,
            reason: "Checkbox answer was not explicitly true.",
          });
          continue;
        }
        await locator.check().catch(async () => {
          await locator.click();
        });
        filled = true;
      } else {
        if (!value) {
          skippedCount += 1;
          skippedFields.push({
            fieldId: field.id,
            label: field.label,
            reason: "Generated answer was empty.",
          });
          continue;
        }
        if (isDropdownLikeField(field)) {
          const dropdown = await selectDropdownValue(page, field, value, {
            applicationId: options?.applicationId ?? null,
            sessionId: options?.sessionId ?? null,
          });
          filled = dropdown.success;
        }
        if (!filled) {
          const textFill = await fillTextLikeField({
            locator,
            answer: value,
            label: field.label,
            fieldType: field.inputType,
            applicationId: options?.applicationId ?? null,
            sessionId: options?.sessionId ?? null,
          });
          filled = textFill.filled;
        }
      }
    } catch (error) {
      failedCount += 1;
      failedFields.push({
        fieldId: field.id,
        label: field.label,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (filled) {
      filledCount += 1;
      filledFields.push({ fieldId: field.id, label: field.label });
    }
  }

  const postFillFields = await scanCurrentForm(page);
  const remainingRequiredFields: string[] = [];
  for (const field of postFillFields) {
    if (!field.required || !field.visible || field.disabled) continue;
    if (field.inputType === "hidden" || isSecurityTokenField(field)) continue;
    if (!(await isFieldFilled(page, field))) {
      remainingRequiredFields.push(field.label);
    }
  }

  if (remainingRequiredFields.length > 0) {
    console.log("[AI_FORM_RECHECK_MISSING]", {
      missingRequiredCount: remainingRequiredFields.length,
      fields: postFillFields
        .filter((field) => remainingRequiredFields.includes(field.label))
        .map((field) => ({
          label: field.label,
          rawLabel: field.inferredLabel ?? null,
          placeholder: field.placeholder ?? null,
          fieldName: field.name ?? null,
          fieldId: field.idAttribute ?? null,
          ariaLabel: field.ariaLabel ?? null,
          ariaLabelledByText: field.ariaLabelledByText ?? null,
          ariaDescribedByText: field.ariaDescribedByText ?? null,
          parentGroupText: field.parentGroupText ?? null,
          nearbyText: field.nearbyText ?? null,
          fieldType: field.inputType,
          visible: field.visible,
          disabled: field.disabled,
        })),
    });
  }

  return {
    filledCount,
    skippedCount,
    failedCount,
    filledFields,
    skippedFields,
    failedFields,
    remainingRequiredFields: Array.from(new Set(remainingRequiredFields)),
    resumeUploadAttempted,
    resumeUploadSucceeded,
  };
}
