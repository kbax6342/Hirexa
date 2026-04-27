import type { Frame, Page } from "playwright-core";
import {
  scanCurrentForm,
  scanFormContext,
} from "@/app/lib/apply/formIntelligence/formScanner";
import type { FormFieldDescriptor } from "@/app/lib/apply/formIntelligence/types";

export type MappedApplicationFieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "contenteditable"
  | "location_dropdown"
  | "location_group"
  | "unknown";

export type MappedApplicationFieldKind =
  | "phone_number_input"
  | "phone_country_code_select"
  | "phone_country_search_input"
  | "phone_country_code_search_internal"
  | "profile_location_field"
  | "country_dropdown_field"
  | "location_search_internal"
  | "generic_text_input"
  | "hidden_or_token_field"
  | "recaptcha_token"
  | "unknown_required_field"
  | "standard_field";

export type MappedApplicationField = {
  fieldId: string;
  fingerprint: string;
  label: string;
  normalizedLabel: string;
  type: MappedApplicationFieldType;
  fieldKind: MappedApplicationFieldKind;
  groupLabel?: string;
  required: boolean;
  visible: boolean;
  disabled: boolean;
  currentValue: string | null;
  options?: string[];
  selectorHints: string[];
  controls?: Array<{
    label: string;
    type: string;
    role?: string;
    selector?: string;
  }>;
  sourceHints: {
    labelText?: string;
    ariaLabel?: string;
    role?: string;
    tagName?: string;
    placeholder?: string;
    name?: string;
    id?: string;
    inputMode?: string;
    ariaDescribedByText?: string;
    nearbyText?: string;
    parentText?: string;
    legendText?: string;
    sectionHeading?: string;
  };
  confidence: "high" | "medium" | "low";
  descriptor?: FormFieldDescriptor;
};

const WEAK_LABELS = new Set([
  "",
  "field",
  "input",
  "question",
  "required",
  "required field",
  "unlabeled field",
  "select",
  "select...",
  "search",
  "text control",
]);

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeApplicationFieldLabel(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
}

function isWeakLabel(value: unknown) {
  return WEAK_LABELS.has(clean(value).toLowerCase());
}

function conciseQuestion(value: unknown) {
  const normalized = clean(value)
    .replace(/\b(required|\*)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length > 240) return "";
  return normalized;
}

