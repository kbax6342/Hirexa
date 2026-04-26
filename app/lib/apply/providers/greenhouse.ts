import type { Frame, Locator, Page } from "playwright-core";
import {
  extractLocatorText,
  findMatchingLocator,
} from "@/app/lib/apply/formFieldLocators";
import { normalizeJobUrl } from "@/app/lib/jobSources";

type AnswerValue = string | string[];
type GreenhouseFieldRoot = Page | Frame;

export type GreenhouseApplicationField = {
  name: string;
  id: string;
  label: string;
  type: string;
  placeholder: string;
  required: boolean;
  visible: boolean;
  enabled: boolean;
  filled: boolean;
};

export type GreenhouseApplicationFormDetection = {
  providerDetected: "greenhouse";
  currentUrl: string;
  formContextUrl: string;
  usedFrame: boolean;
  formDetected: boolean;
  formContainerFound: boolean;
  visibleFieldCount: number;
  fillableFieldCount: number;
  requiredFieldCount: number;
  submitButtonFound: boolean;
  fields: GreenhouseApplicationField[];
};

export type FillGreenhouseApplicationFormResult =
  GreenhouseApplicationFormDetection & {
    filledFieldCount: number;
    missingRequiredFields: string[];
    missingPayloadNames: string[];
    resumeInputFound: boolean;
    resumeUploadAttempted: boolean;
    resumeUploadSucceeded: boolean;
  };

type DetectionWithContext = {
  context: GreenhouseFieldRoot;
  detection: GreenhouseApplicationFormDetection;
};

function parseGreenhouseHost(jobUrl: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(String(jobUrl ?? ""));
  if (!normalizedUrl) return "";

  try {
    return new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isGreenhouseUrl(jobUrl: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(String(jobUrl ?? ""));
  if (!normalizedUrl) return false;

  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    return (
      host.endsWith("greenhouse.io") ||
      (host.includes("greenhouse") &&
        (path.includes("/jobs/") ||
          path.includes("/embed/") ||
          path.includes("apply")))
    );
  } catch {
    return false;
  }
}

export function isGreenhouseBoardUrl(jobUrl: string | null | undefined) {
  const host = parseGreenhouseHost(jobUrl);
  return (
    host === "job-boards.greenhouse.io" ||
    host === "boards.greenhouse.io" ||
    host === "job-boards.eu.greenhouse.io"
  );
}

function asArray(value: AnswerValue) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? ""))
    : [String(value ?? "")];
}

function shouldAllowChoiceControls(fieldName: string, rawValue: AnswerValue) {
  const normalized = fieldName.toLowerCase();
  const namedChoiceField = /(consent|agree|terms|authorization|authorisation|authorized|authorised|veteran|disability|gender|race|ethnicity|sponsor|work[-_\s]?authorization|eeo|opt[-_\s]?in|subscribe|newsletter|checkbox|radio)/i.test(
    normalized,
  );

  if (namedChoiceField) return true;
  if (!Array.isArray(rawValue)) return false;

  return /(consent|terms|authorization|authorisation|veteran|disability|gender|race|ethnicity|eeo)/i.test(
    normalized,
  );
}

async function readLocatorTagName(locator: Locator) {
  return locator
    .evaluate((element) => element.tagName.toLowerCase())
    .catch(() => "");
}

async function readLocatorInputType(locator: Locator) {
  return locator
    .evaluate((element) =>
      element instanceof HTMLInputElement
        ? (element.type || "text").toLowerCase()
        : "",
    )
    .catch(() => "");
}

async function readLocatorValue(locator: Locator) {
  return locator
    .evaluate((element) => {
      if (element instanceof HTMLInputElement) {
        if ((element.type || "text").toLowerCase() === "file") {
          return element.files?.length ? "__FILE_SELECTED__" : "";
        }
        return element.value ?? "";
      }

      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        return element.value ?? "";
      }

      return "";
    })
    .catch(() => "");
}

