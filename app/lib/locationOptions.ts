type StateOption = {
  name: string;
  code: string;
};

type CityOption = {
  name: string;
  stateCode: string;
};

export type LocationSuggestion = {
  label: string;
  kind: "city" | "state";
};

const US_STATES: StateOption[] = [
  { name: "Alabama", code: "AL" },
  { name: "Alaska", code: "AK" },
  { name: "Arizona", code: "AZ" },
  { name: "Arkansas", code: "AR" },
  { name: "California", code: "CA" },
  { name: "Colorado", code: "CO" },
  { name: "Connecticut", code: "CT" },
  { name: "Delaware", code: "DE" },
  { name: "Florida", code: "FL" },
  { name: "Georgia", code: "GA" },
  { name: "Hawaii", code: "HI" },
  { name: "Idaho", code: "ID" },
  { name: "Illinois", code: "IL" },
  { name: "Indiana", code: "IN" },
  { name: "Iowa", code: "IA" },
  { name: "Kansas", code: "KS" },
  { name: "Kentucky", code: "KY" },
  { name: "Louisiana", code: "LA" },
  { name: "Maine", code: "ME" },
  { name: "Maryland", code: "MD" },
  { name: "Massachusetts", code: "MA" },
  { name: "Michigan", code: "MI" },
  { name: "Minnesota", code: "MN" },
  { name: "Mississippi", code: "MS" },
  { name: "Missouri", code: "MO" },
  { name: "Montana", code: "MT" },
  { name: "Nebraska", code: "NE" },
  { name: "Nevada", code: "NV" },
  { name: "New Hampshire", code: "NH" },
  { name: "New Jersey", code: "NJ" },
  { name: "New Mexico", code: "NM" },
  { name: "New York", code: "NY" },
  { name: "North Carolina", code: "NC" },
  { name: "North Dakota", code: "ND" },
  { name: "Ohio", code: "OH" },
  { name: "Oklahoma", code: "OK" },
  { name: "Oregon", code: "OR" },
  { name: "Pennsylvania", code: "PA" },
  { name: "Rhode Island", code: "RI" },
  { name: "South Carolina", code: "SC" },
  { name: "South Dakota", code: "SD" },
  { name: "Tennessee", code: "TN" },
  { name: "Texas", code: "TX" },
  { name: "Utah", code: "UT" },
  { name: "Vermont", code: "VT" },
  { name: "Virginia", code: "VA" },
  { name: "Washington", code: "WA" },
  { name: "West Virginia", code: "WV" },
  { name: "Wisconsin", code: "WI" },
  { name: "Wyoming", code: "WY" },
  { name: "District of Columbia", code: "DC" },
];

export function getUSStateOptions(): Array<{ name: string; code: string }> {
  return US_STATES.map((state) => ({
    name: state.name,
    code: state.code,
  }));
}

const MAJOR_US_CITIES: CityOption[] = [
  { name: "Atlanta", stateCode: "GA" },
  { name: "Austin", stateCode: "TX" },
  { name: "Baltimore", stateCode: "MD" },
  { name: "Boston", stateCode: "MA" },
  { name: "Charlotte", stateCode: "NC" },
  { name: "Chicago", stateCode: "IL" },
  { name: "Cincinnati", stateCode: "OH" },
  { name: "Cleveland", stateCode: "OH" },
  { name: "Columbus", stateCode: "OH" },
  { name: "Dallas", stateCode: "TX" },
  { name: "Denver", stateCode: "CO" },
  { name: "Detroit", stateCode: "MI" },
  { name: "Houston", stateCode: "TX" },
  { name: "Indianapolis", stateCode: "IN" },
  { name: "Jacksonville", stateCode: "FL" },
  { name: "Kansas City", stateCode: "MO" },
  { name: "Las Vegas", stateCode: "NV" },
  { name: "Los Angeles", stateCode: "CA" },
  { name: "Louisville", stateCode: "KY" },
  { name: "Memphis", stateCode: "TN" },
  { name: "Miami", stateCode: "FL" },
  { name: "Milwaukee", stateCode: "WI" },
  { name: "Minneapolis", stateCode: "MN" },
  { name: "Nashville", stateCode: "TN" },
  { name: "New Orleans", stateCode: "LA" },
  { name: "New York", stateCode: "NY" },
  { name: "Oakland", stateCode: "CA" },
  { name: "Oklahoma City", stateCode: "OK" },
  { name: "Orlando", stateCode: "FL" },
  { name: "Philadelphia", stateCode: "PA" },
  { name: "Phoenix", stateCode: "AZ" },
  { name: "Pittsburgh", stateCode: "PA" },
  { name: "Portland", stateCode: "OR" },
  { name: "Raleigh", stateCode: "NC" },
  { name: "Richmond", stateCode: "VA" },
  { name: "Sacramento", stateCode: "CA" },
  { name: "Salt Lake City", stateCode: "UT" },
  { name: "San Antonio", stateCode: "TX" },
  { name: "San Diego", stateCode: "CA" },
  { name: "San Francisco", stateCode: "CA" },
  { name: "San Jose", stateCode: "CA" },
  { name: "Seattle", stateCode: "WA" },
  { name: "St. Louis", stateCode: "MO" },
  { name: "Tampa", stateCode: "FL" },
  { name: "Washington", stateCode: "DC" },
];

