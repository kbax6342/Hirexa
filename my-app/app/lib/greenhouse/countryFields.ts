import type { GhField } from "@/app/lib/greenhouse/parseGreenhouseForm";

type CountryFieldKind = "country" | "countryCode" | null;

function normalized(input: unknown) {
  return String(input ?? "").trim().toLowerCase();
}

export function detectCountryFieldKind(field: Pick<GhField, "name" | "label" | "placeholder" | "options">): CountryFieldKind {
  const name = normalized(field.name);
  const label = normalized(field.label);
  const placeholder = normalized(field.placeholder);
  const target = `${name} ${label} ${placeholder}`;

  if (
    name.includes("phone_country_code") ||
    target.includes("country code") ||
    target.includes("dial code")
  ) {
    return "countryCode";
  }

  if (name.includes("job_application[country]") || /(^|\W)country(\W|$)/i.test(target)) {
    return "country";
  }

  const opts = Array.isArray(field.options) ? field.options : [];
  if (
    opts.length > 0 &&
    opts.some((o) => /^\+\d{1,4}$/.test(String(o.value).trim()) || /^\+\d{1,4}$/.test(String(o.label).trim()))
  ) {
    return "countryCode";
  }

  return null;
}

export function looksLikeCountryCode(value: string) {
  return /^\+\d{1,4}$/.test(String(value ?? "").trim());
}
