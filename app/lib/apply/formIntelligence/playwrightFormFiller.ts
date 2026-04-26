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

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase();
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

async function isFieldFilled(page: Page, field: FormFieldDescriptor) {
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

export async function fillGeneratedAnswers(
  page: Page,
  answers: GeneratedFormAnswer[],
  options?: {
    fields?: FormFieldDescriptor[];
    resumePath?: string | null;
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
        const optionValue = findOptionValue(field, value);
        if (!optionValue) {
          skippedCount += 1;
          skippedFields.push({
            fieldId: field.id,
            label: field.label,
            reason: "Generated answer did not match any select option.",
          });
          continue;
        }
        const selected = await locator
          .selectOption({ value: optionValue })
          .catch(() => locator.selectOption({ label: optionValue }));
        filled = selected.length > 0;
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
        await locator.fill(value);
        filled = true;
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
    if (!(await isFieldFilled(page, field))) {
      remainingRequiredFields.push(field.label);
    }
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