async function hasSelectedChoice(locator: Locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    const checked = await candidate.isChecked().catch(() => false);
    if (checked) {
      return true;
    }
  }

  return false;
}

async function chooseGreenhouseContext(page: Page): Promise<DetectionWithContext> {
  const contexts: Array<{ context: GreenhouseFieldRoot; usedFrame: boolean }> = [
    { context: page, usedFrame: false },
    ...page
      .frames()
      .filter((frame) => frame !== page.mainFrame())
      .map((frame) => ({ context: frame, usedFrame: true })),
  ];

  const detections: DetectionWithContext[] = [];

  for (const candidate of contexts) {
    const detection = await candidate.context
      .evaluate(
        ({ usedFrame }) => {
          const FIELD_SELECTOR = "input, textarea, select";
          const APPLICATION_FIELD_PATTERN =
            /(job_application|answers_attributes|candidate|applicant|resume|cover[\s_-]?letter|linkedin|portfolio|website|first[\s_-]?name|last[\s_-]?name|email|phone|location|city|state|country|question|authorization|authorisation|sponsorship|visa|eeo|veteran|disability|gender|ethnicity|race)/i;
          const SUBMIT_BUTTON_PATTERN =
            /(apply for this job|submit application|submit|apply now|apply)/i;

          function normalizeText(value: string | null | undefined) {
            return String(value ?? "").replace(/\s+/g, " ").trim();
          }

          function isVisible(node: HTMLElement) {
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0
            );
          }

          function hasCookieContext(node: Element) {
            const container = node.closest(
              '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [aria-label*="cookie"], [aria-label*="consent"], [data-testid*="cookie"], [data-testid*="consent"]',
            );
            if (!container) return false;
            const text = normalizeText(container.textContent).toLowerCase();
            return (
              text.includes("cookie") ||
              text.includes("consent") ||
              text.includes("privacy") ||
              text.includes("preferences")
            );
          }

          function readLabel(node: Element) {
            const htmlNode = node as HTMLElement;
            const id = normalizeText(htmlNode.getAttribute("id"));
            if (id) {
              const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
              const byFor = normalizeText(label?.textContent);
              if (byFor) return byFor;
            }

            const wrappedLabel = normalizeText(htmlNode.closest("label")?.textContent);
            if (wrappedLabel) return wrappedLabel;

            const scope = htmlNode.closest(
              "li, fieldset, .field, .question, .application-question, [data-qa], div",
            );
            const legend = normalizeText(scope?.querySelector("legend")?.textContent);
            if (legend) return legend;

            const directLabel = normalizeText(scope?.querySelector("label")?.textContent);
            if (directLabel) return directLabel;

            return "";
          }

          function readFieldType(node: Element) {
            if (node instanceof HTMLTextAreaElement) return "textarea";
            if (node instanceof HTMLSelectElement) return "select";
            if (node instanceof HTMLInputElement) {
              return (node.type || "text").toLowerCase();
            }
            return "";
          }

          function isRequired(node: Element, label: string) {
            if (
              node.hasAttribute("required") ||
              node.getAttribute("aria-required") === "true" ||
              node.getAttribute("data-required") === "true"
            ) {
              return true;
            }

            if (/\*/.test(label) || /\brequired\b/i.test(label)) {
              return true;
            }

            const scope = node.closest(
              "li, fieldset, .field, .question, .application-question, [data-qa], div",
            );
            if (!scope) return false;

            return (
              scope.getAttribute("aria-required") === "true" ||
              scope.getAttribute("data-required") === "true" ||
              /\brequired\b/i.test(normalizeText(scope.className))
            );
          }

          function isFilled(node: Element, type: string) {
            if (node instanceof HTMLInputElement) {
              if (type === "checkbox" || type === "radio") {
                return node.checked;
              }

              if (type === "file") {
                return (node.files?.length ?? 0) > 0;
              }

              return normalizeText(node.value).length > 0;
            }

            if (node instanceof HTMLTextAreaElement) {
              return normalizeText(node.value).length > 0;
            }

            if (node instanceof HTMLSelectElement) {
              const selectedValue = normalizeText(node.value);
              const selectedLabel = normalizeText(
                node.selectedOptions.item(0)?.textContent,
              ).toLowerCase();
              if (!selectedValue) return false;
              return !/select|choose|please/i.test(selectedLabel);
            }

            return false;
          }

          function isApplicationLikeField(args: {
            name: string;
            id: string;
            label: string;
            placeholder: string;
            type: string;
            formAssociated: boolean;
          }) {
            const combined = [
              args.name,
              args.id,
              args.label,
              args.placeholder,
              args.type,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            if (
              combined.includes("job_application") ||
              combined.includes("answers_attributes")
            ) {
              return true;
            }

            if (APPLICATION_FIELD_PATTERN.test(combined)) {
              return true;
            }

            return args.formAssociated && /(file|textarea|select|text|email|tel)/i.test(args.type);
          }

          const rawFields = Array.from(document.querySelectorAll(FIELD_SELECTOR))
            .map((node) => {
              if (!(node instanceof HTMLElement)) return null;
              if (!isVisible(node)) return null;
              if (hasCookieContext(node)) return null;
              if (node.closest("header, nav, footer, [role='navigation']")) {
                return null;
              }

              const type = readFieldType(node);
              if (
                !type ||
                type === "hidden" ||
                type === "submit" ||
                type === "button" ||
                type === "reset" ||
                type === "image" ||
                type === "password"
              ) {
                return null;
              }

              const name = normalizeText(node.getAttribute("name"));
              const id = normalizeText(node.getAttribute("id"));
              const label = normalizeText(readLabel(node)).replace(/\*/g, "").trim();
              const placeholder = normalizeText(
                node.getAttribute("placeholder") || node.getAttribute("aria-label"),
              );
              const enabled =
                !node.hasAttribute("disabled") &&
                node.getAttribute("aria-disabled") !== "true";
              const formAssociated =
                Boolean(node.closest("form")) ||
                Boolean(
                  node.closest(
                    "[id*='application' i], [class*='application' i], [data-qa*='application' i]",
                  ),
                );

              const applicationLike = isApplicationLikeField({
                name,
                id,
                label,
                placeholder,
                type,
                formAssociated,
              });
              if (!applicationLike) return null;

              return {
                name,
                id,
                label: label || placeholder || name || id || "Field",
                type,
                placeholder,
                required: isRequired(node, label || placeholder || name || id),
                visible: true,
                enabled,
                filled: isFilled(node, type),
              };
            })
            .filter((field): field is GreenhouseApplicationField => Boolean(field));

          const visibleFields = rawFields.filter((field) => field.visible);
          const fillableFields = visibleFields.filter((field) => field.enabled);
          const requiredFields = fillableFields.filter((field) => field.required);

          const formContainerFound =
            Boolean(
              document.querySelector(
                "form[action*='greenhouse' i], form[id*='application' i], form[class*='application' i], form[data-qa*='application' i], [id*='application_form' i], [data-qa*='job-application' i]",
              ),
            ) ||
            visibleFields.some((field) => field.name.toLowerCase().includes("job_application"));

          const submitButtonFound = Array.from(
            document.querySelectorAll("button, input[type='submit'], input[type='button']"),
          ).some((node) => {
            if (!(node instanceof HTMLElement)) return false;
            if (!isVisible(node)) return false;
            if (
              node.hasAttribute("disabled") ||
              node.getAttribute("aria-disabled") === "true"
            ) {
              return false;
            }

            const text = normalizeText(
              node instanceof HTMLInputElement
                ? node.value
                : node.textContent || node.getAttribute("aria-label"),
            ).toLowerCase();
            return SUBMIT_BUTTON_PATTERN.test(text);
          });

          const formDetected =
            visibleFields.length > 0 &&
            (formContainerFound || submitButtonFound || visibleFields.length >= 2);

          return {
            providerDetected: "greenhouse" as const,
            currentUrl: window.location.href,
            formContextUrl: window.location.href,
            usedFrame,
            formDetected,
            formContainerFound,
            visibleFieldCount: visibleFields.length,
            fillableFieldCount: fillableFields.length,
            requiredFieldCount: requiredFields.length,
            submitButtonFound,
            fields: visibleFields,
          };
        },
        { usedFrame: candidate.usedFrame },
      )
      .catch(() => null);

    if (!detection) {
      continue;
    }

    detections.push({
      context: candidate.context,
      detection,
    });
  }

  if (detections.length === 0) {
    return {
      context: page,
      detection: {
        providerDetected: "greenhouse",
        currentUrl: page.url(),
        formContextUrl: page.url(),
        usedFrame: false,
        formDetected: false,
        formContainerFound: false,
        visibleFieldCount: 0,
        fillableFieldCount: 0,
        requiredFieldCount: 0,
        submitButtonFound: false,
        fields: [],
      },
    };
  }

  detections.sort((left, right) => {
    const leftScore =
      (left.detection.formDetected ? 1000 : 0) +
      left.detection.fillableFieldCount * 20 +
      left.detection.visibleFieldCount * 10 +
      (left.detection.submitButtonFound ? 50 : 0) +
      (left.detection.formContainerFound ? 25 : 0);
    const rightScore =
      (right.detection.formDetected ? 1000 : 0) +
      right.detection.fillableFieldCount * 20 +
      right.detection.visibleFieldCount * 10 +
      (right.detection.submitButtonFound ? 50 : 0) +
      (right.detection.formContainerFound ? 25 : 0);
    return rightScore - leftScore;
  });

  return detections[0];
}

