export type ApplicationFieldClassification =
  | "basic_profile"
  | "contact"
  | "phone_country_code"
  | "location"
  | "work_authorization"
  | "job_preference"
  | "compensation"
  | "benefit_preference"
  | "voluntary_self_id"
  | "open_ended"
  | "file_upload"
  | "unknown";

export type ClassifyApplicationFieldInput = {
  label?: string | null;
  name?: string | null;
  placeholder?: string | null;
  type?: string | null;
  options?: Array<{ label?: string | null; value?: string | null }> | string[] | null;
};

function normalize(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function fieldText(input: ClassifyApplicationFieldInput) {
  const optionText = Array.isArray(input.options)
    ? input.options
        .map((option) =>
          typeof option === "string"
            ? option
            : `${option.label ?? ""} ${option.value ?? ""}`,
        )
        .join(" ")
    : "";
  return [
    input.label,
    input.name,
    input.placeholder,
    input.type,
    optionText,
  ]
    .map(normalize)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function classifyApplicationField(
  input: ClassifyApplicationFieldInput,
): ApplicationFieldClassification {
  const text = fieldText(input);
  const type = normalize(input.type).toLowerCase();

  let classification: ApplicationFieldClassification = "unknown";
  if (type === "file" || /\b(resume|cv|cover letter|attachment|upload)\b/i.test(text)) {
    classification = "file_upload";
  } else if (
    /(g-recaptcha-response|recaptcha|hcaptcha|captcha|turnstile|security.?token)/i.test(text)
  ) {
    classification = "unknown";
  } else if (
    /\b(gender|race|ethnicity|hispanic|latino|veteran|disability|disabled|self-identif|pronouns?)\b/i.test(
      text,
    )
  ) {
    classification = "voluntary_self_id";
  } else if (/\b(phone|telephone|mobile|tel)\b/i.test(text) && /(country code|calling code|dial code|\+\d|phone country)/i.test(text)) {
    classification = "phone_country_code";
  } else if (/(country code|calling code|dial code|\+1|\+\d)/i.test(text)) {
    classification = "phone_country_code";
  } else if (/\b(phone|telephone|mobile|tel)\b/i.test(text)) {
    classification = "contact";
  } else if (/\b(first name|last name|full name|preferred name|email|e-mail|linkedin|portfolio|website|github|personal site)\b/i.test(text)) {
    classification = "basic_profile";
  } else if (/\b(address|city|state|province|zip|postal|country|location|located)\b/i.test(text)) {
    classification = "location";
  } else if (/(legally authorized|work authorization|authori[sz]ed to work|visa|sponsor|sponsorship|require sponsorship)/i.test(text)) {
    classification = "work_authorization";
  } else if (/\b(salary|compensation|pay expectation|desired pay|hourly|yearly)\b/i.test(text)) {
    classification = "compensation";
  } else if (/\b(benefit|health insurance|dental|vision|401|pto|paid time|remote work|hybrid schedule)\b/i.test(text)) {
    classification = "benefit_preference";
  } else if (/(availability|start date|employment type|seniority|remote|hybrid|on.?site|onsite|relocat|work setup|target role)/i.test(text)) {
    classification = "job_preference";
  } else if (/(why (do|are) you|why.*interested|why.*work|hardest technical|technical problem|tell us about|describe|project|good fit|relevant experience|cover letter)/i.test(text)) {
    classification = "open_ended";
  }

  console.log("[APPLICATION_FIELD_CLASSIFIER]", {
    label: normalize(input.label),
    type,
    classification,
  });

  return classification;
}

export function isSensitiveVoluntaryField(
  classification: ApplicationFieldClassification,
) {
  return classification === "voluntary_self_id";
}

export function canUseAiGeneratedAnswer(
  classification: ApplicationFieldClassification,
) {
  return classification === "open_ended";
}

export function shouldPromptUser(
  classification: ApplicationFieldClassification,
  existingAnswer: unknown,
) {
  const hasExisting = normalize(existingAnswer).length > 0;
  if (hasExisting) return false;
  return (
    classification === "voluntary_self_id" ||
    classification === "work_authorization" ||
    classification === "compensation" ||
    classification === "unknown" ||
    classification === "open_ended"
  );
}
