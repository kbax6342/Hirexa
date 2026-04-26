import type { Frame, Page } from "playwright-core";
import type {
  FormFieldDescriptor,
  FormInputType,
} from "@/app/lib/apply/formIntelligence/types";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function fallbackLabel(field: FormFieldDescriptor) {
  return (
    normalizeText(field.label) ||
    normalizeText(field.inferredLabel) ||
    normalizeText(field.ariaLabel) ||
    normalizeText(field.placeholder) ||
    normalizeText(field.name) ||
    normalizeText(field.idAttribute) ||
    normalizeText(field.nearbyText) ||
    "Unlabeled field"
  );
}

async function scanFormContext(
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
          if (byFor) return byFor;
        }

        const wrapping = clean(element.closest("label")?.textContent);
        if (wrapping) return wrapping;

        const ariaLabelledBy = textFromIds(element.getAttribute("aria-labelledby"));
        if (ariaLabelledBy) return ariaLabelledBy;

        const aria = clean(element.getAttribute("aria-label"));
        if (aria) return aria;

        const placeholder = clean(element.getAttribute("placeholder"));
        if (placeholder) return placeholder;

        const previous = element.previousElementSibling;
        const previousText = clean(previous?.textContent);
        if (previousText && previousText.length < 160) return previousText;

        return "";
      }

      function nearbyText(element: HTMLElement) {
        const container = element.closest(
          "li, fieldset, label, .field, .form-field, .question, .application-question, [data-qa], [data-testid], div",
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
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
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
        const nearby = nearbyText(control);
        const inferredLabel =
          label ||
          clean(control.getAttribute("aria-label")) ||
          clean(control.getAttribute("placeholder")) ||
          name ||
          clean(control.getAttribute("id")) ||
          nearby;

        result.push({
          id: `field_${index}_${type}_${name || clean(control.getAttribute("id")) || "control"}`,
          selector,
          stableSelector: stableSelector(control),
          label: clean(label || inferredLabel || "Unlabeled field"),
          inferredLabel: clean(inferredLabel),
          inputType: type,
          required: isRequired(control, label, nearby),
          disabled:
            control.hasAttribute("disabled") ||
            control.getAttribute("aria-disabled") === "true",
          visible,
          placeholder: clean(control.getAttribute("placeholder")) || undefined,
          name: name || undefined,
          ariaLabel: clean(control.getAttribute("aria-label")) || undefined,
          idAttribute: clean(control.getAttribute("id")) || undefined,
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
          sectionHeading: sectionHeading(control) || undefined,
          fieldsetLegend: clean(control.closest("fieldset")?.querySelector("legend")?.textContent) || undefined,
          errorText: errorText(control) || undefined,
        });
      });

      return result;
    })
    .catch(() => [] as Array<Omit<FormFieldDescriptor, "pageUrl" | "pageTitle">>);

  const pageUrl = context.url();
  return fields.map((field) => ({
    ...field,
    label: fallbackLabel({ ...field, pageUrl, pageTitle }),
    frameUrl,
    pageUrl,
    pageTitle,
  }));
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
