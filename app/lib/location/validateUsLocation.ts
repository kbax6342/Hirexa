import "server-only";

import { normalizeStateInput } from "@/app/lib/locationOptions";

type ValidationCode =
  | "invalid_zip_format"
  | "zip_not_found"
  | "state_mismatch"
  | "city_mismatch"
  | "location_mismatch"
  | "service_unavailable";

type ValidationField = "city" | "state" | "postalCode" | "form";

type PostalLookupRecord = {
  city: string;
  stateCode: string;
  stateName: string;
};

type PostalLookupResult =
  | { kind: "found"; records: PostalLookupRecord[]; source: "geonames" | "google" }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export type ValidateUsLocationInput = {
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

export type ValidateUsLocationResult =
  | {
      ok: true;
      normalized: {
        city: string;
        state: string;
        stateCode: string;
        postalCode: string;
      };
      matchedCities: string[];
      source: "geonames" | "google";
    }
  | {
      ok: false;
      code: ValidationCode;
      field: ValidationField;
      message: string;
    };

const POSTAL_LOOKUP_TTL_MS = 1000 * 60 * 60 * 24;
const postalLookupCache = new Map<
  string,
  { expiresAt: number; value: PostalLookupResult }
>();

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCityForCompare(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function titleCaseText(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePostalCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function getPostalLookupCode(postalCode: string) {
  const match = normalizePostalCode(postalCode).match(/^(\d{5})(?:-\d{4})?$/);
  return match?.[1] ?? null;
}

function createFailure(
  code: ValidationCode,
  field: ValidationField,
  message: string
): ValidateUsLocationResult {
  return {
    ok: false,
    code,
    field,
    message,
  };
}

function dedupeRecords(records: PostalLookupRecord[]) {
  const seen = new Set<string>();
  const deduped: PostalLookupRecord[] = [];

  for (const record of records) {
    const city = normalizeText(record.city);
    const stateCode = normalizeText(record.stateCode).toUpperCase();
    const stateName = normalizeText(record.stateName);

    if (!city || !stateCode) continue;

    const key = `${normalizeCityForCompare(city)}|${stateCode}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deduped.push({
      city,
      stateCode,
      stateName,
    });
  }

  return deduped;
}

async function lookupPostalCodeWithGeoNames(
  postalCode: string
): Promise<PostalLookupResult> {
  const username = process.env.GEONAMES_USERNAME?.trim();
  if (!username) {
    return { kind: "unavailable" };
  }

  const endpoint = new URL("https://secure.geonames.org/postalCodeLookupJSON");
  endpoint.searchParams.set("postalcode", postalCode);
  endpoint.searchParams.set("country", "US");
  endpoint.searchParams.set("username", username);

  try {
    const response = await fetch(endpoint.toString(), { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as
      | {
          postalcodes?: Array<{
            placeName?: unknown;
            adminCode1?: unknown;
            adminName1?: unknown;
          }>;
          status?: { message?: string };
        }
      | null;

    if (!response.ok || !data) {
      return { kind: "unavailable" };
    }

    const records = dedupeRecords(
      Array.isArray(data.postalcodes)
        ? data.postalcodes.map((item) => ({
            city: normalizeText(item.placeName),
            stateCode: normalizeText(item.adminCode1).toUpperCase(),
            stateName: normalizeText(item.adminName1),
          }))
        : []
    );

    if (records.length === 0) {
      return { kind: "not_found" };
    }

    return {
      kind: "found",
      records,
      source: "geonames",
    };
  } catch {
    return { kind: "unavailable" };
  }
}

async function lookupPostalCodeWithGoogle(
  postalCode: string
): Promise<PostalLookupResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return { kind: "unavailable" };
  }

  const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  endpoint.searchParams.set("address", postalCode);
  endpoint.searchParams.set("components", "country:US");
  endpoint.searchParams.set("key", apiKey);

  try {
    const response = await fetch(endpoint.toString(), { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as
      | {
          results?: Array<{
            postcode_localities?: unknown;
            address_components?: Array<{
              long_name?: unknown;
              short_name?: unknown;
              types?: unknown;
            }>;
          }>;
          status?: string;
        }
      | null;

    if (!response.ok || !data || data.status !== "OK" || !Array.isArray(data.results)) {
      return { kind: "unavailable" };
    }

    const records: PostalLookupRecord[] = [];

    for (const result of data.results) {
      const components = Array.isArray(result.address_components)
        ? result.address_components
        : [];
      const localities = new Set<string>();
      let stateCode = "";
      let stateName = "";

      for (const component of components) {
        const types = Array.isArray(component.types) ? component.types : [];
        if (types.includes("locality")) {
          const city = normalizeText(component.long_name);
          if (city) localities.add(city);
        }
        if (types.includes("postal_town")) {
          const city = normalizeText(component.long_name);
          if (city) localities.add(city);
        }
        if (types.includes("administrative_area_level_1")) {
          stateCode = normalizeText(component.short_name).toUpperCase();
          stateName = normalizeText(component.long_name);
        }
      }

      if (Array.isArray(result.postcode_localities)) {
        for (const locality of result.postcode_localities) {
          const city = normalizeText(locality);
          if (city) localities.add(city);
        }
      }

      for (const city of localities) {
        records.push({
          city,
          stateCode,
          stateName,
        });
      }
    }

    const deduped = dedupeRecords(records);
    if (deduped.length === 0) {
      return { kind: "not_found" };
    }

    return {
      kind: "found",
      records: deduped,
      source: "google",
    };
  } catch {
    return { kind: "unavailable" };
  }
}

async function lookupPostalCode(postalCode: string): Promise<PostalLookupResult> {
  const cached = postalLookupCache.get(postalCode);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const geonamesResult = await lookupPostalCodeWithGeoNames(postalCode);
  const result =
    geonamesResult.kind === "found"
      ? geonamesResult
      : await lookupPostalCodeWithGoogle(postalCode);
  const finalResult =
    result.kind === "found" || result.kind === "not_found"
      ? result
      : geonamesResult.kind === "not_found"
      ? geonamesResult
      : result;

  postalLookupCache.set(postalCode, {
    expiresAt: Date.now() + POSTAL_LOOKUP_TTL_MS,
    value: finalResult,
  });

  return finalResult;
}

export async function validateUsLocation(
  input: ValidateUsLocationInput
): Promise<ValidateUsLocationResult> {
  const normalizedCityInput = normalizeText(input.city);
  const normalizedStateInput = normalizeText(input.state);
  const normalizedPostalInput = normalizePostalCode(input.postalCode);
  const matchedState = normalizeStateInput(normalizedStateInput);
  const postalLookupCode = getPostalLookupCode(normalizedPostalInput);

  if (!postalLookupCode) {
    return createFailure(
      "invalid_zip_format",
      "postalCode",
      "Enter a valid ZIP code."
    );
  }

  if (!normalizedCityInput || !matchedState) {
    return createFailure(
      "location_mismatch",
      "form",
      "Please enter a valid city, state, and ZIP combination."
    );
  }

  const lookupResult = await lookupPostalCode(postalLookupCode);

  if (lookupResult.kind === "unavailable") {
    return createFailure(
      "service_unavailable",
      "form",
      "We couldn't validate that location right now."
    );
  }

  if (lookupResult.kind === "not_found") {
    return createFailure(
      "zip_not_found",
      "postalCode",
      "That ZIP code was not found."
    );
  }

  const records = lookupResult.records;
  const matchedCities = records.map((record) => record.city);
  const expectedStateCode = matchedState.code.toUpperCase();
  const stateMatches = records.some(
    (record) => record.stateCode.toUpperCase() === expectedStateCode
  );

  if (!stateMatches) {
    return createFailure(
      "state_mismatch",
      "state",
      "That ZIP code does not match the selected state."
    );
  }

  const cityMatches = records.some(
    (record) =>
      record.stateCode.toUpperCase() === expectedStateCode &&
      normalizeCityForCompare(record.city) === normalizeCityForCompare(normalizedCityInput)
  );

  if (!cityMatches) {
    return createFailure(
      "city_mismatch",
      "city",
      "That ZIP code does not match the entered city."
    );
  }

  const canonicalCity =
    records.find(
      (record) =>
        record.stateCode.toUpperCase() === expectedStateCode &&
        normalizeCityForCompare(record.city) === normalizeCityForCompare(normalizedCityInput)
    )?.city ?? titleCaseText(normalizedCityInput);

  return {
    ok: true,
    normalized: {
      city: canonicalCity,
      state: matchedState.name,
      stateCode: matchedState.code,
      postalCode: normalizedPostalInput,
    },
    matchedCities,
    source: lookupResult.source,
  };
}
