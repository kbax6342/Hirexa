import type { Locator, Page } from "playwright-core";

export type GreenhouseValidationErrorCategory =
  | "missing_required_field"
  | "invalid_email"
  | "invalid_phone"
  | "invalid_url"
  | "invalid_location"
  | "resume_upload_failed"
  | "textarea_empty"
  | "recaptcha_or_security"
  | "unknown_validation";

export type GreenhouseValidationError = {
  text: string;
  normalizedText: string;
  fieldLabel: string | null;
  fieldName: string | null;
  fieldId: string | null;
  fieldType: string | null;
  selectorHint: string | null;
  ariaInvalid: boolean;
  ariaDescribedBy: string | null;
  describedByText: string | null;
  closestFormGroupText: string | null;
  nearbyText: string | null;
  isVisible: boolean;
  required: boolean | null;
  visible: boolean;
  category: GreenhouseValidationErrorCategory;
  repairable: boolean;
};

type InvalidControlDebug = {
  tagName: string | null;
  fieldType: string | null;
  fieldName: string | null;
  fieldId: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  ariaLabelledBy: string | null;
  ariaDescribedBy: string | null;
  describedByText: string | null;
  valueLength: number;
  hasValue: boolean;
  isVisible: boolean;
  disabled: boolean;
};

export type GreenhouseValidationExtractionResult = {
  validationErrorCount: number;
  errors: GreenhouseValidationError[];
  invalidControls?: InvalidControlDebug[];
};

const ERROR_TEXT_PATTERN =
  /\b(required|can't be blank|cannot be blank|is required|please complete|please select|select a country|please enter|enter a valid|invalid|upload|resume|captcha|recaptcha|verification|security check|security|verify)\b/i;

export function redactValidationText(text: string | null | undefined, maxLength = 500) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const redacted = raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "***@***")
    .replace(/\b(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g, "***-***-$3")
    .replace(/\b\d{8,}\b/g, (value) => `***${value.slice(-4)}`)
    .replace(/\b(sk|pk|rk|ghp|gho|xoxb|api)[-_][A-Za-z0-9_-]{12,}\b/gi, "$1_***");
  return redacted.slice(0, maxLength);
}

function normalizeValidationText(text: string | null | undefined) {
  return redactValidationText(text, 300).toLowerCase();
}

function isNonActionableValidationInstruction(text: string | null | undefined) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return true;
  if (/^required:?$/i.test(normalized)) return true;
  if (/^\*?\s*indicates an? required field\.?$/i.test(normalized)) return true;
  if (/^\*?\s*indicates a required field\.?$/i.test(normalized)) return true;
  if (/^required:\s*\*?\s*indicates an? required field\.?$/i.test(normalized)) return true;
  if (
    /\b(public burden statement|omb|paperwork reduction act|office of management and budget)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
}

