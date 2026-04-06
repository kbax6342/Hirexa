import {
  normalizeLocationLabel,
  normalizeStateInput,
} from "@/app/lib/locationOptions";
import {
  buildRoleFamilyExpansionQueries,
  classifyJobQueryFamily,
  type JobQueryFamily,
} from "@/app/lib/jobs/queryFamily";
import { expandRoleQueryVariants } from "@/app/lib/jobs/sources/common";

export type AdzunaRoleTier = "exact" | "adjacent" | "family" | "category";
export type AdzunaLocationTier =
  | "exact"
  | "nearby"
  | "metro"
  | "regional"
  | "anywhere";

export type AdzunaSearchTier = {
  query: string;
  location: string;
  roleTier: AdzunaRoleTier;
  locationTier: AdzunaLocationTier;
};

type ParsedLocation = {
  label: string;
  city: string | null;
  stateCode: string | null;
  stateName: string | null;
};

type LocationPlan = {
  exact: string[];
  nearby: string[];
  metro: string[];
  regional: string[];
};

const METRO_LOCATION_EXPANSIONS: Record<
  string,
  { nearby: string[]; metro: string[] }
> = {
  "atlanta|ga": {
    nearby: ["Sandy Springs, GA", "Marietta, GA"],
    metro: ["Fulton County, GA"],
  },
  "boston|ma": {
    nearby: ["Cambridge, MA", "Somerville, MA"],
    metro: ["Suffolk County, MA"],
  },
  "chicago|il": {
    nearby: ["Evanston, IL", "Oak Park, IL"],
    metro: ["Cook County, IL"],
  },
  "dallas|tx": {
    nearby: ["Plano, TX", "Irving, TX"],
    metro: ["Dallas County, TX"],
  },
  "detroit|mi": {
    nearby: ["Dearborn, MI", "Warren, MI"],
    metro: ["Wayne County, MI"],
  },
  "los angeles|ca": {
    nearby: ["Glendale, CA", "Pasadena, CA"],
    metro: ["Los Angeles County, CA"],
  },
  "new york|ny": {
    nearby: ["Jersey City, NJ", "Newark, NJ"],
    metro: ["New York County, NY"],
  },
  "phoenix|az": {
    nearby: ["Tempe, AZ", "Scottsdale, AZ"],
    metro: ["Maricopa County, AZ"],
  },
  "seattle|wa": {
    nearby: ["Bellevue, WA", "Redmond, WA"],
    metro: ["King County, WA"],
  },
};

const FAMILY_CATEGORY_FALLBACK: Partial<Record<JobQueryFamily, string>> = {
  service_frontline: "customer service",
  office_admin: "administrative",
  professional: "professional",
  technical: "technology",
  management: "management",
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) continue;

    const key = normalizeText(trimmed);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function parseLocation(value: string | null | undefined): ParsedLocation {
  const label = normalizeLocationLabel(value ?? "");
  if (!label) {
    return {
      label: "",
      city: null,
      stateCode: null,
      stateName: null,
    };
  }

  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const state = normalizeStateInput(parts.slice(1).join(" "));
    return {
      label,
      city: parts[0] ?? null,
      stateCode: state?.code ?? null,
      stateName: state?.name ?? null,
    };
  }

  const state = normalizeStateInput(label);
  if (state) {
    return {
      label: state.name,
      city: null,
      stateCode: state.code,
      stateName: state.name,
    };
  }

  return {
    label,
    city: label,
    stateCode: null,
    stateName: null,
  };
}

function getLocationPlan(location: string | null | undefined): LocationPlan {
  const parsed = parseLocation(location);
  if (!parsed.label) {
    return {
      exact: [""],
      nearby: [],
      metro: [],
      regional: [],
    };
  }

  if (!parsed.city || !parsed.stateCode || !parsed.stateName) {
    return {
      exact: [parsed.label],
      nearby: [],
      metro: [],
      regional: [],
    };
  }

  const lookupKey = `${normalizeText(parsed.city)}|${parsed.stateCode.toLowerCase()}`;
  const metroExpansion = METRO_LOCATION_EXPANSIONS[lookupKey];

  return {
    exact: [parsed.label],
    nearby: metroExpansion?.nearby ?? [],
    metro: metroExpansion?.metro ?? [],
    regional: parsed.stateName ? [parsed.stateName] : [],
  };
}

function getAdjacentQueries(targetRole: string) {
  const baseKey = normalizeText(targetRole);
  return dedupeStrings(expandRoleQueryVariants(targetRole)).filter(
    (value) => normalizeText(value) !== baseKey
  );
}

function getFamilyQueries(targetRole: string) {
  const family = classifyJobQueryFamily(targetRole);
  const blocked = new Set(
    dedupeStrings([targetRole, ...expandRoleQueryVariants(targetRole)]).map((value) =>
      normalizeText(value)
    )
  );

  return dedupeStrings(
    buildRoleFamilyExpansionQueries(targetRole, family)
  ).filter((value) => !blocked.has(normalizeText(value)));
}

function getCategoryFallbackQuery(targetRole: string, category?: string | null) {
  const normalizedCategory = (category ?? "").trim().replace(/[-_]+/g, " ");
  if (normalizedCategory) {
    return normalizedCategory;
  }

  const family = classifyJobQueryFamily(targetRole);
  return FAMILY_CATEGORY_FALLBACK[family] ?? null;
}

