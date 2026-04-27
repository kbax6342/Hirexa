export const SELECT_PLACEHOLDER_OPTION = "";
export const SELF_DESCRIBE_OPTION = "I self-describe";
export const PREFER_NOT_TO_ANSWER_OPTION = "Prefer not to answer";

export const GENDER_OPTIONS = [
  SELECT_PLACEHOLDER_OPTION,
  "Man",
  "Woman",
  "Non-binary",
  SELF_DESCRIBE_OPTION,
  PREFER_NOT_TO_ANSWER_OPTION,
] as const;

export const HISPANIC_LATINO_OPTIONS = [
  SELECT_PLACEHOLDER_OPTION,
  "Yes",
  "No",
  PREFER_NOT_TO_ANSWER_OPTION,
] as const;

export const RACE_ETHNICITY_OPTIONS = [
  SELECT_PLACEHOLDER_OPTION,
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Native Hawaiian or Other Pacific Islander",
  "White",
  "Two or More Races",
  SELF_DESCRIBE_OPTION,
  PREFER_NOT_TO_ANSWER_OPTION,
] as const;

export const VETERAN_STATUS_OPTIONS = [
  SELECT_PLACEHOLDER_OPTION,
  "I am not a protected veteran",
  "I identify as one or more of the classifications of protected veteran",
  "I am a disabled veteran",
  "I am a recently separated veteran",
  "I am an active duty wartime or campaign badge veteran",
  "I am an Armed Forces service medal veteran",
  PREFER_NOT_TO_ANSWER_OPTION,
] as const;

export const DISABILITY_STATUS_OPTIONS = [
  SELECT_PLACEHOLDER_OPTION,
  "Yes, I have a disability, or have had one in the past",
  "No, I do not have a disability and have not had one in the past",
  PREFER_NOT_TO_ANSWER_OPTION,
] as const;

export const VOLUNTARY_SELF_ID_OPTION_MAP = {
  gender: GENDER_OPTIONS,
  hispanicLatino: HISPANIC_LATINO_OPTIONS,
  raceEthnicity: RACE_ETHNICITY_OPTIONS,
  veteranStatus: VETERAN_STATUS_OPTIONS,
  disabilityStatus: DISABILITY_STATUS_OPTIONS,
} as const;

export type VoluntarySelfIdDropdownField = keyof typeof VOLUNTARY_SELF_ID_OPTION_MAP;

export function normalizeVoluntarySelfIdOption(
  field: VoluntarySelfIdDropdownField,
  value: unknown,
) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const options = VOLUNTARY_SELF_ID_OPTION_MAP[field] as readonly string[];
  return options.includes(text) && text !== SELECT_PLACEHOLDER_OPTION ? text : null;
}

export function sanitizeVoluntarySelfDescription(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 100) : null;
}

export function isPreferNotToAnswer(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === PREFER_NOT_TO_ANSWER_OPTION.toLowerCase();
}

export function isPreferNotEquivalent(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return (
    text === PREFER_NOT_TO_ANSWER_OPTION.toLowerCase() ||
    /\b(prefer not|decline|do not wish|don't wish|choose not|not disclose|no answer)\b/.test(text) ||
    /decline to self[-\s]?identify/.test(text)
  );
}

export function optionLabel(option: string) {
  return option || "Select...";
}