const STATE_BY_NAME = new Map(
  US_STATES.map((state) => [state.name.toLowerCase(), state] as const)
);
const STATE_BY_CODE = new Map(
  US_STATES.map((state) => [state.code.toLowerCase(), state] as const)
);

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function toSearchValue(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function titleCasePart(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 2) {
        return part.toUpperCase();
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function titleCaseLabel(value: string) {
  return normalizeWhitespace(value)
    .split(",")
    .map((part) => titleCasePart(part.trim()))
    .filter(Boolean)
    .join(", ");
}

function getStateByCode(code: string) {
  return STATE_BY_CODE.get(code.trim().toLowerCase()) ?? null;
}

export function normalizeStateInput(value: string) {
  const normalized = toSearchValue(value);
  if (!normalized) return null;

  return STATE_BY_NAME.get(normalized) ?? STATE_BY_CODE.get(normalized) ?? null;
}

export function formatCityState(city: string, state: string) {
  const normalizedCity = titleCasePart(city);
  const matchedState = normalizeStateInput(state);

  if (!normalizedCity) return matchedState?.name ?? null;
  if (!matchedState) return normalizedCity;

  return `${normalizedCity}, ${matchedState.code}`;
}

function parseCityAndState(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;

  const commaParts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      city: commaParts[0],
      state: commaParts.slice(1).join(" "),
    };
  }

  const spacedParts = normalized.split(" ").filter(Boolean);
  if (spacedParts.length >= 2) {
    const lastPart = spacedParts.at(-1) ?? "";
    const matchedState = normalizeStateInput(lastPart);
    if (matchedState) {
      return {
        city: spacedParts.slice(0, -1).join(" "),
        state: matchedState.name,
      };
    }
  }

  return null;
}

function findExactCity(value: string) {
  const normalized = toSearchValue(value);
  if (!normalized) return null;

  return (
    MAJOR_US_CITIES.find(
      (city) =>
        toSearchValue(city.name) === normalized ||
        toSearchValue(`${city.name}, ${city.stateCode}`) === normalized ||
        toSearchValue(`${city.name} ${city.stateCode}`) === normalized
    ) ?? null
  );
}

export function normalizeLocationLabel(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";

  const exactState = normalizeStateInput(normalized);
  if (exactState) return exactState.name;

  const parsedCityState = parseCityAndState(normalized);
  if (parsedCityState?.city) {
    const formatted = formatCityState(parsedCityState.city, parsedCityState.state);
    if (formatted) return formatted;
  }

  const exactCity = findExactCity(normalized);
  if (exactCity) {
    return `${exactCity.name}, ${exactCity.stateCode}`;
  }

  return titleCaseLabel(normalized);
}

export function deriveLocationLabel(
  city?: string | null,
  state?: string | null
) {
  const normalizedCity = normalizeWhitespace(city ?? "");
  const normalizedState = normalizeWhitespace(state ?? "");

  if (normalizedCity && normalizedState) {
    return formatCityState(normalizedCity, normalizedState);
  }

  if (normalizedState) {
    const matchedState = normalizeStateInput(normalizedState);
    return matchedState?.name ?? titleCaseLabel(normalizedState);
  }

  if (normalizedCity) {
    return normalizeLocationLabel(normalizedCity);
  }

  return null;
}

type RankedSuggestion = LocationSuggestion & {
  score: number;
};

export function getLocationSuggestions(input: string, limit = 8) {
  const query = toSearchValue(input);
  if (!query) return [] as LocationSuggestion[];

  const ranked: RankedSuggestion[] = [];
  const seen = new Set<string>();

  const pushSuggestion = (suggestion: LocationSuggestion, score: number) => {
    const key = suggestion.label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ranked.push({ ...suggestion, score });
  };

  for (const state of US_STATES) {
    const stateSearch = toSearchValue(state.name);
    const codeSearch = state.code.toLowerCase();
    if (stateSearch === query || codeSearch === query) {
      pushSuggestion({ label: state.name, kind: "state" }, 100);
      continue;
    }
    if (stateSearch.startsWith(query) || codeSearch.startsWith(query)) {
      pushSuggestion({ label: state.name, kind: "state" }, 80);
      continue;
    }
    if (stateSearch.includes(query)) {
      pushSuggestion({ label: state.name, kind: "state" }, 60);
    }
  }

  for (const city of MAJOR_US_CITIES) {
    const label = `${city.name}, ${city.stateCode}`;
    const citySearch = toSearchValue(city.name);
    const labelSearch = toSearchValue(label);

    if (citySearch === query || labelSearch === query) {
      pushSuggestion({ label, kind: "city" }, 95);
      continue;
    }
    if (citySearch.startsWith(query) || labelSearch.startsWith(query)) {
      pushSuggestion({ label, kind: "city" }, 75);
      continue;
    }
    if (citySearch.includes(query) || labelSearch.includes(query)) {
      pushSuggestion({ label, kind: "city" }, 55);
    }
  }

  return ranked
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map((suggestion) => ({
      label: suggestion.label,
      kind: suggestion.kind,
    }));
}

export function getStateNameFromCode(code: string) {
  return getStateByCode(code)?.name ?? null;
}