export function buildAdzunaSearchPlan(params: {
  targetRole: string;
  location?: string | null;
  category?: string | null;
}) {
  const targetRole = params.targetRole.trim();
  const locationPlan = getLocationPlan(params.location);
  const exactLocation = locationPlan.exact[0] ?? "";
  const nearbyLocations = locationPlan.nearby.slice(0, 2);
  const metroLocations = locationPlan.metro.slice(0, 1);
  const regionalLocations = locationPlan.regional.slice(0, 1);
  const adjacentQueries = getAdjacentQueries(targetRole).slice(0, 2);
  const familyQueries = getFamilyQueries(targetRole).slice(0, 1);
  const categoryFallback = getCategoryFallbackQuery(targetRole, params.category);
  const tiers: AdzunaSearchTier[] = [];
  const seen = new Set<string>();

  const pushTier = (
    query: string | null | undefined,
    location: string | null | undefined,
    roleTier: AdzunaRoleTier,
    locationTier: AdzunaLocationTier
  ) => {
    const normalizedQuery = (query ?? "").trim();
    const normalizedLocation = normalizeLocationLabel(location ?? "");
    if (!normalizedQuery) return;

    const key = [
      normalizeText(normalizedQuery),
      normalizeText(normalizedLocation),
      roleTier,
      locationTier,
    ].join("|");
    if (seen.has(key)) return;

    seen.add(key);
    tiers.push({
      query: normalizedQuery,
      location: normalizedLocation,
      roleTier,
      locationTier,
    });
  };

  pushTier(targetRole, exactLocation, "exact", exactLocation ? "exact" : "anywhere");

  for (const nearbyLocation of nearbyLocations) {
    pushTier(targetRole, nearbyLocation, "exact", "nearby");
  }

  for (const adjacentQuery of adjacentQueries) {
    pushTier(
      adjacentQuery,
      exactLocation,
      "adjacent",
      exactLocation ? "exact" : "anywhere"
    );
  }

  for (const metroLocation of metroLocations) {
    pushTier(targetRole, metroLocation, "exact", "metro");
  }

  for (const regionalLocation of regionalLocations) {
    pushTier(targetRole, regionalLocation, "exact", "regional");
  }

  for (const adjacentQuery of adjacentQueries) {
    for (const nearbyLocation of nearbyLocations.slice(0, 1)) {
      pushTier(adjacentQuery, nearbyLocation, "adjacent", "nearby");
    }
  }

  for (const familyQuery of familyQueries) {
    const familyLocation =
      metroLocations[0] ?? regionalLocations[0] ?? exactLocation ?? "";
    pushTier(
      familyQuery,
      familyLocation,
      "family",
      familyLocation
        ? metroLocations[0]
          ? "metro"
          : regionalLocations[0]
            ? "regional"
            : "exact"
        : "anywhere"
    );
  }

  if (categoryFallback) {
    const categoryLocation = regionalLocations[0] ?? exactLocation ?? "";
    pushTier(
      categoryFallback,
      categoryLocation,
      "category",
      categoryLocation ? "regional" : "anywhere"
    );
  }

  return tiers;
}

export function describeAdzunaSearchTier(tier: AdzunaSearchTier) {
  const location = tier.location.trim();
  if (!location) {
    return `${tier.query} (${tier.roleTier})`;
  }

  return `${tier.query} in ${location}`;
}

export function buildAdzunaFallbackMessage(args: {
  requestedRole: string;
  requestedLocation?: string | null;
  activeTier: AdzunaSearchTier;
}) {
  const requestedLocation = normalizeLocationLabel(args.requestedLocation ?? "");
  const activeLocation = args.activeTier.location.trim();

  if (args.activeTier.roleTier === "adjacent") {
    if (activeLocation && requestedLocation && activeLocation !== requestedLocation) {
      return `Showing closely related ${args.requestedRole} roles around ${activeLocation}.`;
    }

    return `Showing closely related ${args.requestedRole} roles to keep your feed moving.`;
  }

  if (args.activeTier.roleTier === "family") {
    return activeLocation
      ? `Showing broader ${args.activeTier.query} roles around ${activeLocation}.`
      : `Showing broader ${args.activeTier.query} roles to widen the search.`;
  }

  if (args.activeTier.roleTier === "category") {
    return activeLocation
      ? `Showing broader ${args.activeTier.query} jobs around ${activeLocation}.`
      : `Showing broader ${args.activeTier.query} jobs as a last resort.`;
  }

  if (args.activeTier.locationTier === "nearby") {
    return requestedLocation
      ? `Showing nearby results around ${requestedLocation}.`
      : `Showing nearby local results to widen the search.`;
  }

  if (args.activeTier.locationTier === "metro") {
    return requestedLocation
      ? `Showing metro-area results around ${requestedLocation}.`
      : `Showing broader metro-area results.`;
  }

  if (args.activeTier.locationTier === "regional") {
    return requestedLocation
      ? `Showing broader regional results around ${requestedLocation}.`
      : `Showing broader regional results.`;
  }

  return null;
}
