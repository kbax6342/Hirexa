export type LocationAnswerKind =
  | "country"
  | "city_state"
  | "city_state_country"
  | "state"
  | "unknown";

export type ResolveLocationAnswerInput = {
  userProfile: unknown;
  fieldLabel?: string | null;
  fieldOptions?: string[] | null;
  jobLocation?: string | null;
};

export type ResolveLocationAnswerResult = {
  answer: string | null;
  answerKind: LocationAnswerKind;
  confidence: "high" | "medium" | "low";
  source: "profile";
  reason: string;
};

export type ResolveProfileLocationForApplicationFieldResult = {
  answer: string | null;
  countryAnswer: string | null;
  fullLocationAnswer: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

const US_STATES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "ia",
  "id", "il", "in", "ks", "ky", "la", "ma", "md", "me", "mi", "mn", "mo",
  "ms", "mt", "nc", "nd", "ne", "nh", "nj", "nm", "nv", "ny", "oh", "ok",
  "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "va", "vt", "wa", "wi",
  "wv", "wy", "dc",
]);

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function first(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function readNested(root: Record<string, unknown>, path: string[]) {
  let current: unknown = root;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return text(current);
}

function isCountryQuestion(label: string, options?: string[] | null) {
  const optionText = (options ?? []).join(" ");
  return /\b(country|country\/region|country region|what country|based in)\b/i.test(
    `${label} ${optionText}`,
  );
}

function matchingCountryOption(options?: string[] | null) {
  return (options ?? []).find((option) =>
    /^(united states|united states of america|usa|us)$/i.test(text(option)),
  );
}

function isStateQuestion(label: string) {
  return /\b(state|province|region)\b/i.test(label) && !/\bcountry\b/i.test(label);
}

function inferUnitedStates(profile: Record<string, unknown>) {
  const country = first(profile.country, profile.countryName);
  if (/\b(us|usa|united states|united states of america|america)\b/i.test(country)) {
    return "United States";
  }

  const state = first(
    profile.state,
    profile.personalInfoState,
    profile.region,
    profile.province,
    readNested(profile, ["personalInfo", "state"]),
  ).toLowerCase();
  if (US_STATES.has(state)) return "United States";

  const location = first(
    profile.location,
    profile.address,
    profile.cityState,
    profile.personalInfoCity && profile.personalInfoState
      ? `${text(profile.personalInfoCity)}, ${text(profile.personalInfoState)}`
      : "",
  );
  if (/\b(usa|united states)\b/i.test(location)) return "United States";
  if (/\b[A-Z]{2}\b/.test(location) && /\b(savannah|atlanta|detroit|new york|los angeles|chicago)\b/i.test(location)) {
    return "United States";
  }

  return "";
}

export function resolveLocationAnswer(
  input: ResolveLocationAnswerInput,
): ResolveLocationAnswerResult {
  const profile = asRecord(input.userProfile);
  const keyQuestions = asRecord(profile.keyQuestions);
  const preferences = asRecord(keyQuestions.applicationAnswerPreferences);
  const label = text(input.fieldLabel).toLowerCase();
  const city = first(profile.city, readNested(profile, ["personalInfo", "city"]));
  const personalInfoCity = first(profile.personalInfoCity);
  const state = first(
    profile.state,
    profile.region,
    profile.province,
    profile.personalInfoState,
    readNested(profile, ["personalInfo", "state"]),
  );
  const savedCountry = first(
    profile.country,
    profile.countryName,
    profile.personalInfoCountry,
    readNested(profile, ["personalInfo", "country"]),
    preferences.country,
  );
  const resolvedCity = city || personalInfoCity;
  const country = savedCountry || inferUnitedStates(profile);
  const fallbackLocation = first(
    preferences.fallbackLocation,
    profile.location,
    readNested(profile, ["personalInfo", "location"]),
  );

  let answer = "";
  let answerKind: LocationAnswerKind = "unknown";
  const countryOption = matchingCountryOption(input.fieldOptions);
  const optionsLookLikeCountries = Boolean(countryOption);
  if (isCountryQuestion(label, input.fieldOptions) || optionsLookLikeCountries) {
    answer = countryOption || country;
    answerKind = answer ? "country" : "unknown";
  } else if (isStateQuestion(label)) {
    answer = state;
    answerKind = answer ? "state" : "unknown";
  } else if (resolvedCity && state && country) {
    answer = `${resolvedCity}, ${state}, ${country}`;
    answerKind = "city_state_country";
  } else if (resolvedCity && state) {
    answer = `${resolvedCity}, ${state}`;
    answerKind = "city_state";
  } else if (fallbackLocation && country && !/\bunited states|usa|us\b/i.test(fallbackLocation)) {
    answer = `${fallbackLocation}, ${country}`;
    answerKind = "city_state_country";
  } else {
    answer = fallbackLocation || country || "";
    answerKind = country && answer === country ? "country" : answer ? "city_state" : "unknown";
  }

  if (!answer && input.jobLocation) {
    console.log("[AUTO_APPLY_LOCATION] profile location missing", {
      fieldLabel: text(input.fieldLabel),
      jobLocationAvailable: true,
    });
  }

  const result: ResolveLocationAnswerResult = {
    answer: answer || null,
    answerKind,
    confidence: answer ? (savedCountry || resolvedCity || state ? "high" : "medium") : "low",
    source: "profile",
    reason: answer
      ? "Resolved from saved profile location/country."
      : "No saved profile location/country was available.",
  };

  console.log("[AUTO_APPLY_LOCATION] resolved profile location answer", {
    fieldLabel: text(input.fieldLabel),
    answerKind: result.answerKind,
    confidence: result.confidence,
    hasCity: Boolean(resolvedCity),
    hasState: Boolean(state),
    hasCountry: Boolean(country),
    source: result.source,
  });

  return result;
}

export function resolveProfileLocationForApplicationField(
  input: ResolveLocationAnswerInput,
): ResolveProfileLocationForApplicationFieldResult {
  const profile = asRecord(input.userProfile);
  const city = first(
    profile.city,
    profile.personalInfoCity,
    readNested(profile, ["personalInfo", "city"]),
  );
  const state = first(
    profile.state,
    profile.personalInfoState,
    profile.region,
    profile.province,
    readNested(profile, ["personalInfo", "state"]),
  );
  const savedCountry = first(
    profile.country,
    profile.countryName,
    profile.personalInfoCountry,
    readNested(profile, ["personalInfo", "country"]),
  );
  const country = savedCountry || inferUnitedStates(profile);
  const fullLocation = [city, state, country].filter(Boolean).join(", ");
  const resolved = resolveLocationAnswer(input);
  const result: ResolveProfileLocationForApplicationFieldResult = {
    answer: matchingCountryOption(input.fieldOptions) && country ? country : resolved.answer,
    countryAnswer: country || null,
    fullLocationAnswer: fullLocation || null,
    confidence: country || fullLocation ? "high" : resolved.confidence,
    reason:
      country || fullLocation
        ? "Resolved profile country/location for application field."
        : resolved.reason,
  };

  console.log("[AUTO_APPLY_LOCATION] profile location resolved", {
    fieldLabel: text(input.fieldLabel),
    hasCountryAnswer: Boolean(result.countryAnswer),
    hasFullLocationAnswer: Boolean(result.fullLocationAnswer),
    confidence: result.confidence,
  });

  return result;
}