export async function detectGreenhouseApplicationForm(
  page: Page,
): Promise<GreenhouseApplicationFormDetection> {
  return (await chooseGreenhouseContext(page)).detection;
}

export async function fillGreenhouseApplicationForm(
  page: Page,
  payload: {
    values: Record<string, AnswerValue>;
    resumePath?: string | null;
    attemptedSelectors?: string[];
  },
): Promise<FillGreenhouseApplicationFormResult> {
  const initial = await chooseGreenhouseContext(page);
  const attemptedSelectors = payload.attemptedSelectors ?? [];

  if (!initial.detection.formDetected) {
    return {
      ...initial.detection,
      filledFieldCount: 0,
      missingRequiredFields: [],
      missingPayloadNames: [],
      resumeInputFound: false,
      resumeUploadAttempted: false,
      resumeUploadSucceeded: false,
    };
  }

  const context = initial.context;
  const missingPayloadNames: string[] = [];
  let filledFieldCount = 0;
  let resumeInputFound = false;
  let resumeUploadAttempted = false;
  let resumeUploadSucceeded = false;

  for (const [name, rawValue] of Object.entries(payload.values)) {
    const allowChoiceControls = shouldAllowChoiceControls(name, rawValue);
    const locator = await findMatchingLocator(context, name, attemptedSelectors, {
      allowChoiceControls,
    });
    if (!locator) {
      missingPayloadNames.push(name);
      continue;
    }

    const first = locator.first();
    const tagName = await readLocatorTagName(first);
    const inputType = tagName === "input" ? await readLocatorInputType(first) : "";
    const count = await locator.count().catch(() => 0);

    if (tagName === "select") {
      const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
      const normalizedValue = String(value ?? "").trim();
      if (!normalizedValue) continue;

      const currentValue = (await readLocatorValue(first)).trim();
      if (currentValue) continue;

      const selected = await first
        .selectOption({ value: normalizedValue })
        .catch(async () =>
          first
            .selectOption({ label: normalizedValue })
            .catch(() => [] as string[]),
        );
      if (selected.length > 0) {
        filledFieldCount += 1;
      }
      continue;
    }

    if (inputType === "checkbox") {
      const existingChoice = await hasSelectedChoice(locator);
      if (existingChoice) continue;

      const values = asArray(rawValue)
        .map((item) => item.toLowerCase().trim())
        .filter(Boolean);
      if (values.length === 0) continue;

      for (let index = 0; index < count; index += 1) {
        const checkbox = locator.nth(index);
        const elementValue = (
          (await checkbox.getAttribute("value").catch(() => null)) ?? ""
        )
          .toLowerCase()
          .trim();
        const labelText = (await extractLocatorText(checkbox))
          .toLowerCase()
          .trim();
        const shouldCheck = values.some(
          (value) =>
            value.length > 0 &&
            (elementValue === value || labelText.includes(value)),
        );
        if (!shouldCheck) continue;

        await checkbox.check().catch(() => undefined);
        filledFieldCount += 1;
      }
      continue;
    }

    if (inputType === "radio") {
      const existingChoice = await hasSelectedChoice(locator);
      if (existingChoice) continue;

      const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
      const normalizedValue = String(value ?? "").toLowerCase().trim();
      if (!normalizedValue) continue;

      for (let index = 0; index < count; index += 1) {
        const option = locator.nth(index);
        const optionValue = (
          (await option.getAttribute("value").catch(() => null)) ?? ""
        )
          .toLowerCase()
          .trim();
        const optionText = (await extractLocatorText(option))
          .toLowerCase()
          .trim();

        if (
          optionValue === normalizedValue ||
          optionText.includes(normalizedValue)
        ) {
          await option.check().catch(() => option.click().catch(() => undefined));
          filledFieldCount += 1;
          break;
        }
      }
      continue;
    }

    if (inputType === "file") {
      resumeInputFound = true;
      if (!payload.resumePath) continue;

      const existingValue = await readLocatorValue(first);
      if (existingValue === "__FILE_SELECTED__") continue;

      resumeUploadAttempted = true;
      const uploaded = await first
        .setInputFiles(payload.resumePath)
        .then(() => true)
        .catch(() => false);
      if (uploaded) {
        resumeUploadSucceeded = true;
        filledFieldCount += 1;
      }
      continue;
    }

    const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
    const normalizedValue = String(value ?? "").trim();
    if (!normalizedValue) continue;

    const currentValue = (await readLocatorValue(first)).trim();
    if (currentValue) continue;

    const filled = await first
      .fill(normalizedValue)
      .then(() => true)
      .catch(() => false);
    if (filled) {
      filledFieldCount += 1;
    }
  }

  if (payload.resumePath) {
    const fallbackFileInput = context.locator('input[type="file"]:visible').first();
    if ((await fallbackFileInput.count().catch(() => 0)) > 0) {
      resumeInputFound = true;
      const existingValue = await readLocatorValue(fallbackFileInput);
      if (existingValue !== "__FILE_SELECTED__") {
        resumeUploadAttempted = true;
        const uploaded = await fallbackFileInput
          .setInputFiles(payload.resumePath)
          .then(() => true)
          .catch(() => false);
        if (uploaded) {
          resumeUploadSucceeded = true;
          filledFieldCount += 1;
        }
      }
    }
  }

  const finalDetection = await chooseGreenhouseContext(page);
  const missingRequiredFields = [
    ...new Set(
      finalDetection.detection.fields
        .filter((field) => field.required && field.enabled && !field.filled)
        .map((field) => field.label || field.name || "Required field")
        .filter(Boolean),
    ),
  ];

  return {
    ...finalDetection.detection,
    filledFieldCount,
    missingRequiredFields,
    missingPayloadNames,
    resumeInputFound,
    resumeUploadAttempted,
    resumeUploadSucceeded,
  };
}
