import type { Frame, Page } from "playwright-core";
import type { MappedApplicationField } from "@/app/lib/apply/formFieldMapper";
import {
  resolveLocationAnswer,
  resolveProfileLocationForApplicationField,
} from "@/app/lib/apply/locationAnswerResolver";
import { fillTextLikeField } from "@/app/lib/apply/textFieldFiller";

export type FillLocationFieldsResult = {
  attempted: boolean;
  filledCount: number;
  failedFields: Array<{ fieldId: string; label: string; reason: string }>;
};

export type FillLocationDropdownFieldResult = {
  attempted: boolean;
  filled: boolean;
  reason?: string;
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase();
}

function fieldText(field: MappedApplicationField) {
  return [
    field.label,
    field.groupLabel,
    field.sourceHints.labelText,
    field.sourceHints.ariaLabel,
    field.sourceHints.placeholder,
    field.sourceHints.name,
    field.sourceHints.id,
    field.sourceHints.nearbyText,
    field.sourceHints.parentText,
    field.sourceHints.legendText,
    field.sourceHints.sectionHeading,
    field.options?.join(" "),
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function isPhoneCountryField(field: MappedApplicationField) {
  return field.fieldKind.startsWith("phone_country") || /\b(phone|calling|dial)\b/i.test(fieldText(field));
}

export function isLocationLikeField(field: MappedApplicationField) {
  if (!field.visible || field.disabled) return false;
  if (field.fieldKind === "hidden_or_token_field" || field.fieldKind === "recaptcha_token") {
    return false;
  }
  if (isPhoneCountryField(field)) return false;
  if (field.fieldKind === "profile_location_field" || field.fieldKind === "country_dropdown_field") {
    return true;
  }
  return /\b(where are you located|where.*based|current location|location|city|state|province|country|country\/region)\b/i.test(
    fieldText(field),
  );
}

function targetFor(pageOrFrame: Page | Frame, field: MappedApplicationField) {
  const descriptor = field.descriptor;
  const maybePage = pageOrFrame as Page;
  if (descriptor?.frameUrl && typeof maybePage.frames === "function") {
    const frame = maybePage.frames().find((candidate) => candidate.url() === descriptor.frameUrl);
    return (frame ?? maybePage).locator(descriptor.selector).first();
  }
  return pageOrFrame.locator(field.selectorHints[0] ?? field.descriptor?.selector ?? "").first();
}

function countryAliases(answer: string) {
  if (/\bunited states|usa|us\b/i.test(answer)) {
    return ["United States", "United States of America", "USA", "US"];
  }
  return [answer];
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function locationQuestionRegex(label?: string | null) {
  const cleaned = text(label).replace(/\*/g, "").trim();
  if (/\bwhere are you located|where.*based|current location|location|country\b/i.test(cleaned)) {
    return new RegExp(escapeRegex(cleaned).replace(/\s+/g, "\\s+"), "i");
  }
  return /where are you located|where are you currently located|where are you based|current location|country\/region|country|location/i;
}

function bestAnswerForControl(field: MappedApplicationField, fullAnswer: string) {
  const allText = fieldText(field);
  if (
    field.fieldKind === "country_dropdown_field" ||
    field.type === "select" ||
    /\bcountry|country\/region|select|search\b/i.test(allText)
  ) {
    if (/\bunited states|usa|us\b/i.test(fullAnswer)) return "United States";
    return fullAnswer.split(",").at(-1)?.trim() || fullAnswer;
  }
  return fullAnswer;
}

async function selectNativeOption(
  pageOrFrame: Page | Frame,
  field: MappedApplicationField,
  answer: string,
) {
  const locator = targetFor(pageOrFrame, field);
  const aliases = countryAliases(answer);
  for (const alias of aliases) {
    const option = field.options?.find((item) => {
      const normalized = normalize(item);
      return normalized === normalize(alias) || normalized.includes(normalize(alias));
    });
    if (!option) continue;
    const selected = await locator
      .selectOption({ label: option })
      .catch(() => locator.selectOption({ value: option }).catch(() => []));
    if (selected.length > 0) {
      await locator.evaluate((element) => {
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        if (element instanceof HTMLElement) element.blur();
      }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

async function fillComboboxOrSearch(
  page: Page,
  pageOrFrame: Page | Frame,
  field: MappedApplicationField,
  answer: string,
) {
  const locator = targetFor(pageOrFrame, field);
  const aliases = countryAliases(answer);
  for (const alias of aliases) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: 2_500 }).catch(() => undefined);
    await locator.fill(alias, { timeout: 2_500 }).catch(async () => {
      await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
      await locator.type(alias, { delay: 10 }).catch(() => undefined);
    });
    await page.waitForTimeout(250).catch(() => undefined);

    const option = page
      .getByRole("option", { name: new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
      .first();
    if ((await option.count().catch(() => 0)) > 0 && (await option.isVisible().catch(() => false))) {
      await option.click().catch(() => undefined);
      return true;
    }
    const textOption = page
      .locator(
        `[role="option"]:has-text("${alias}"), li:has-text("${alias}"), div:has-text("${alias}")`,
      )
      .first();
    if (
      (await textOption.count().catch(() => 0)) > 0 &&
      (await textOption.isVisible().catch(() => false))
    ) {
      await textOption.click().catch(() => undefined);
      return true;
    }
    await locator.press("Enter").catch(() => undefined);
    await page.waitForTimeout(250).catch(() => undefined);
    if (await verifyLocationValue(pageOrFrame, field, alias)) return true;
  }
  return false;
}

async function clickMatchingOption(page: Page, aliases: string[]) {
  for (const alias of aliases) {
    const exactOption = page
      .getByRole("option", { name: new RegExp(`^\\s*${escapeRegex(alias)}\\s*$`, "i") })
      .first();
    if (
      (await exactOption.count().catch(() => 0)) > 0 &&
      (await exactOption.isVisible().catch(() => false))
    ) {
      await exactOption.click().catch(() => undefined);
      return alias;
    }

    const looseOption = page
      .getByRole("option", { name: new RegExp(escapeRegex(alias), "i") })
      .first();
    if (
      (await looseOption.count().catch(() => 0)) > 0 &&
      (await looseOption.isVisible().catch(() => false))
    ) {
      await looseOption.click().catch(() => undefined);
      return alias;
    }

    const textOption = page.getByText(new RegExp(`^\\s*${escapeRegex(alias)}\\s*$`, "i")).first();
    if (
      (await textOption.count().catch(() => 0)) > 0 &&
      (await textOption.isVisible().catch(() => false))
    ) {
      await textOption.click().catch(() => undefined);
      return alias;
    }
  }
  return null;
}

async function verifyGroupValue(page: Page, label: string, aliases: string[]) {
  const question = page.getByText(locationQuestionRegex(label)).first();
  const group = question.locator(
    "xpath=ancestor::*[self::div or self::fieldset or self::label or self::section][.//input or .//button or .//*[@role='combobox']][1]",
  );
  const groupText = await group
    .evaluate((element) => element instanceof HTMLElement ? element.innerText || element.textContent || "" : "")
    .catch(() => "");
  if (aliases.some((alias) => normalize(groupText).includes(normalize(alias)))) {
    return true;
  }

  const backingValue = await group
    .locator("input, select, textarea, [role='combobox']")
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            return element.value ?? "";
          }
          if (element instanceof HTMLSelectElement) {
            return element.selectedOptions[0]?.textContent?.trim() || element.value || "";
          }
          if (element instanceof HTMLElement) return element.innerText || element.textContent || "";
          return "";
        })
        .join(" "),
    )
    .catch(() => "");
  return Boolean(text(backingValue)) && aliases.some((alias) => normalize(backingValue).includes(normalize(alias)));
}

export async function fillLocationDropdownField(args: {
  page: Page;
  field?: MappedApplicationField | null;
  userProfile: unknown;
  jobContext?: { location?: string | null } | null;
  applicationId?: string | null;
  sessionId?: string | null;
}): Promise<FillLocationDropdownFieldResult> {
  const label = args.field?.label ?? "Where are you located?";
  const resolved = resolveProfileLocationForApplicationField({
    userProfile: args.userProfile,
    fieldLabel: label,
    fieldOptions: args.field?.options ?? null,
    jobLocation: args.jobContext?.location ?? null,
  });
  const country = resolved.countryAnswer ?? null;
  const full = resolved.fullLocationAnswer ?? resolved.answer;
  const searchValues = [country, full].filter((value): value is string => Boolean(value));
  if (searchValues.length === 0) {
    console.log("[AUTO_APPLY_LOCATION] profile location missing", {
      applicationId: args.applicationId ?? null,
      sessionId: args.sessionId ?? null,
      label,
    });
    return { attempted: true, filled: false, reason: resolved.reason };
  }

  const question = args.page.getByText(locationQuestionRegex(label)).first();
  const questionVisible =
    (await question.count().catch(() => 0)) > 0 &&
    (await question.isVisible().catch(() => false));
  if (!questionVisible) {
    return {
      attempted: false,
      filled: false,
      reason: "Location question text was not visible.",
    };
  }

  const group = question.locator(
    "xpath=ancestor::*[self::div or self::fieldset or self::label or self::section][.//input or .//button or .//*[@role='combobox']][1]",
  );
  const groupFound = (await group.count().catch(() => 0)) > 0;
  if (!groupFound) {
    return {
      attempted: false,
      filled: false,
      reason: "Location dropdown group was not found.",
    };
  }

  console.log("[AUTO_APPLY_LOCATION] location dropdown group detected", {
    applicationId: args.applicationId ?? null,
    sessionId: args.sessionId ?? null,
    label,
  });
  if (/greenhouse\.io/i.test(args.page.url())) {
    console.log("[AUTO_APPLY_LOCATION] greenhouse location fallback started", {
      applicationId: args.applicationId ?? null,
      sessionId: args.sessionId ?? null,
      label,
      currentUrl: args.page.url(),
    });
  }

  const aliases = countryAliases(country ?? searchValues[0]);
  const select = group.locator("select").first();
  if ((await select.count().catch(() => 0)) > 0 && (await select.isVisible().catch(() => false))) {
    for (const alias of aliases) {
      const matchedOption = await select
        .locator("option")
        .evaluateAll((options, expected) => {
          const normalizedExpected = String(expected).trim().toLowerCase();
          const matched = options.find((option) => {
            const text = option.textContent?.trim().toLowerCase() ?? "";
            const value = option.getAttribute("value")?.trim().toLowerCase() ?? "";
            return (
              text === normalizedExpected ||
              value === normalizedExpected ||
              text.includes(normalizedExpected)
            );
          });
          return matched
            ? {
                label: matched.textContent?.trim() ?? "",
                value: matched.getAttribute("value") ?? "",
              }
            : null;
        }, alias)
        .catch(() => null);
      if (!matchedOption) continue;
      const selected = await select
        .selectOption({ value: matchedOption.value })
        .catch(() => select.selectOption({ label: matchedOption.label }).catch(() => []));
      if (selected.length > 0) {
        await select.evaluate((element) => {
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          if (element instanceof HTMLElement) element.blur();
        }).catch(() => undefined);
        console.log("[AUTO_APPLY_LOCATION] value committed", {
          applicationId: args.applicationId ?? null,
          sessionId: args.sessionId ?? null,
          label,
          method: "native_select",
        });
        return { attempted: true, filled: true };
      }
    }
  }

  const control = group
    .locator("[role='combobox'], input:not([type='hidden']), button, [tabindex]")
    .first();
  if ((await control.count().catch(() => 0)) === 0) {
    return {
      attempted: true,
      filled: false,
      reason: "Location dropdown control was not found inside the group.",
    };
  }

  await control.scrollIntoViewIfNeeded().catch(() => undefined);
  await control.click({ timeout: 3_000 }).catch(() => undefined);
  await control.focus().catch(() => undefined);
  console.log("[AUTO_APPLY_LOCATION] dropdown opened", {
    applicationId: args.applicationId ?? null,
    sessionId: args.sessionId ?? null,
    label,
  });

  for (const searchValue of searchValues) {
    const searchAliases = countryAliases(searchValue);
    const preferred = searchAliases[0];
    console.log("[AUTO_APPLY_LOCATION] option search attempted", {
      applicationId: args.applicationId ?? null,
      sessionId: args.sessionId ?? null,
      label,
      searchKind: /\bunited states|usa|us\b/i.test(preferred) ? "country" : "location",
    });
    await control.fill(preferred, { timeout: 2_000 }).catch(async () => {
      await args.page.keyboard.type(preferred, { delay: 10 }).catch(() => undefined);
    });
    await args.page.waitForTimeout(300).catch(() => undefined);
    const selectedAlias = await clickMatchingOption(args.page, searchAliases);
    if (selectedAlias) {
      console.log("[AUTO_APPLY_LOCATION] option selected", {
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
        label,
      });
      await control.dispatchEvent("input").catch(() => undefined);
      await control.dispatchEvent("change").catch(() => undefined);
      await control.blur().catch(() => undefined);
      console.log("[AUTO_APPLY_LOCATION] value committed", {
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
        label,
        method: "combobox_option",
      });
      if (await verifyGroupValue(args.page, label, searchAliases)) {
        console.log("[AUTO_APPLY_LOCATION] validation passed", {
          applicationId: args.applicationId ?? null,
          sessionId: args.sessionId ?? null,
          label,
        });
        return { attempted: true, filled: true };
      }
    }
    await control.press("Enter").catch(() => undefined);
    await control.blur().catch(() => undefined);
    if (await verifyGroupValue(args.page, label, searchAliases)) {
      console.log("[AUTO_APPLY_LOCATION] validation passed", {
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
        label,
      });
      return { attempted: true, filled: true };
    }
  }

  console.log("[AUTO_APPLY_LOCATION] validation still failing", {
    applicationId: args.applicationId ?? null,
    sessionId: args.sessionId ?? null,
    label,
    reason: "dropdown_group_value_not_committed",
  });
  return {
    attempted: true,
    filled: false,
    reason: "Profile location exists, but the application's location dropdown did not validate after autofill.",
  };
}

async function verifyLocationValue(
  pageOrFrame: Page | Frame,
  field: MappedApplicationField,
  answer: string,
) {
  const locator = targetFor(pageOrFrame, field);
  const normalizedAnswer = normalize(answer);
  const direct = await locator
    .evaluate((element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value ?? "";
      }
      if (element instanceof HTMLSelectElement) {
        return element.selectedOptions[0]?.textContent?.trim() || element.value || "";
      }
      if (element instanceof HTMLElement) return element.innerText || element.textContent || "";
      return "";
    })
    .catch(() => "");
  if (normalize(direct).includes(normalizedAnswer) || normalizedAnswer.includes(normalize(direct))) {
    return Boolean(text(direct));
  }

  const containerText = await locator
    .evaluate((element) => {
      const container = element.closest(
        "div, fieldset, label, [data-testid], [class*='field'], [class*='question']",
      );
      return container instanceof HTMLElement
        ? container.innerText || container.textContent || ""
        : "";
    })
    .catch(() => "");
  return countryAliases(answer).some((alias) => normalize(containerText).includes(normalize(alias)));
}

export async function fillLocationFields(args: {
  page: Page;
  pageOrFrame?: Page | Frame;
  fields: MappedApplicationField[];
  userProfile: unknown;
  jobLocation?: string | null;
  applicationId?: string | null;
  sessionId?: string | null;
}): Promise<FillLocationFieldsResult> {
  const target = args.pageOrFrame ?? args.page;
  const fields = args.fields.filter(isLocationLikeField);
  if (fields.length === 0) {
    return { attempted: false, filledCount: 0, failedFields: [] };
  }

  console.log("[AUTO_APPLY_LOCATION] detected location field group", {
    applicationId: args.applicationId ?? null,
    sessionId: args.sessionId ?? null,
    labels: fields.map((field) => field.label),
    fieldKinds: fields.map((field) => field.fieldKind),
  });

  let filledCount = 0;
  const failedFields: FillLocationFieldsResult["failedFields"] = [];
  const primaryLabel =
    fields.find((field) => /where.*located|where.*based|current location/i.test(fieldText(field)))?.label ??
    fields[0]?.label ??
    "Location";
  const answer = resolveLocationAnswer({
    userProfile: args.userProfile,
    fieldLabel: primaryLabel,
    fieldOptions: fields.flatMap((field) => field.options ?? []),
    jobLocation: args.jobLocation ?? null,
  });
  if (!answer.answer) {
    return {
      attempted: true,
      filledCount: 0,
      failedFields: fields.map((field) => ({
        fieldId: field.fieldId,
        label: field.label,
        reason: answer.reason,
      })),
    };
  }

  const primaryField =
    fields.find((field) => /where.*located|where.*based|current location/i.test(fieldText(field))) ??
    fields.find((field) => field.fieldKind === "country_dropdown_field") ??
    fields[0] ??
    null;
  const dropdownFill = await fillLocationDropdownField({
    page: args.page,
    field: primaryField,
    userProfile: args.userProfile,
    jobContext: { location: args.jobLocation ?? null },
    applicationId: args.applicationId ?? null,
    sessionId: args.sessionId ?? null,
  });
  if (dropdownFill.attempted && dropdownFill.filled) {
    return { attempted: true, filledCount: 1, failedFields: [] };
  }

  for (const field of fields) {
    if (field.currentValue && !/select|search/i.test(field.currentValue)) continue;
    const value = bestAnswerForControl(field, answer.answer);
    let filled = false;
    if (field.type === "select") {
      console.log("[AUTO_APPLY_LOCATION] filling country dropdown", {
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
        label: field.label,
        answerKind: answer.answerKind,
      });
      filled = await selectNativeOption(target, field, value);
    } else if (
      field.fieldKind === "country_dropdown_field" ||
      /combobox|search|select/i.test(field.sourceHints.role ?? "") ||
      /search|select/i.test(`${field.label} ${field.sourceHints.placeholder}`)
    ) {
      console.log("[AUTO_APPLY_LOCATION] filling country dropdown", {
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
        label: field.label,
        answerKind: answer.answerKind,
      });
      filled = await fillComboboxOrSearch(args.page, target, field, value);
      if (filled) {
        console.log("[AUTO_APPLY_LOCATION] selected country option", {
          applicationId: args.applicationId ?? null,
          sessionId: args.sessionId ?? null,
          label: field.label,
        });
      }
    } else {
      console.log("[AUTO_APPLY_LOCATION] filling text location field", {
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
        label: field.label,
        answerKind: answer.answerKind,
        answerLength: answer.answer.length,
      });
      const textFill = await fillTextLikeField({
        locator: targetFor(target, field),
        answer: value,
        label: field.label,
        fieldType: field.type,
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
      });
      filled = textFill.filled;
    }

    if (filled && (await verifyLocationValue(target, field, value))) {
      filledCount += 1;
      console.log("[AUTO_APPLY_LOCATION] verified location value", {
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
        label: field.label,
      });
    } else {
      failedFields.push({
        fieldId: field.fieldId,
        label: field.label,
        reason: "Profile location/country exists, but the form location control did not validate after autofill.",
      });
      console.log("[AUTO_APPLY_LOCATION] validation still failing", {
        applicationId: args.applicationId ?? null,
        sessionId: args.sessionId ?? null,
        label: field.label,
        fieldKind: field.fieldKind,
      });
    }
  }

  return { attempted: true, filledCount, failedFields };
}