function combinedFieldText(field: FormFieldDescriptor) {
  return [
    field.label,
    field.inferredLabel,
    field.ariaLabel,
    field.placeholder,
    field.name,
    field.idAttribute,
    field.inputMode,
    field.autocomplete,
    field.roleAttribute,
    field.fieldsetLegend,
    field.sectionHeading,
    field.nearbyText,
    field.selector,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function directFieldText(field: FormFieldDescriptor, proposedLabel?: string) {
  return [
    proposedLabel,
    field.label,
    field.inferredLabel,
    field.ariaLabel,
    field.placeholder,
    field.name,
    field.idAttribute,
    field.inputMode,
    field.autocomplete,
    field.roleAttribute,
    field.selector,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isSecurityTokenField(field: FormFieldDescriptor) {
  return /(g-recaptcha-response|recaptcha|hcaptcha|cf-turnstile|turnstile|captcha|security.?token)/i.test(
    combinedFieldText(field),
  );
}

function isTextareaField(field: FormFieldDescriptor) {
  return field.inputType === "textarea" || clean(field.tagName).toUpperCase() === "TEXTAREA";
}

function isGreenhouseQuestionField(field: FormFieldDescriptor) {
  return /(?:^|[\W_])question[_-]?\d+/i.test(
    [field.name, field.idAttribute, field.selector].map(clean).join(" "),
  );
}

const OPEN_ENDED_PROMPT_RE =
  /\b(why|describe|hardest|worked on|opportunity|how did you hear|tell us|good fit|interested|located|project|experience)\b/i;

function hasOpenEndedPromptText(field: FormFieldDescriptor, proposedLabel?: string) {
  return OPEN_ENDED_PROMPT_RE.test(
    [
      proposedLabel,
      field.label,
      field.inferredLabel,
      field.ariaLabel,
      field.placeholder,
      field.nearbyText,
      field.fieldsetLegend,
      field.sectionHeading,
    ]
      .map(clean)
      .filter(Boolean)
      .join(" "),
  );
}

function isPhoneCountrySearchInternal(field: FormFieldDescriptor, proposedLabel?: string) {
  const direct = directFieldText(field, proposedLabel);
  const selector = clean(field.selector).toLowerCase();
  const role = clean(field.roleAttribute).toLowerCase();
  const searchish = /\b(search|combobox|dropdown)\b/i.test(direct) || role === "combobox";
  const countryCodeish = /(phone country|country code|calling code|dial code|phone code|\+\d)/i.test(direct);
  return (
    /iti-[\w-]*__search-input|iti__search-input|country-listbox|country.*search/i.test(selector) ||
    (searchish && countryCodeish && field.inputType !== "select")
  );
}

function isPhoneCountryCodeSelect(field: FormFieldDescriptor, proposedLabel?: string) {
  const direct = directFieldText(field, proposedLabel);
  return (
    field.inputType === "select" &&
    /(phone country|country code|calling code|dial code|phone code|\+\d)/i.test(direct)
  );
}

function isCountryOrLocationDropdown(field: FormFieldDescriptor, proposedLabel?: string) {
  const direct = directFieldText(field, proposedLabel);
  const all = [combinedFieldText(field), proposedLabel].join(" ");
  if (/(phone country|country code|calling code|dial code|phone code|\+\d)/i.test(all)) {
    return false;
  }
  const countryOrLocation = /\b(country|country\/region|current location|where are you located|where.*based|location)\b/i.test(
    all,
  );
  const dropdownish =
    field.inputType === "select" ||
    clean(field.roleAttribute).toLowerCase() === "combobox" ||
    /\b(search|select|select\.\.\.|dropdown|combobox)\b/i.test(direct);
  return countryOrLocation && dropdownish;
}

function isProfileLocationField(field: FormFieldDescriptor, proposedLabel?: string) {
  const all = [combinedFieldText(field), proposedLabel].join(" ");
  if (/(phone country|country code|calling code|dial code|phone code|\+\d)/i.test(all)) {
    return false;
  }
  return /\b(where are you located|where.*currently located|where.*based|current location|location|city|state|province|country|country\/region)\b/i.test(
    all,
  );
}

function isStrictPhoneNumberInput(field: FormFieldDescriptor, proposedLabel?: string) {
  if (
    isSecurityTokenField(field) ||
    field.inputType === "hidden" ||
    field.visible === false ||
    isTextareaField(field)
  ) {
    return false;
  }

  const direct = directFieldText(field, proposedLabel);
  if (isGreenhouseQuestionField(field) && !/\b(phone|telephone|mobile|cell)\b/i.test(direct)) {
    return false;
  }
  if (hasOpenEndedPromptText(field, proposedLabel)) {
    return false;
  }
  if (field.inputType === "tel") return true;
  if (/^tel/.test(clean(field.autocomplete).toLowerCase())) return true;

  const nameOrId = [field.name, field.idAttribute].map(clean).join(" ").toLowerCase();
  const normalizedNameOrId = nameOrId.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (
    /^(phone|phone_number|candidate_phone|candidate_phone_number|job_application_phone)$/.test(
      normalizedNameOrId,
    ) ||
    /\b(candidate|applicant|job_application)\b.*\bphone(_number)?\b/i.test(normalizedNameOrId)
  ) {
    return true;
  }

  const inputMode = clean(field.inputMode).toLowerCase();
  return (
    (inputMode === "tel" || inputMode === "numeric") &&
    /\b(phone|telephone|mobile|cell)\b/i.test(direct)
  );
}

function inferFieldKind(
  field: FormFieldDescriptor,
  proposedLabel?: string,
): MappedApplicationFieldKind {
  const text = [combinedFieldText(field), proposedLabel].join(" ").toLowerCase();
  if (isSecurityTokenField(field)) {
    return /recaptcha|g-recaptcha-response|captcha/i.test(text)
      ? "recaptcha_token"
      : "hidden_or_token_field";
  }
  if (field.inputType === "hidden" || field.visible === false) {
    return "hidden_or_token_field";
  }

  if (isPhoneCountrySearchInternal(field, proposedLabel)) {
    return "phone_country_code_search_internal";
  }
  if (isPhoneCountryCodeSelect(field, proposedLabel)) return "phone_country_code_select";
  if (isStrictPhoneNumberInput(field, proposedLabel)) {
    console.log("[AUTO_APPLY_FIELD_MAP_STRICT_PHONE]", {
      fieldId: field.id,
      tagName: field.tagName ?? null,
      inputType: field.inputType,
      name: field.name ?? null,
      id: field.idAttribute ?? null,
      autocomplete: field.autocomplete ?? null,
      inputMode: field.inputMode ?? null,
      proposedLabel: proposedLabel ?? field.label,
      reason:
        field.inputType === "tel"
          ? "input_type_tel"
          : /^tel/.test(clean(field.autocomplete).toLowerCase())
            ? "autocomplete_tel"
            : "strict_phone_name_or_inputmode",
    });
    return "phone_number_input";
  }
  if (isCountryOrLocationDropdown(field, proposedLabel)) {
    return "country_dropdown_field";
  }
  if (
    isProfileLocationField(field, proposedLabel) &&
    /\b(search|select|combobox)\b/i.test(directFieldText(field, proposedLabel))
  ) {
    return "location_search_internal";
  }
  if (isProfileLocationField(field, proposedLabel)) {
    return "profile_location_field";
  }
  if (field.required && isWeakLabel(proposedLabel || field.label)) {
    return "unknown_required_field";
  }
  if (field.inputType === "text") return "generic_text_input";
  return "standard_field";
}

function readableKindLabel(kind: MappedApplicationFieldKind) {
  switch (kind) {
    case "phone_number_input":
      return "Phone number";
    case "phone_country_code_select":
      return "Phone country code";
    case "phone_country_search_input":
    case "phone_country_code_search_internal":
      return "Phone country search";
    case "country_dropdown_field":
      return "Country";
    case "location_search_internal":
      return "Location search";
    case "profile_location_field":
      return "Location";
    case "recaptcha_token":
      return "Security verification token";
    case "hidden_or_token_field":
      return "Hidden token field";
    case "unknown_required_field":
      return "Unlabeled required field";
    default:
      return "";
  }
}

function repairLabel(field: FormFieldDescriptor) {
  const initialKind = inferFieldKind(field, field.label);
  const kindLabel = readableKindLabel(initialKind);
  const canRepairFromSemanticKind =
    initialKind === "phone_number_input" ||
    initialKind === "phone_country_code_select" ||
    initialKind === "phone_country_code_search_internal" ||
    initialKind === "country_dropdown_field" ||
    initialKind === "profile_location_field" ||
    initialKind === "recaptcha_token" ||
    initialKind === "hidden_or_token_field";
  if (
    kindLabel &&
    initialKind !== "unknown_required_field" &&
    canRepairFromSemanticKind &&
    isWeakLabel(field.label)
  ) {
    if (isWeakLabel(field.label)) {
      console.log("[AUTO_APPLY_FIELD_MAP] weak label repaired safely", {
        originalLabel: field.label,
        repairedLabel: kindLabel,
        fieldId: field.id,
        fieldKind: initialKind,
        tagName: field.tagName ?? null,
        type: field.inputType,
        confidence: initialKind === "phone_number_input" ? "high" : "medium",
        repairReason: "high_confidence_semantic_field_kind",
        source: "semanticFieldKind",
      });
    }
    return kindLabel;
  }

  const candidates = [
    field.label,
    field.inferredLabel,
    field.ariaLabel,
    field.placeholder,
    field.fieldsetLegend,
    field.sectionHeading,
    field.nearbyText,
    field.name,
    field.idAttribute,
  ];

  for (const candidate of candidates) {
    const repaired = conciseQuestion(candidate);
    if (repaired && !isWeakLabel(repaired)) {
      const repairedKind = inferFieldKind(field, repaired);
      if (
        isWeakLabel(field.label) &&
        isGreenhouseQuestionField(field) &&
        /^phone( number)?$/i.test(repaired) &&
        !isStrictPhoneNumberInput(field, repaired)
      ) {
        console.log("[AUTO_APPLY_FIELD_REPAIR_SKIPPED]", {
          originalLabel: field.label,
          candidateLabel: repaired,
          fieldId: field.id,
          tagName: field.tagName ?? null,
          type: field.inputType,
          name: field.name ?? null,
          id: field.idAttribute ?? null,
          fieldKind: repairedKind,
          confidence: "low",
          repairReason: "greenhouse_question_field_not_strict_phone",
        });
        continue;
      }
      if (
        isWeakLabel(field.label) &&
        isTextareaField(field) &&
        repairedKind === "phone_number_input"
      ) {
        console.log("[AUTO_APPLY_FIELD_REPAIR_SKIPPED]", {
          originalLabel: field.label,
          candidateLabel: repaired,
          fieldId: field.id,
          tagName: field.tagName ?? null,
          type: field.inputType,
          fieldKind: repairedKind,
          confidence: "low",
          repairReason: "textarea_never_phone_number_input",
        });
        continue;
      }
      if (
        isWeakLabel(field.label) &&
        /^phone$/i.test(repaired) &&
        repairedKind !== "phone_number_input"
      ) {
        console.log("[AUTO_APPLY_FIELD_MAP] weak label repair skipped", {
          originalLabel: field.label,
          candidateLabel: repaired,
          fieldId: field.id,
          fieldKind: repairedKind,
          tagName: field.tagName ?? null,
          type: field.inputType,
          confidence: "low",
          repairReason: "ambiguous_duplicate_phone_group_control",
          reason: "Ambiguous duplicate phone-group control.",
        });
        continue;
      }
      if (isWeakLabel(field.label) && repaired !== field.label) {
        console.log("[AUTO_APPLY_FIELD_MAP] weak label repaired safely", {
          originalLabel: field.label,
          repairedLabel: repaired,
          fieldId: field.id,
          tagName: field.tagName ?? null,
          type: field.inputType,
          name: field.name ?? null,
          id: field.idAttribute ?? null,
          fieldKind: repairedKind,
          confidence: isGreenhouseQuestionField(field) || hasOpenEndedPromptText(field, repaired)
            ? "medium"
            : "low",
          repairReason: "nearest_available_label_metadata",
          source: candidate === field.nearbyText ? "nearbyText" : "fieldMetadata",
        });
      }
      return repaired;
    }
  }

  return "Unlabeled required field";
}

function mapType(field: FormFieldDescriptor): MappedApplicationFieldType {
  if (field.inputType === "hidden") return "unknown";
  if (field.inputType === "email" || field.inputType === "tel" || field.inputType === "url") {
    return "text";
  }
  if (
    field.inputType === "textarea" &&
    (field.selector.includes("contenteditable") || field.selector.includes("[role="))
  ) {
    return "contenteditable";
  }
  if (
    field.inputType === "text" ||
    field.inputType === "number" ||
    field.inputType === "date"
  ) {
    return "text";
  }
  if (
    field.inputType === "textarea" ||
    field.inputType === "select" ||
    field.inputType === "radio" ||
    field.inputType === "checkbox" ||
    field.inputType === "file"
  ) {
    return field.inputType;
  }
  return "unknown";
}

function controlSummary(field: MappedApplicationField) {
  return {
    label: field.label,
    type: field.type,
    role: field.sourceHints.role,
    selector: field.selectorHints[0],
  };
}

function isPhoneCountryControl(field: MappedApplicationField) {
  return (
    field.fieldKind === "phone_country_code_select" ||
    field.fieldKind === "phone_country_search_input" ||
    field.fieldKind === "phone_country_code_search_internal" ||
    /\b(phone country|country code|calling code|dial code|phone code|\+\d)\b/i.test(
      [
        field.label,
        field.groupLabel,
        field.sourceHints.ariaLabel,
        field.sourceHints.placeholder,
        field.sourceHints.name,
        field.sourceHints.id,
        field.sourceHints.nearbyText,
      ]
        .map(clean)
        .filter(Boolean)
        .join(" "),
    )
  );
}

function isLocationPrimary(field: MappedApplicationField) {
  if (isPhoneCountryControl(field)) return false;
  return (
    field.fieldKind === "profile_location_field" ||
    field.fieldKind === "country_dropdown_field" ||
    /\b(where are you located|where.*based|current location|country\/region|country|location)\b/i.test(
      [field.label, field.groupLabel, field.sourceHints.nearbyText, field.sourceHints.labelText]
        .map(clean)
        .filter(Boolean)
        .join(" "),
    )
  );
}

function isLocationAuxControl(field: MappedApplicationField) {
  if (isPhoneCountryControl(field)) return false;
  const label = clean(field.label).toLowerCase();
  const placeholder = clean(field.sourceHints.placeholder).toLowerCase();
  return (
    field.fieldKind === "location_search_internal" ||
    ((label === "search" ||
      label === "select" ||
      label === "select..." ||
      placeholder === "search" ||
      placeholder === "select" ||
      placeholder === "select...") &&
      (field.type === "text" ||
        field.type === "location_dropdown" ||
        field.sourceHints.role === "combobox"))
  );
}

function groupLocationFields(fields: MappedApplicationField[]) {
  const consumed = new Set<number>();
  const grouped: MappedApplicationField[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    if (consumed.has(index)) continue;
    const field = fields[index];
    if (!isLocationPrimary(field)) {
      grouped.push(field);
      continue;
    }

    const controls = [...(field.controls ?? [controlSummary(field)])];
    const selectorHints = new Set(field.selectorHints);
    const required = field.required;
    let groupedAny = field.type === "location_dropdown";
    let currentValue = field.currentValue;

    for (
      let candidateIndex = index + 1;
      candidateIndex < Math.min(fields.length, index + 4);
      candidateIndex += 1
    ) {
      const candidate = fields[candidateIndex];
      if (consumed.has(candidateIndex)) continue;
      if (!isLocationAuxControl(candidate)) {
        if (!isWeakLabel(candidate.label)) break;
        continue;
      }

      consumed.add(candidateIndex);
      groupedAny = true;
      currentValue = currentValue || candidate.currentValue;
      for (const selector of candidate.selectorHints) selectorHints.add(selector);
      controls.push(controlSummary(candidate));
      console.log("[AUTO_APPLY_LOCATION] detected location field group", {
        label: field.label,
        groupedControlLabel: candidate.label,
        groupedControlRole: candidate.sourceHints.role ?? null,
        groupedControlType: candidate.type,
        fieldId: field.fieldId,
        controlFieldId: candidate.fieldId,
      });
    }

    grouped.push(
      groupedAny
        ? {
            ...field,
            type: "location_dropdown",
            fieldKind:
              field.fieldKind === "country_dropdown_field"
                ? "country_dropdown_field"
                : "profile_location_field",
            required,
            currentValue,
            selectorHints: Array.from(selectorHints),
            controls,
          }
        : field,
    );
  }

  return grouped;
}

function fingerprintFor(field: FormFieldDescriptor, label: string) {
  return [
    normalizeApplicationFieldLabel(label),
    field.inputType,
    normalizeApplicationFieldLabel(field.name),
    normalizeApplicationFieldLabel(field.idAttribute),
    field.options?.map((option) => normalizeApplicationFieldLabel(option.label)).join("_"),
  ]
    .filter(Boolean)
    .join(":")
    .slice(0, 280);
}

function locatorForDescriptor(pageOrFrame: Page | Frame, field: FormFieldDescriptor) {
  const maybePage = pageOrFrame as Page;
  if (typeof maybePage.frames === "function") {
    const frame = field.frameUrl
      ? maybePage.frames().find((candidate) => candidate.url() === field.frameUrl)
      : null;
    return (frame ?? maybePage).locator(field.selector).first();
  }
  return pageOrFrame.locator(field.selector).first();
}

async function readCurrentValue(pageOrFrame: Page | Frame, field: FormFieldDescriptor) {
  return locatorForDescriptor(pageOrFrame, field)
    .evaluate((element) => {
      if (element instanceof HTMLInputElement) {
        if (element.type === "file") return element.files?.[0]?.name ?? "";
        if (element.type === "checkbox" || element.type === "radio") {
          return element.checked ? element.value || "checked" : "";
        }
        return element.value ?? "";
      }
      if (element instanceof HTMLTextAreaElement) return element.value ?? "";
      if (element instanceof HTMLSelectElement) {
        return element.value || "";
      }
      if (element instanceof HTMLElement) {
        return element.innerText?.trim() || element.textContent?.trim() || "";
      }
      return "";
    })
    .catch(() => "");
}

export async function mapApplicationFields(
  pageOrFrame: Page | Frame,
): Promise<MappedApplicationField[]> {
  const maybePage = pageOrFrame as Page;
  const descriptors =
    typeof maybePage.frames === "function"
      ? await scanCurrentForm(maybePage)
      : await scanFormContext(pageOrFrame as Frame, undefined, pageOrFrame.url());

  const mapped: MappedApplicationField[] = [];
  for (const descriptor of descriptors) {
    const label = repairLabel(descriptor);
    const fieldKind = inferFieldKind(descriptor, label);
    const normalizedLabel = normalizeApplicationFieldLabel(label);
    const selectorHints = [
      descriptor.stableSelector,
      descriptor.selector,
      descriptor.name ? `[name="${descriptor.name}"]` : "",
      descriptor.idAttribute ? `#${descriptor.idAttribute}` : "",
    ].filter(Boolean) as string[];
    const currentValue = clean(await readCurrentValue(pageOrFrame, descriptor)) || null;
    const confidence =
      !isWeakLabel(label) && (descriptor.stableSelector || descriptor.ariaLabel)
        ? "high"
        : !isWeakLabel(label)
          ? "medium"
          : "low";

    const mappedType =
      fieldKind === "country_dropdown_field" || fieldKind === "location_search_internal"
        ? "location_dropdown"
        : mapType(descriptor);
    mapped.push({
      fieldId: descriptor.id,
      fingerprint: fingerprintFor(descriptor, label),
      label,
      normalizedLabel,
      type: mappedType,
      fieldKind,
      groupLabel: descriptor.fieldsetLegend ?? descriptor.sectionHeading,
      required: descriptor.required,
      visible: descriptor.visible,
      disabled: descriptor.disabled,
      currentValue,
      options: descriptor.options?.map((option) => clean(option.label || option.value)),
      selectorHints,
      controls:
        fieldKind === "country_dropdown_field" || fieldKind === "location_search_internal"
          ? [
              {
                label: label,
                type:
                  descriptor.roleAttribute ??
                  descriptor.inputType ??
                  descriptor.tagName ??
                  "dropdown",
                role: descriptor.roleAttribute,
                selector: descriptor.stableSelector ?? descriptor.selector,
              },
            ]
          : undefined,
      sourceHints: {
        labelText: descriptor.label,
        ariaLabel: descriptor.ariaLabel,
        role: descriptor.roleAttribute,
        tagName: descriptor.tagName,
        placeholder: descriptor.placeholder,
        name: descriptor.name,
        id: descriptor.idAttribute,
        inputMode: descriptor.inputMode,
        ariaDescribedByText: descriptor.errorText,
        nearbyText: descriptor.nearbyText,
        parentText: descriptor.nearbyText,
        legendText: descriptor.fieldsetLegend,
        sectionHeading: descriptor.sectionHeading,
      },
      confidence,
      descriptor,
    });
  }

  const groupedMapped = groupLocationFields(mapped);
  const labelCounts = new Map<string, number>();
  for (const field of groupedMapped) {
    labelCounts.set(field.normalizedLabel, (labelCounts.get(field.normalizedLabel) ?? 0) + 1);
  }

  for (const field of groupedMapped) {
    const count = labelCounts.get(field.normalizedLabel) ?? 0;
    if (count > 1) {
      console.log("[AUTO_APPLY_FIELD_MAP] duplicate label detected", {
        label: field.label,
        fieldId: field.fieldId,
        fingerprint: field.fingerprint,
        fieldKind: field.fieldKind,
        tagName: field.sourceHints.tagName ?? null,
        type: field.type,
        name: field.sourceHints.name ?? null,
        id: field.sourceHints.id ?? null,
        ariaLabel: field.sourceHints.ariaLabel ?? null,
        placeholder: field.sourceHints.placeholder ?? null,
        nearestLabel: field.sourceHints.labelText ?? field.sourceHints.nearbyText ?? null,
        confidence: field.confidence,
        required: field.required,
        visible: field.visible,
        disabled: field.disabled,
      });
      if (
        field.normalizedLabel === "phone_number" &&
        field.fieldKind !== "phone_number_input"
      ) {
        console.log("[AUTO_APPLY_DUPLICATE_FIELD_RECLASSIFIED]", {
          label: field.label,
          fieldId: field.fieldId,
          fingerprint: field.fingerprint,
          fieldKind: field.fieldKind,
          tagName: field.sourceHints.tagName ?? null,
          type: field.type,
          confidence: field.confidence,
          reason: "duplicate_phone_label_not_strict_phone_number_input",
        });
      }
    }
    if (field.fieldKind === "phone_country_code_search_internal") {
      console.log("[AUTO_APPLY_PHONE_WIDGET_DETECTED]", {
        fieldId: field.fieldId,
        label: field.label,
        fieldKind: field.fieldKind,
        tagName: field.sourceHints.tagName ?? null,
        type: field.type,
        name: field.sourceHints.name ?? null,
        id: field.sourceHints.id ?? null,
        role: field.sourceHints.role ?? null,
        required: field.required,
        confidence: field.confidence,
      });
    }
  }

  return groupedMapped;
}

export function isMappedFieldMissing(field: MappedApplicationField) {
  return (
    field.required &&
    field.visible &&
    !field.disabled &&
    field.type !== "file" &&
    field.fieldKind !== "hidden_or_token_field" &&
    field.fieldKind !== "recaptcha_token" &&
    field.fieldKind !== "phone_country_code_search_internal" &&
    field.fieldKind !== "location_search_internal" &&
    !clean(field.currentValue)
  );
}