export function categorizeGreenhouseValidationError(
  text: string,
  fieldLabel?: string | null,
  fieldType?: string | null,
  nearbyText?: string | null,
): GreenhouseValidationErrorCategory {
  const normalized = `${text} ${fieldLabel ?? ""} ${fieldType ?? ""} ${nearbyText ?? ""}`.toLowerCase();
  if (/\b(captcha|recaptcha|security|verify|verification|i'm not a robot|im not a robot)\b/.test(normalized)) {
    return "recaptcha_or_security";
  }
  if (/\b(resume|cv|file|attach|upload)\b/.test(normalized)) {
    return "resume_upload_failed";
  }
  if (/\b(phone|mobile|tel|valid phone|number)\b/.test(normalized)) {
    return "invalid_phone";
  }
  if (/\b(email|e-mail)\b/.test(normalized)) {
    return "invalid_email";
  }
  if (/\b(url|linkedin|website|portfolio|github|valid link)\b/.test(normalized)) {
    return "invalid_url";
  }
  if (/\b(location|country|where are you located|where are you based|city|state|please select)\b/.test(normalized)) {
    return "invalid_location";
  }
  if (
    /\b(textarea|tell us|why|describe|hardest|worked on|opportunity)\b/.test(normalized) &&
    /\b(required|blank|please complete)\b/.test(normalized)
  ) {
    return "textarea_empty";
  }
  if (/\b(required|blank|please complete|please select|is required)\b/.test(normalized)) {
    return "missing_required_field";
  }
  return "unknown_validation";
}

export function isGreenhouseValidationErrorRepairable(
  category: GreenhouseValidationErrorCategory,
  hasStrongFieldMapping = false,
) {
  if (category === "recaptcha_or_security") return false;
  if (category === "unknown_validation") return hasStrongFieldMapping;
  return (
    category === "missing_required_field" ||
    category === "invalid_email" ||
    category === "invalid_phone" ||
    category === "invalid_url" ||
    category === "invalid_location" ||
    category === "resume_upload_failed" ||
    category === "textarea_empty"
  );
}

export async function extractGreenhouseValidationErrors(args: {
  page: Page;
  formLocator?: Locator | null;
  provider?: string | null;
}): Promise<GreenhouseValidationExtractionResult> {
  console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] scanning visible error elements", {
    provider: args.provider ?? null,
    currentUrl: args.page.url(),
  });
  console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] scanning aria-invalid controls", {
    provider: args.provider ?? null,
    currentUrl: args.page.url(),
  });

  const extracted = await args.page
    .evaluate((patternSource) => {
      const errorPattern = new RegExp(patternSource, "i");
      const controlSelector =
        "input, textarea, select, [role='combobox'], [role='textbox'], [contenteditable='true']";

      function isVisible(element: Element | null): element is HTMLElement {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function clean(text: string | null | undefined, max = 500) {
        return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
      }

      function isNonActionableInstruction(text: string | null | undefined) {
        const normalized = clean(text, 700).toLowerCase();
        if (!normalized) return true;
        if (/^required:?$/i.test(normalized)) return true;
        if (/^\*?\s*indicates an? required field\.?$/i.test(normalized)) return true;
        if (/^\*?\s*indicates a required field\.?$/i.test(normalized)) return true;
        if (/^required:\s*\*?\s*indicates an? required field\.?$/i.test(normalized)) {
          return true;
        }
        return /\b(public burden statement|omb|paperwork reduction act|office of management and budget)\b/i.test(
          normalized,
        );
      }

      function textFromIds(ids: string | null | undefined) {
        return String(ids ?? "")
          .split(/\s+/)
          .map((id) => {
            const element = document.getElementById(id);
            return clean(element ? element.textContent : "", 300);
          })
          .filter(Boolean)
          .join(" ");
      }

      function closestContainer(element: Element | null) {
        if (!element) return null;
        let current: Element | null = element;
        for (let depth = 0; current && depth < 5; depth += 1) {
          if (
            current.matches(
              [
                "fieldset",
                "[data-qa]",
                "[data-testid]",
                "[class*='field']",
                "[class*='question']",
                "[class*='form']",
                ".application-question",
                ".form-group",
                ".question",
              ].join(","),
            )
          ) {
            return current;
          }
          current = current.parentElement;
        }
        return element.parentElement ?? element;
      }

      function previousUsefulText(element: Element | null) {
        let current = element?.previousElementSibling ?? null;
        for (let i = 0; current && i < 4; i += 1) {
          const text = clean(current.textContent, 180);
          if (text && !errorPattern.test(text)) return text;
          current = current.previousElementSibling;
        }
        return "";
      }

      function labelForControl(control: Element | null, container: Element | null) {
        const id = control?.getAttribute("id") ?? null;
        const ariaLabel = clean(control?.getAttribute("aria-label"), 160);
        const labelledBy = textFromIds(control?.getAttribute("aria-labelledby"));
        const placeholder = clean(control?.getAttribute("placeholder"), 160);
        const name = clean(control?.getAttribute("name"), 160);
        const explicit = id
          ? clean(document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent, 180)
          : "";
        const wrapping = clean(control?.closest("label")?.textContent, 180);
        const legend = clean(control?.closest("fieldset")?.querySelector("legend")?.textContent, 180);
        const nearbyLabel = clean(container?.querySelector("label")?.textContent, 180);
        const heading = clean(
          container?.querySelector("h1,h2,h3,h4,h5,h6,p")?.textContent,
          180,
        );
        const previous = previousUsefulText(container ?? control);
        const candidates = [
          explicit,
          wrapping,
          ariaLabel,
          labelledBy,
          nearbyLabel,
          legend,
          heading,
          previous,
          placeholder,
          name,
          id,
        ].filter((candidate): candidate is string => Boolean(candidate));
        const weak = /^(field|input|search|select|select\.\.\.|required|text control)$/i;
        return candidates.find((candidate) => !weak.test(candidate)) ?? candidates[0] ?? null;
      }

      function controlFromElement(element: Element, container: Element | null) {
        if (element.matches(controlSelector)) return element;
        const describedBy = element.getAttribute("id");
        if (describedBy) {
          const linked = document.querySelector(
            `[aria-describedby~="${CSS.escape(describedBy)}"]`,
          );
          if (linked) return linked;
        }
        return container?.querySelector(controlSelector) ?? null;
      }

      function fieldType(control: Element | null) {
        if (!control) return null;
        const tagName = control.tagName.toLowerCase();
        if (tagName === "textarea" || tagName === "select") return tagName;
        return (
          control.getAttribute("type") ??
          control.getAttribute("role") ??
          tagName ??
          null
        );
      }

      function selectorHint(control: Element | null) {
        if (!control) return null;
        const id = control.getAttribute("id");
        const name = control.getAttribute("name");
        if (id) return `#${id}`;
        if (name) return `[name="${name}"]`;
        const ariaLabel = control.getAttribute("aria-label");
        if (ariaLabel) return `[aria-label="${ariaLabel.slice(0, 80)}"]`;
        return null;
      }

      function valueInfo(control: Element | null) {
        if (!control) return { valueLength: 0, hasValue: false };
        const value =
          "value" in control
            ? String((control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value ?? "")
            : String(control.textContent ?? "");
        return { valueLength: value.length, hasValue: value.trim().length > 0 };
      }

      function buildError(element: Element, explicitText?: string) {
        const container = closestContainer(element);
        const control = controlFromElement(element, container);
        const ariaDescribedBy = control?.getAttribute("aria-describedby") ?? null;
        const describedByText = textFromIds(ariaDescribedBy) || null;
        const elementId = element.getAttribute("id");
        const elementIsDescribedByTarget =
          Boolean(elementId) &&
          String(ariaDescribedBy ?? "")
            .split(/\s+/)
            .includes(elementId ?? "");
        const rawText = clean(
          explicitText ??
            (element.matches("[aria-invalid='true']")
              ? describedByText ?? element.textContent ?? ""
              : elementIsDescribedByTarget
                ? element.textContent ?? ""
                : `${element.textContent ?? ""} ${describedByText ?? ""}`),
          500,
        );
        if (isNonActionableInstruction(rawText)) return null;
        if (!rawText || !errorPattern.test(rawText)) return null;
        const closestFormGroupText = clean(container?.textContent, 500) || null;
        return {
          text: rawText,
          fieldLabel: labelForControl(control, container),
          fieldName: control?.getAttribute("name") ?? null,
          fieldId: control?.getAttribute("id") ?? null,
          fieldType: fieldType(control),
          selectorHint: selectorHint(control),
          ariaInvalid: control?.getAttribute("aria-invalid") === "true",
          ariaDescribedBy,
          describedByText,
          closestFormGroupText,
          nearbyText: clean(closestFormGroupText, 300) || null,
          isVisible: isVisible(element),
          required: control
            ? control.hasAttribute("required") ||
              control.getAttribute("aria-required") === "true" ||
              /\*/.test(closestFormGroupText ?? "")
            : null,
        };
      }

      function invalidControlDebug(control: Element) {
        const info = valueInfo(control);
        const ariaDescribedBy = control.getAttribute("aria-describedby");
        return {
          tagName: control.tagName.toLowerCase(),
          fieldType: fieldType(control),
          fieldName: control.getAttribute("name"),
          fieldId: control.getAttribute("id"),
          placeholder: control.getAttribute("placeholder"),
          ariaLabel: control.getAttribute("aria-label"),
          ariaLabelledBy: control.getAttribute("aria-labelledby"),
          ariaDescribedBy,
          describedByText: textFromIds(ariaDescribedBy) || null,
          valueLength: info.valueLength,
          hasValue: info.hasValue,
          isVisible: isVisible(control),
          disabled:
            control.hasAttribute("disabled") ||
            control.getAttribute("aria-disabled") === "true",
        };
      }

      const selectors = [
        "[role='alert']",
        "[aria-live]",
        ".field-error",
        ".error",
        ".error-message",
        ".form-error",
        ".input-error",
        ".validation-error",
        ".help-block",
        ".invalid-feedback",
        ".field_with_errors",
        ".form__field-error",
        ".form-field-error",
        ".application-form-error",
        ".grecaptcha-error",
        ".captcha-error",
        ".recaptcha-error",
        "[data-testid*='error']",
        "[class*='error']",
        "[id*='error']",
      ];

      const candidates = new Set<Element>();
      for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          if (isVisible(element)) candidates.add(element);
        }
      }

      for (const element of Array.from(document.querySelectorAll("body *"))) {
        if (!isVisible(element)) continue;
        const children = Array.from(element.children).filter(isVisible);
        if (children.length > 0) continue;
        const text = clean(element.textContent, 300);
        if (isNonActionableInstruction(text)) continue;
        if (text && errorPattern.test(text)) candidates.add(element);
      }

      const invalidControls = Array.from(
        document.querySelectorAll(
          "input[aria-invalid='true'], textarea[aria-invalid='true'], select[aria-invalid='true'], [role='combobox'][aria-invalid='true'], [aria-invalid='true']",
        ),
      );
      for (const control of invalidControls) {
        candidates.add(control);
      }

      const results: NonNullable<ReturnType<typeof buildError>>[] = [];
      const seen = new Set<string>();
      for (const element of Array.from(candidates)) {
        const error = buildError(element);
        if (!error) continue;
        const key = `${error.text}|${error.fieldLabel ?? ""}|${error.fieldId ?? ""}|${error.fieldName ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(error);
      }

      return {
        errors: results.slice(0, 30),
        invalidControls: invalidControls.map(invalidControlDebug).slice(0, 30),
      };
    }, ERROR_TEXT_PATTERN.source)
    .catch(() => ({ errors: [], invalidControls: [] as InvalidControlDebug[] }));

  console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] aria-invalid controls", {
    provider: args.provider ?? null,
    currentUrl: args.page.url(),
    count: extracted.invalidControls.length,
    controls: extracted.invalidControls.map((control) => ({
      ...control,
      placeholder: redactValidationText(control.placeholder, 100) || null,
      ariaLabel: redactValidationText(control.ariaLabel, 100) || null,
      describedByText: redactValidationText(control.describedByText, 220) || null,
    })),
  });

  const mapped = extracted.errors.map((error) => {
    const text = redactValidationText(error.text, 240);
    const describedByText = redactValidationText(error.describedByText, 300) || null;
    const closestFormGroupText =
      redactValidationText(error.closestFormGroupText, 500) || null;
    const nearbyText = redactValidationText(error.nearbyText, 300) || null;
    const category = categorizeGreenhouseValidationError(
      text,
      error.fieldLabel,
      error.fieldType,
      `${describedByText ?? ""} ${closestFormGroupText ?? ""}`,
    );
    const hasStrongFieldMapping = Boolean(error.fieldLabel || error.fieldId || error.fieldName);
    const mappedError: GreenhouseValidationError = {
      text,
      normalizedText: normalizeValidationText(text),
      fieldLabel: redactValidationText(error.fieldLabel, 180) || null,
      fieldName: redactValidationText(error.fieldName, 120) || null,
      fieldId: redactValidationText(error.fieldId, 120) || null,
      fieldType: error.fieldType,
      selectorHint: redactValidationText(error.selectorHint, 160) || null,
      ariaInvalid: Boolean(error.ariaInvalid),
      ariaDescribedBy: redactValidationText(error.ariaDescribedBy, 180) || null,
      describedByText,
      closestFormGroupText,
      nearbyText,
      isVisible: Boolean(error.isVisible),
      visible: Boolean(error.isVisible),
      required: error.required,
      category,
      repairable: isGreenhouseValidationErrorRepairable(category, hasStrongFieldMapping),
    };
    console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] describedby text resolved", {
      provider: args.provider ?? null,
      fieldLabel: mappedError.fieldLabel,
      fieldId: mappedError.fieldId,
      ariaDescribedBy: mappedError.ariaDescribedBy,
      hasDescribedByText: Boolean(mappedError.describedByText),
    });
    console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] mapped validation error to field", {
      provider: args.provider ?? null,
      text: mappedError.text,
      fieldLabel: mappedError.fieldLabel,
      fieldName: mappedError.fieldName,
      fieldId: mappedError.fieldId,
      fieldType: mappedError.fieldType,
      ariaInvalid: mappedError.ariaInvalid,
      category: mappedError.category,
      repairable: mappedError.repairable,
    });
    return mappedError;
  }).filter((error) => {
    if (isNonActionableValidationInstruction(error.text)) return false;
    const context = `${error.describedByText ?? ""} ${error.closestFormGroupText ?? ""}`.trim();
    if (
      context &&
      isNonActionableValidationInstruction(context) &&
      !error.ariaInvalid &&
      !error.fieldId &&
      !error.fieldName
    ) {
      return false;
    }
    return true;
  });
  const deduped = Array.from(
    mapped
      .reduce((byFieldAndCategory, error) => {
        const key = [
          error.fieldId,
          error.fieldName,
          error.fieldLabel,
          error.category,
        ].join("|");
        const existing = byFieldAndCategory.get(key);
        if (!existing || error.text.length < existing.text.length) {
          byFieldAndCategory.set(key, error);
        }
        return byFieldAndCategory;
      }, new Map<string, GreenhouseValidationError>())
      .values(),
  );

  console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] extracted", {
    provider: args.provider ?? null,
    currentUrl: args.page.url(),
    validationErrorCount: deduped.length,
    errors: deduped.map((error) => ({
      text: error.text,
      fieldLabel: error.fieldLabel,
      fieldName: error.fieldName,
      fieldId: error.fieldId,
      fieldType: error.fieldType,
      ariaInvalid: error.ariaInvalid,
      ariaDescribedBy: error.ariaDescribedBy,
      describedByText: error.describedByText,
      closestFormGroupText: error.closestFormGroupText,
      nearbyText: error.nearbyText,
      category: error.category,
      repairable: error.repairable,
    })),
  });

  return {
    validationErrorCount: deduped.length,
    errors: deduped,
    invalidControls: extracted.invalidControls,
  };
}
