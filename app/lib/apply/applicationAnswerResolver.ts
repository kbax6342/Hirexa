import { generateApplicationFieldAnswer } from "@/app/lib/apply/ai-form-answer-generator";
import {
  canUseAiGeneratedAnswer,
  classifyApplicationField,
  isSensitiveVoluntaryField,
  type ClassifyApplicationFieldInput,
} from "@/app/lib/apply/applicationFieldClassifier";
import {
  isPreferNotEquivalent,
  isPreferNotToAnswer,
} from "@/app/lib/profile/voluntarySelfIdOptions";
import { resolveLocationAnswer } from "@/app/lib/apply/locationAnswerResolver";

export type ApplicationAnswerResolverInput = ClassifyApplicationFieldInput & {
  required?: boolean | null;
  userProfile?: unknown;
  applicationAnswerPreferences?: unknown;
  resumeText?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  jobLocation?: string | null;
  jobDescription?: string | null;
  currentAnswers?: Record<string, string> | null;
};

export type ApplicationAnswerResolverResult = {
  answer: string | null;
  source:
    | "profile"
    | "preferences"
    | "user_saved"
    | "user_current"
    | "ai_draft"
    | "unanswered";
  needsUser: boolean;
  sensitive: boolean;
  reason: string;
  classification: ReturnType<typeof classifyApplicationField>;
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNested(root: Record<string, unknown>, path: string[]) {
  let current: unknown = root;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return text(current);
}

function combinedLabel(input: ClassifyApplicationFieldInput) {
  return [input.label, input.name, input.placeholder]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function optionText(option: NonNullable<ClassifyApplicationFieldInput["options"]>[number]) {
  return typeof option === "string" ? option : `${option.label ?? ""} ${option.value ?? ""}`;
}

function matchPreferNotToAnswerOption(input: ClassifyApplicationFieldInput, answer: string) {
  if (!isPreferNotToAnswer(answer) || !Array.isArray(input.options)) {
    return answer;
  }

  const matched = input.options.find((option) => isPreferNotEquivalent(optionText(option)));
  if (!matched) return answer;
  return typeof matched === "string" ? matched : text(matched.label) || text(matched.value) || answer;
}

function first(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function yesNo(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return "";
  if (["yes", "y", "true", "authorized", "1"].includes(normalized)) return "Yes";
  if (["no", "n", "false", "0"].includes(normalized)) return "No";
  return text(value);
}

function resolvePhoneCountryCode(profile: Record<string, unknown>, preferences: Record<string, unknown>) {
  const saved = first(
    readNested(preferences, ["workAuthorization", "phoneCountryCode"]),
    preferences.phoneCountryCode,
    profile.countryCode,
  );
  if (saved) return saved;

  const country = first(profile.country, preferences.country, preferences.fallbackLocation).toLowerCase();
  if (/\b(us|usa|united states|america)\b/.test(country) || !country) return "+1";
  return "";
}

function currentAnswerFor(input: ApplicationAnswerResolverInput) {
  const answers = input.currentAnswers ?? {};
  const candidates = [input.label, input.name, input.placeholder]
    .map(text)
    .filter(Boolean);
  for (const key of candidates) {
    const direct = text(answers[key]);
    if (direct) return direct;
  }
  return "";
}

export async function resolveApplicationFieldAnswer(
  input: ApplicationAnswerResolverInput,
): Promise<ApplicationAnswerResolverResult> {
  const classification = classifyApplicationField(input);
  const profile = asRecord(input.userProfile);
  const preferences = asRecord(input.applicationAnswerPreferences);
  const voluntary = asRecord(preferences.voluntarySelfId);
  const workAuth = asRecord(preferences.workAuthorization);
  const customAnswers = asRecord(preferences.customAnswers);
  const label = combinedLabel(input);
  const current = currentAnswerFor(input);

  if (current) {
    console.log("[APPLICATION_ANSWER_RESOLVER]", {
      label: text(input.label),
      classification,
      source: "user_current",
      answered: true,
      sensitive: isSensitiveVoluntaryField(classification),
    });
    return {
      answer: current,
      source: "user_current",
      needsUser: false,
      sensitive: isSensitiveVoluntaryField(classification),
      reason: "Used answer provided for the current apply session.",
      classification,
    };
  }

  const savedCustom = text(customAnswers[text(input.label)] ?? customAnswers[label]);
  if (savedCustom) {
    return {
      answer: savedCustom,
      source: "user_saved",
      needsUser: false,
      sensitive: isSensitiveVoluntaryField(classification),
      reason: "Used a user-saved application answer preference.",
      classification,
    };
  }

  let answer = "";
  let source: ApplicationAnswerResolverResult["source"] = "unanswered";
  let reason = "No safe saved answer was available.";

  if (classification === "basic_profile" || classification === "contact") {
    answer =
      label.includes("first") ? text(profile.firstName) :
      label.includes("last") ? text(profile.lastName) :
      label.includes("name") ? [profile.firstName, profile.lastName].map(text).filter(Boolean).join(" ") :
      label.includes("email") ? text(profile.email) :
      label.includes("phone") || label.includes("mobile") ? text(profile.phone) :
      label.includes("linkedin") ? text(profile.linkedinUrl) :
      label.includes("github") ? readNested(profile, ["professionalLinks", "github"]) :
      label.includes("portfolio") || label.includes("website") ? first(profile.portfolioUrl, readNested(profile, ["professionalLinks", "website"])) :
      "";
    source = "profile";
    reason = "Resolved from saved profile data.";
  } else if (classification === "phone_country_code") {
    answer = resolvePhoneCountryCode(profile, preferences);
    source = answer ? "profile" : "unanswered";
    reason = answer
      ? "Resolved phone country code from saved country code, profile country, or safe US default."
      : "No safe phone country code was available.";
  } else if (classification === "location") {
    const locationAnswer = resolveLocationAnswer({
      userProfile: input.userProfile,
      fieldLabel: input.label,
      fieldOptions: input.options?.map(optionText),
      jobLocation: input.jobLocation,
    });
    answer = locationAnswer.answer ?? "";
    source = answer ? "profile" : "unanswered";
    reason = answer
      ? locationAnswer.reason
      : "No saved profile location/country was available.";
  } else if (classification === "work_authorization") {
    answer =
      label.includes("sponsor") || label.includes("visa")
        ? yesNo(first(workAuth.requiresSponsorship, profile.sponsorship))
        : label.includes("relocat")
          ? yesNo(first(workAuth.relocate, profile.relocate))
          : label.includes("start") || label.includes("availability")
            ? first(workAuth.startDate, preferences.availability, profile.startDate)
            : yesNo(first(workAuth.authorizedUS, profile.authorizedUS));
    source = answer ? "preferences" : "unanswered";
    reason = answer
      ? "Resolved from saved work authorization/application preferences."
      : "This field requires a user-provided work authorization preference.";
  } else if (classification === "job_preference") {
    answer =
      label.includes("availability") || label.includes("start")
        ? first(workAuth.startDate, preferences.availability, profile.startDate)
        : label.includes("employment")
          ? text(preferences.employmentType)
          : label.includes("seniority")
            ? text(preferences.seniorityLevel)
            : label.includes("remote") || label.includes("hybrid")
              ? preferences.remote === true || profile.includeRemote === true ? "Yes" : ""
              : label.includes("relocat")
                ? yesNo(first(workAuth.relocate, profile.relocate))
                : text(preferences.targetRole ?? preferences.roleFocus);
    source = answer ? "preferences" : "unanswered";
    reason = answer ? "Resolved from saved job-matching/application preferences." : reason;
  } else if (classification === "compensation") {
    answer = first(preferences.minimumSalary, profile.minCompensation);
    source = answer ? "preferences" : "unanswered";
    reason = answer
      ? "Resolved from saved compensation preference."
      : "Compensation preference is not saved and should be confirmed by the user.";
  } else if (classification === "benefit_preference") {
    const benefits = Array.isArray(preferences.benefits) ? preferences.benefits.map(text).filter(Boolean) : [];
    answer = benefits.join(", ");
    source = answer ? "preferences" : "unanswered";
    reason = answer ? "Resolved from saved benefit preferences." : reason;
  } else if (classification === "voluntary_self_id") {
    const hasSavedVoluntaryAnswer = label.includes("gender")
      ? Boolean(text(voluntary.gender) || text(voluntary.genderSelfDescribe))
      : label.includes("hispanic") || label.includes("latino")
        ? Boolean(text(voluntary.hispanicLatino))
        : label.includes("race") || label.includes("ethnicity")
          ? Boolean(text(voluntary.raceEthnicity) || text(voluntary.raceEthnicitySelfDescribe))
          : label.includes("veteran")
            ? Boolean(text(voluntary.veteranStatus))
            : label.includes("disability") || label.includes("disabled")
              ? Boolean(text(voluntary.disabilityStatus))
              : label.includes("pronoun")
                ? Boolean(text(voluntary.pronouns))
                : false;
    console.log("[VOLUNTARY_SELF_ID_FORM_FIELD_DETECTED]", {
      label: text(input.label),
      required: Boolean(input.required),
      hasSavedAnswer: hasSavedVoluntaryAnswer,
    });
    answer =
      label.includes("gender") && /(self[-\s]?describe|describe yourself|specify)/i.test(label) ? text(voluntary.genderSelfDescribe) :
      label.includes("gender") ? text(voluntary.gender) :
      label.includes("hispanic") || label.includes("latino") ? text(voluntary.hispanicLatino) :
      (label.includes("race") || label.includes("ethnicity")) && /(self[-\s]?describe|describe yourself|specify)/i.test(label) ? text(voluntary.raceEthnicitySelfDescribe) :
      label.includes("race") || label.includes("ethnicity") ? text(voluntary.raceEthnicity) :
      label.includes("veteran") ? text(voluntary.veteranStatus) :
      label.includes("disability") || label.includes("disabled") ? text(voluntary.disabilityStatus) :
      label.includes("pronoun") ? text(voluntary.pronouns) :
      "";
    answer = matchPreferNotToAnswerOption(input, answer);
    source = answer ? "user_saved" : "unanswered";
    reason = answer
      ? "Used explicit saved voluntary self-identification answer."
      : "Voluntary self-identification fields are never guessed.";
  } else if (canUseAiGeneratedAnswer(classification)) {
    const draft = await generateApplicationFieldAnswer({
      questionLabel: text(input.label),
      fieldType: text(input.type),
      placeholder: input.placeholder ?? undefined,
      required: Boolean(input.required),
      jobTitle: input.jobTitle,
      companyName: input.companyName,
      jobDescription: input.jobDescription,
      resumeText: input.resumeText,
      profile: input.userProfile,
      applicationContext: {},
    });
    answer = text(draft.answer);
    source = answer ? "ai_draft" : "unanswered";
    reason = answer
      ? "Generated an AI draft for user review before autofill."
      : "Could not generate a safe draft from the available context.";
  }

  const sensitive = isSensitiveVoluntaryField(classification);
  const needsUser = !answer || source === "ai_draft" || sensitive;
  console.log("[APPLICATION_ANSWER_RESOLVER]", {
    label: text(input.label),
    classification,
    source,
    answered: Boolean(answer),
    needsUser,
    sensitive,
  });

  return {
    answer: answer || null,
    source,
    needsUser,
    sensitive,
    reason,
    classification,
  };
}
