import type { Frame, Page } from "playwright-core";
import type {
  FormFieldDescriptor,
  FormInputType,
} from "@/app/lib/apply/formIntelligence/types";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const GENERIC_FIELD_LABELS = new Set([
  "field",
  "input",
  "question",
  "required",
  "required field",
  "unlabeled field",
  "select",
  "select...",
  "search",
  "type to search",
  "choose",
  "choose...",
  "please select",
  "enter text",
  "start typing",
  "select a country",
]);

function isGenericFieldLabel(value: string | null | undefined) {
  const normalized = normalizeText(value)
    .replace(/\*+$/g, "")
    .replace(/[:：]+$/g, "")
    .toLowerCase();
  return !normalized || GENERIC_FIELD_LABELS.has(normalized);
}

function fallbackLabel(field: FormFieldDescriptor) {
  const candidates = [
    field.label,
    field.inferredLabel,
    field.ariaLabel,
    field.ariaLabelledByText,
    field.parentGroupText,
    field.nearbyText,
    field.fieldsetLegend,
    field.sectionHeading,
    field.name,
    field.idAttribute,
    field.placeholder,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized && !isGenericFieldLabel(normalized)) return normalized;
  }
  return normalizeText(field.label) || "Unlabeled field";
}

export async function scanFormContext(
  context: Page | Frame,
  pageTitle: string | undefined,
  frameUrl?: string,
): Promise<FormFieldDescriptor[]> {
  const fields = await context
    .evaluate(() => {
      type RawField = Omit<FormFieldDescriptor, "pageUrl" | "pageTitle">;

      function clean(value: string | null | undefined) {
        return String(value ?? "").replace(/\s+/g, " ").trim();
      }

      const genericLabels = new Set([
        "field",
        "input",
        "question",
        "required",
        "required field",
        "unlabeled field",
        "select",
        "select...",
        "search",
        "type to search",
        "choose",
        "choose...",
        "please select",
        "enter text",
        "start typing",
        "select a country",
      ]);

      function isGenericLabel(value: string | null | undefined) {
        const normalized = clean(value)
          .replace(/\*+$/g, "")
          .replace(/[:：]+$/g, "")
          .toLowerCase();
        return !normalized || genericLabels.has(normalized);
      }

      function readableName(value: string | null | undefined) {
        return clean(value)
          .replace(/^question[_-]?\d+/i, "")
          .replace(/[_-]+/g, " ")
          .replace(/\b\w/g, (match) => match.toUpperCase());
      }

      function extractQuestionLikeText(value: string | null | undefined) {
        const cleaned = clean(value)
          .replace(/\b(select\.\.\.|search|type to search|choose\.\.\.|please select|select a country)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!cleaned) return "";

        const location = cleaned.match(/(where are you (?:currently )?located\??\s*\*?)/i);
        if (location?.[1]) return clean(location[1]);

        const source = cleaned.match(/(how did you hear about (?:this|the) opportunity\??\s*\*?)/i);
        if (source?.[1]) return clean(source[1]);

        const explicitQuestion = cleaned.match(/([A-Z0-9][^?]{3,180}?\?\s*\*?)/);
        if (explicitQuestion?.[1] && !isGenericLabel(explicitQuestion[1])) {
          return clean(explicitQuestion[1]);
        }

        const countryOnly = cleaned.match(/\bcountry(?:\/region)?\b/i);
        if (countryOnly && /react-select|country-error|country-placeholder|required|\*/i.test(value ?? cleaned)) {
          return "Country";
        }

        if (cleaned.length > 1 && cleaned.length <= 180 && !isGenericLabel(cleaned)) {
          return cleaned;
        }
        return "";
      }

      function isVisible(element: Element) {
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

      function cssPath(element: Element) {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const name = element.getAttribute("name");
        if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;

        const parts: string[] = [];
        let current: Element | null = element;
        while (current && current.parentElement && parts.length < 5) {
          const tag = current.tagName.toLowerCase();
          const siblings = Array.from(current.parentElement.children).filter(
            (sibling) => sibling.tagName === current?.tagName,
          );
          const index = siblings.indexOf(current) + 1;
          parts.unshift(`${tag}:nth-of-type(${index})`);
          current = current.parentElement;
        }
        return parts.join(" > ");
      }

      function stableSelector(element: Element) {
        const id = clean(element.getAttribute("id"));
        if (id) return `#${CSS.escape(id)}`;
        const name = clean(element.getAttribute("name"));
        if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
        const aria = clean(element.getAttribute("aria-label"));
        if (aria) {
          return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
        }
        return undefined;
      }

      function textFromIds(ids: string | null) {
        return clean(
          String(ids ?? "")
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" "),
        );
      }

      function labelFor(element: HTMLElement) {
        const id = clean(element.getAttribute("id"));
        if (id) {
          const byFor = clean(document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent);
          if (byFor && !isGenericLabel(byFor)) return byFor;
        }

        const wrapping = clean(element.closest("label")?.textContent);
        if (wrapping && !isGenericLabel(wrapping)) return wrapping;

        const ariaLabelledBy = textFromIds(element.getAttribute("aria-labelledby"));
        if (ariaLabelledBy && !isGenericLabel(ariaLabelledBy)) return ariaLabelledBy;

        const aria = clean(element.getAttribute("aria-label"));
        if (aria && !isGenericLabel(aria)) return aria;

        const placeholder = clean(element.getAttribute("placeholder"));
        if (placeholder && !isGenericLabel(placeholder)) return placeholder;

        const previous = element.previousElementSibling;
        const previousText = clean(previous?.textContent);
        if (previousText && previousText.length < 160 && !isGenericLabel(previousText)) return previousText;

        return "";
      }

      function resolvedLabelFor(element: HTMLElement) {
        const sources: string[] = [];
        const id = clean(element.getAttribute("id"));
        const placeholder = clean(element.getAttribute("placeholder"));
        const ariaLabel = clean(element.getAttribute("aria-label"));
        const ariaLabelledByText = textFromIds(element.getAttribute("aria-labelledby"));
        const ariaDescribedByText = textFromIds(element.getAttribute("aria-describedby"));
        const groupText = parentGroupText(element);
        const near = nearbyText(element);

        if (id) {
          const byFor = clean(document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent);
          if (byFor && !isGenericLabel(byFor)) {
            return {
              label: byFor,
              confidence: "high" as const,
              sources: ["label_for"],
              ariaLabelledByText,
              ariaDescribedByText,
              parentGroupText: groupText,
              nearbyText: near,
            };
          }
        }

        const wrapping = clean(element.closest("label")?.textContent);
        if (wrapping && !isGenericLabel(wrapping)) {
          return {
            label: wrapping,
            confidence: "high" as const,
            sources: ["wrapping_label"],
            ariaLabelledByText,
            ariaDescribedByText,
            parentGroupText: groupText,
            nearbyText: near,
          };
        }

        if (ariaLabelledByText && !isGenericLabel(ariaLabelledByText)) {
          return {
            label: ariaLabelledByText,
            confidence: "high" as const,
            sources: ["aria_labelledby"],
            ariaLabelledByText,
            ariaDescribedByText,
            parentGroupText: groupText,
            nearbyText: near,
          };
        }

        if (ariaLabel && !isGenericLabel(ariaLabel)) {
          return {
            label: ariaLabel,
            confidence: "medium" as const,
            sources: ["aria_label"],
            ariaLabelledByText,
            ariaDescribedByText,
            parentGroupText: groupText,
            nearbyText: near,
          };
        }

        const groupQuestion = extractQuestionLikeText(groupText);
        if (groupQuestion) {
          sources.push("parent_group_text");
          return {
            label: groupQuestion,
            confidence: "medium" as const,
            sources,
            ariaLabelledByText,
            ariaDescribedByText,
            parentGroupText: groupText,
            nearbyText: near,
          };
        }

        const describedQuestion = extractQuestionLikeText(ariaDescribedByText);
        if (describedQuestion) {
          return {
            label: describedQuestion,
            confidence: "low" as const,
            sources: ["aria_describedby"],
            ariaLabelledByText,
            ariaDescribedByText,
            parentGroupText: groupText,
            nearbyText: near,
          };
        }

        const previous = element.previousElementSibling;
        const previousText = extractQuestionLikeText(previous?.textContent);
        if (previousText) {
          return {
            label: previousText,
            confidence: "low" as const,
            sources: ["preceding_sibling"],
            ariaLabelledByText,
            ariaDescribedByText,
            parentGroupText: groupText,
            nearbyText: near,
          };
        }

        const nameLabel = readableName(element.getAttribute("name")) || readableName(id);
        if (nameLabel && !isGenericLabel(nameLabel)) {
          return {
            label: nameLabel,
            confidence: "low" as const,
            sources: ["name_or_id"],
            ariaLabelledByText,
            ariaDescribedByText,
            parentGroupText: groupText,
            nearbyText: near,
          };
        }

        if (placeholder && !isGenericLabel(placeholder)) {
          return {
            label: placeholder,
            confidence: "low" as const,
            sources: ["placeholder"],
            ariaLabelledByText,
            ariaDescribedByText,
            parentGroupText: groupText,
            nearbyText: near,
          };
        }

        return {
          label: "",
          confidence: "low" as const,
          sources: [] as string[],
          ariaLabelledByText,
          ariaDescribedByText,
          parentGroupText: groupText,
          nearbyText: near,
        };
      }

      function nearbyText(element: HTMLElement) {
        const container = element.closest(
          "li, fieldset, label, .field, .form-field, .question, .application-question, [class*='field' i], [class*='question' i], [data-qa], [data-testid], div",
        );
        const text = clean(container?.textContent);
        return text.length > 500 ? text.slice(0, 500) : text;
      }

      function parentGroupText(element: HTMLElement) {
        const container = element.closest(
          "li, fieldset, .field, .form-field, .question, .application-question, [class*='field' i], [class*='question' i], [data-qa], [data-testid], div",
        );
        const text = clean(container?.textContent);
        return text.length > 500 ? text.slice(0, 500) : text;
      }

      function sectionHeading(element: HTMLElement) {
        const root = element.closest("section, fieldset, form, main, body") ?? document.body;
        const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,legend"));
        const ownTop = element.getBoundingClientRect().top;
        let best = "";
        let bestTop = Number.NEGATIVE_INFINITY;
        for (const heading of headings) {
          if (!(heading instanceof HTMLElement) || !isVisible(heading)) continue;
          const top = heading.getBoundingClientRect().top;
          if (top <= ownTop && top > bestTop) {
            best = clean(heading.textContent);
            bestTop = top;
          }
        }
        return best;
      }

      function errorText(element: HTMLElement) {
        const describedBy = textFromIds(element.getAttribute("aria-describedby"));
        if (/error|required|invalid/i.test(describedBy)) return describedBy;
        const container = element.closest("li, .field, .form-field, .question, div");
        const candidate = clean(
          container?.querySelector(
            "[role='alert'], .error, .field-error, [class*='error' i], [data-testid*='error' i]",
          )?.textContent,
        );
        return candidate;
      }

      function inputType(element: Element): FormInputType {
        if (
          element instanceof HTMLElement &&
          (element.isContentEditable || element.getAttribute("role") === "textbox")
        ) {
          return "textarea";
        }
        if (element instanceof HTMLElement && element.getAttribute("role") === "combobox") {
          return "text";
        }
        if (element instanceof HTMLTextAreaElement) return "textarea";
        if (element instanceof HTMLSelectElement) return "select";
        if (element instanceof HTMLInputElement) {
          const type = (element.type || "text").toLowerCase();
          if (
            [
              "text",
              "email",
              "tel",
              "url",
              "number",
              "date",
              "radio",
              "checkbox",
              "file",
              "hidden",
            ].includes(type)
          ) {
            return type as FormInputType;
          }
        }
        return "unknown";
      }

      function isRequired(element: HTMLElement, label: string, nearby: string) {
        return (
          element.hasAttribute("required") ||
          element.getAttribute("aria-required") === "true" ||
          element.getAttribute("data-required") === "true" ||
          /\*/.test(label) ||
          /\brequired\b/i.test(nearby)
        );
      }

      function optionsFor(element: Element, selector: string) {
        if (element instanceof HTMLSelectElement) {
          return Array.from(element.options).map((option, index) => ({
            label: clean(option.textContent),
            value: option.value,
            selector: `${selector} option:nth-of-type(${index + 1})`,
          }));
        }

        if (element instanceof HTMLInputElement && element.type === "radio") {
          const name = element.name;
          const radios = name
            ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`))
            : [element];
          return radios.map((radio) => {
            const radioElement = radio as HTMLInputElement;
            const radioLabel = labelFor(radioElement) || nearbyText(radioElement);
            return {
              label: clean(radioLabel || radioElement.value),
              value: radioElement.value,
              selector: cssPath(radioElement),
            };
          });
        }

        return undefined;
      }

      const controls = Array.from(
        document.querySelectorAll(
          "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox']",
        ),
      );
      const seenRadioNames = new Set<string>();
      const result: RawField[] = [];

      controls.forEach((control, index) => {
        if (!(control instanceof HTMLElement)) return;
        const type = inputType(control);
        const name = clean(control.getAttribute("name"));
        if (type === "radio" && name) {
          if (seenRadioNames.has(name)) return;
          seenRadioNames.add(name);
        }

        const selector = cssPath(control);
        const visible = isVisible(control);
        const label = labelFor(control);
        const resolvedLabel = resolvedLabelFor(control);
        const nearby = nearbyText(control);
        const inferredLabel =
          resolvedLabel.label ||
          label ||
          clean(control.getAttribute("aria-label")) ||
          name ||
          clean(control.getAttribute("id")) ||
          clean(control.getAttribute("placeholder")) ||
          nearby;

        result.push({
          id: `field_${index}_${type}_${name || clean(control.getAttribute("id")) || "control"}`,
          selector,
          stableSelector: stableSelector(control),
          label: clean(resolvedLabel.label || inferredLabel || "Unlabeled field"),
          inferredLabel: clean(inferredLabel),
          labelConfidence: resolvedLabel.confidence,
          labelSources: resolvedLabel.sources,
          inputType: type,
          required: isRequired(control, resolvedLabel.label || label, nearby),
          disabled:
            control.hasAttribute("disabled") ||
            control.getAttribute("aria-disabled") === "true",
          visible,
          placeholder: clean(control.getAttribute("placeholder")) || undefined,
          tagName: control.tagName,
          name: name || undefined,
          ariaLabel: clean(control.getAttribute("aria-label")) || undefined,
          ariaLabelledByText: resolvedLabel.ariaLabelledByText || undefined,
          ariaDescribedByText: resolvedLabel.ariaDescribedByText || undefined,
          roleAttribute: clean(control.getAttribute("role")) || undefined,
          idAttribute: clean(control.getAttribute("id")) || undefined,
          inputMode: clean(control.getAttribute("inputmode")) || undefined,
          autocomplete: clean(control.getAttribute("autocomplete")) || undefined,
          options: optionsFor(control, selector),
          maxLength:
            control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
              ? control.maxLength > 0
                ? control.maxLength
                : undefined
              : undefined,
          minLength:
            control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
              ? control.minLength > 0
                ? control.minLength
                : undefined
              : undefined,
          validationText:
            "validationMessage" in control
              ? clean((control as HTMLInputElement).validationMessage) || undefined
              : undefined,
          nearbyText: nearby || undefined,
          parentGroupText: resolvedLabel.parentGroupText || undefined,
          sectionHeading: sectionHeading(control) || undefined,
          fieldsetLegend: clean(control.closest("fieldset")?.querySelector("legend")?.textContent) || undefined,
          errorText: errorText(control) || undefined,
        });
      });

      return result;
    })
    .catch(() => [] as Array<Omit<FormFieldDescriptor, "pageUrl" | "pageTitle">>);

  const pageUrl = context.url();
  const resolvedFields = fields.map((field) => ({
    ...field,
    label: fallbackLabel({ ...field, pageUrl, pageTitle }),
    frameUrl,
    pageUrl,
    pageTitle,
  }));

  for (const field of resolvedFields) {
    if (!field.required) continue;
    const lowConfidence =
      field.labelConfidence === "low" ||
      isGenericFieldLabel(field.label) ||
      field.label === "Unlabeled field";
    if (!lowConfidence && !field.labelSources?.includes("parent_group_text")) continue;
    console.log("[AI_FORM_LABEL_RESOLUTION]", {
      rawLabel: field.inferredLabel ?? field.label,
      resolvedLabel: field.label,
      confidence: field.labelConfidence ?? "low",
      sources: field.labelSources ?? [],
      placeholder: field.placeholder ?? null,
      fieldName: field.name ?? null,
      fieldId: field.idAttribute ?? null,
      parentGroupText: field.parentGroupText ?? null,
      nearbyText: field.nearbyText ? [field.nearbyText] : [],
    });
  }

  return resolvedFields;
}

export async function scanCurrentForm(
  page: Page,
): Promise<FormFieldDescriptor[]> {
  const pageTitle = await page.title().catch(() => undefined);
  const mainFields = await scanFormContext(page, pageTitle);
  const frameFields = (
    await Promise.all(
      page
        .frames()
        .filter((frame) => frame !== page.mainFrame())
        .map((frame) => scanFormContext(frame, pageTitle, frame.url())),
    )
  ).flat();

  return [...mainFields, ...frameFields];
}
