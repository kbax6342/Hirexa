import type { Page } from "playwright-core";
import type { MappedApplicationField } from "@/app/lib/apply/formFieldMapper";

export type PhoneFieldFillResult = {
  attempted: boolean;
  phoneExistsInProfile: boolean;
  countryCodeAttempted: boolean;
  countryCodeFilled: boolean;
  phoneNumberAttempted: boolean;
  phoneNumberFilled: boolean;
  validationPassed: boolean;
  reason?: string;
  phoneFieldLabels: string[];
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function maskPhoneNumber(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `***-***-${digits.slice(-4)}`;
}

function readProfilePhone(profile: unknown) {
  const data = record(profile);
  return text(data.phone ?? data.phoneNumber ?? data.mobile ?? data.mobilePhone);
}

function readProfileCountryText(profile: unknown) {
  const data = record(profile);
  return [
    data.country,
    data.countryCode,
    data.address,
    data.city,
    data.citySearch,
    data.state,
    data.stateSearch,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function inferDialCodeFromPhone(phone: string) {
  const normalized = phone.trim();
  if (/^\+1\b/.test(normalized) || /^\+1\d{10}$/.test(normalized.replace(/\D/g, ""))) {
    return { dialCode: "+1", countryName: "United States", countryCode: "US" };
  }
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 10) {
    return { dialCode: "+1", countryName: "United States", countryCode: "US" };
  }
  const known = [
    ["44", "United Kingdom", "GB"],
    ["91", "India", "IN"],
    ["61", "Australia", "AU"],
    ["49", "Germany", "DE"],
    ["33", "France", "FR"],
    ["34", "Spain", "ES"],
    ["39", "Italy", "IT"],
    ["31", "Netherlands", "NL"],
    ["353", "Ireland", "IE"],
    ["1", "United States", "US"],
  ] as const;
  if (normalized.startsWith("+")) {
    for (const [code, countryName, countryCode] of known) {
      if (digits.startsWith(code)) return { dialCode: `+${code}`, countryName, countryCode };
    }
  }
  return null;
}

function inferDialCodeFromProfile(profile: unknown) {
  const countryText = readProfileCountryText(profile).toLowerCase();
  if (/\b(us|usa|united states|america|ga|savannah)\b/.test(countryText)) {
    return { dialCode: "+1", countryName: "United States", countryCode: "US" };
  }
  if (/\bcanada| ca\b/.test(countryText)) {
    return { dialCode: "+1", countryName: "Canada", countryCode: "CA" };
  }
  if (/\bunited kingdom|uk|great britain|england\b/.test(countryText)) {
    return { dialCode: "+44", countryName: "United Kingdom", countryCode: "GB" };
  }
  return null;
}

function normalizePhoneForField(phone: string, dialCode: string | null) {
  const digits = phone.replace(/\D/g, "");
  if ((dialCode === "+1" || !dialCode) && digits.length >= 10) {
    const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (local.length === 10) {
      return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
    }
  }
  return phone.trim();
}

function locatorForField(page: Page, field: MappedApplicationField) {
  const descriptor = field.descriptor;
  if (!descriptor) return null;
  const frame = descriptor.frameUrl
    ? page.frames().find((candidate) => candidate.url() === descriptor.frameUrl)
    : null;
  return (frame ?? page).locator(descriptor.selector).first();
}

function isPhoneish(field: MappedApplicationField) {
  const sourceText = [
    field.label,
    field.groupLabel,
    field.sourceHints.name,
    field.sourceHints.id,
    field.sourceHints.placeholder,
    field.sourceHints.ariaLabel,
  ]
    .map(text)
    .join(" ");
  if (
    field.type === "textarea" ||
    /(?:^|[\W_])question[_-]?\d+/i.test(sourceText) ||
    /\b(why|describe|hardest|opportunity|how did you hear|tell us|worked on)\b/i.test(sourceText)
  ) {
    return false;
  }

  return (
    field.fieldKind === "phone_number_input" ||
    field.fieldKind === "phone_country_code_select" ||
    field.fieldKind === "phone_country_search_input" ||
    field.fieldKind === "phone_country_code_search_internal" ||
    /\b(phone|telephone|mobile|tel)\b/i.test(sourceText)
  );
}

async function commitInputValue(page: Page, field: MappedApplicationField) {
  const locator = locatorForField(page, field);
  if (!locator) return false;
  await locator.evaluate((element) => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    if (element instanceof HTMLElement) element.blur();
  });
  return true;
}

async function fillCountryControl(args: {
  page: Page;
  field: MappedApplicationField;
  dialCode: string;
  countryName: string;
  countryCode: string;
}) {
  const locator = locatorForField(args.page, args.field);
  if (!locator) return false;

  if (args.field.type === "select" && args.field.descriptor) {
    const options = args.field.descriptor.options ?? [];
    const match = options.find((option) => {
      const haystack = `${option.label} ${option.value}`.toLowerCase();
      return (
        haystack.includes(args.dialCode.toLowerCase()) ||
        haystack.includes(args.countryName.toLowerCase()) ||
        haystack.includes(args.countryCode.toLowerCase())
      );
    });
    if (match) {
      await locator
        .selectOption({ value: match.value })
        .catch(() => locator.selectOption({ label: match.label }));
      await commitInputValue(args.page, args.field);
      return true;
    }
  }

  await locator.click().catch(() => undefined);
  await locator.fill(args.countryName).catch(async () => {
    await locator.fill(args.dialCode).catch(() => undefined);
  });
  await args.page.keyboard.press("Enter").catch(() => undefined);
  await commitInputValue(args.page, args.field);

  const option = args.page
    .getByText(new RegExp(`${args.countryName}|\\${args.dialCode.replace("+", "+")}`, "i"))
    .first();
  if ((await option.count().catch(() => 0)) > 0) {
    await option.click().catch(() => undefined);
  }
  return true;
}

export async function fillPhoneGroup(args: {
  page: Page;
  fields: MappedApplicationField[];
  userProfile: unknown;
}) {
  const phone = readProfilePhone(args.userProfile);
  const phoneFields = args.fields.filter(
    (field) => field.visible && !field.disabled && isPhoneish(field),
  );
  const labels = phoneFields.map((field) => field.label);

  if (phoneFields.length === 0) {
    return {
      attempted: false,
      phoneExistsInProfile: Boolean(phone),
      countryCodeAttempted: false,
      countryCodeFilled: false,
      phoneNumberAttempted: false,
      phoneNumberFilled: false,
      validationPassed: true,
      phoneFieldLabels: labels,
    } satisfies PhoneFieldFillResult;
  }

  console.log("[AUTO_APPLY_PHONE_GROUP] detected phone group", {
    fieldCount: phoneFields.length,
    labels,
    profilePhonePresent: Boolean(phone),
    maskedPhone: maskPhoneNumber(phone),
  });

  if (!phone) {
    return {
      attempted: true,
      phoneExistsInProfile: false,
      countryCodeAttempted: false,
      countryCodeFilled: false,
      phoneNumberAttempted: false,
      phoneNumberFilled: false,
      validationPassed: false,
      reason: "No phone number exists in profile.",
      phoneFieldLabels: labels,
    } satisfies PhoneFieldFillResult;
  }

  const country =
    inferDialCodeFromPhone(phone) ??
    inferDialCodeFromProfile(args.userProfile) ??
    null;
  const countryFields = phoneFields.filter(
    (field) =>
      field.fieldKind === "phone_country_code_select" ||
      field.fieldKind === "phone_country_search_input" ||
      field.fieldKind === "phone_country_code_search_internal" ||
      (field.type === "select" && /country|code|\+/i.test(`${field.label} ${field.options?.join(" ")}`)),
  );
  const numberFields = phoneFields.filter(
    (field) => field.fieldKind === "phone_number_input",
  );

  let countryCodeAttempted = false;
  let countryCodeFilled = false;
  if (country) {
    for (const field of countryFields) {
      console.log("[AUTO_APPLY_PHONE_GROUP] country code control found", {
        label: field.label,
        fieldKind: field.fieldKind,
        type: field.type,
        countryCode: country.countryCode,
        dialCode: country.dialCode,
      });
      countryCodeAttempted = true;
      countryCodeFilled =
        (await fillCountryControl({
          page: args.page,
          field,
          dialCode: country.dialCode,
          countryName: country.countryName,
          countryCode: country.countryCode,
        })) || countryCodeFilled;
      if (countryCodeFilled) {
        console.log("[AUTO_APPLY_PHONE_GROUP] selected country code", {
          label: field.label,
          fieldKind: field.fieldKind,
          countryCode: country.countryCode,
          dialCode: country.dialCode,
        });
        console.log("[AUTO_APPLY_PHONE_GROUP] filled country code", {
          label: field.label,
          fieldKind: field.fieldKind,
          countryCode: country.countryCode,
          dialCode: country.dialCode,
        });
        break;
      }
    }
  }

  const phoneValue = normalizePhoneForField(phone, country?.dialCode ?? null);
  let phoneNumberAttempted = false;
  let phoneNumberFilled = false;
  for (const field of numberFields) {
    const locator = locatorForField(args.page, field);
    if (!locator) continue;
    phoneNumberAttempted = true;
    await locator.fill(phoneValue).catch(() => undefined);
    await commitInputValue(args.page, field);
    const value = await locator
      .evaluate((element) =>
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value
          : element.textContent ?? "",
      )
      .catch(() => "");
    phoneNumberFilled = Boolean(text(value));
    if (phoneNumberFilled) {
      console.log("[AUTO_APPLY_PHONE_GROUP] filled phone number", {
        label: field.label,
        fieldKind: field.fieldKind,
        maskedPhone: maskPhoneNumber(phone),
      });
      console.log("[AUTO_APPLY_PHONE_GROUP] committed phone value", {
        label: field.label,
        maskedPhone: maskPhoneNumber(phone),
      });
      break;
    }
  }

  const validationPassed =
    phoneNumberFilled &&
    (countryFields.length === 0 || countryCodeFilled || !countryCodeAttempted);
  console.log(
    validationPassed
      ? "[AUTO_APPLY_PHONE_GROUP] validation passed"
      : "[AUTO_APPLY_PHONE_GROUP] validation still failing",
    {
      labels,
      countryCodeAttempted,
      countryCodeFilled,
      phoneNumberAttempted,
      phoneNumberFilled,
      maskedPhone: maskPhoneNumber(phone),
    },
  );
  if (validationPassed) {
    console.log("[AUTO_APPLY_PHONE_GROUP] verified phone group", {
      labels,
      countryCodeAttempted,
      countryCodeFilled,
      phoneNumberAttempted,
      phoneNumberFilled,
      maskedPhone: maskPhoneNumber(phone),
    });
  }

  return {
    attempted: true,
    phoneExistsInProfile: true,
    countryCodeAttempted,
    countryCodeFilled,
    phoneNumberAttempted,
    phoneNumberFilled,
    validationPassed,
    reason: validationPassed
      ? undefined
      : "Phone number exists in profile, but the form's phone/country-code control did not validate after autofill.",
    phoneFieldLabels: labels,
  } satisfies PhoneFieldFillResult;
}
