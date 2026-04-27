export type RequiredApplicationFieldClassification =
  | "answerable_by_ai"
  | "answerable_from_profile"
  | "answerable_from_resume"
  | "requires_user_confirmation"
  | "unsupported_field";

export type ClassifyRequiredApplicationFieldInput = {
  questionLabel?: string | null;
  fieldType?: string | null;
  placeholder?: string | null;
  required?: boolean | null;
  name?: string | null;
  id?: string | null;
  nearbyText?: string | null;
  options?: Array<{ label?: string; value?: string }> | null;
};

export type RequiredApplicationFieldClassificationResult = {
  category: RequiredApplicationFieldClassification;
  detailCategory?:
    | "open_ended_application_question"
    | "resume_backed_experience_question"
    | "company_interest_question"
    | "profile_contact_field"
    | "profile_location_field"
    | "profile_link_field"
    | "phone_number_field"
    | "phone_country_code_field"
    | "sensitive_or_legal_field"
    | "hidden_security_token"
    | "unsupported_field";
  reason: string;
  sensitive: boolean;
  legal: boolean;
};

function normalize(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function combinedText(input: ClassifyRequiredApplicationFieldInput) {
  return [
    input.questionLabel,
    input.placeholder,
    input.name,
    input.id,
    input.nearbyText,
  ]
    .map(normalize)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const LEGAL_OR_CONSENT =
  /(eeo|equal employment|demographic|gender|race|ethnicity|hispanic|latino|veteran|disability|disabled|self-identif|voluntary self|criminal|felony|background check|convict|certif(y|ication)|signature|e-sign|electronic signature|truthful|accurate|terms|conditions|privacy|consent|agreement|acknowledge|i agree|authorization to contact)/i;

const SENSITIVE_REQUIRES_KNOWN =
  /(legally authorized|work authorization|authori[sz]ed to work|visa|sponsor|sponsorship|require sponsorship|salary|compensation|pay expectation|desired pay|start date|availability|relocate|clearance|citizenship|age|date of birth|dob|ssn|social security)/i;

const PROFILE_DIRECT =
  /(first name|last name|full name|preferred name|email|e-mail|phone|mobile|address|city|state|province|zip|postal|country|location|located|linkedin|linked in|portfolio|website|github|git hub|personal site|remote|hybrid|on.?site|onsite)/i;

const SOURCE_DIRECT =
  /(how did you hear|where did you hear|source|referred|referral|job board|found this opportunity)/i;

const RESUME_DIRECT =
  /(years of experience|experience with|skills|technologies|current company|current title|education|degree|certification|project|hardest technical|technical problem|achievement|accomplishment)/i;

const AI_SAFE =
  /(why (do|are) you|why.*interested|why.*work|why.*company|what interests|cover letter|tell us about yourself|about yourself|describe .*project|relevant experience|additional information|anything else|role fit|good fit|motivation|hardest|technical problem|challenge|project|proudest|impact)/i;

function isOpenEndedField(fieldType: string, text: string) {
  return (
    fieldType === "textarea" ||
    fieldType === "contenteditable" ||
    /\?/.test(text) ||
    /\b(why|describe|tell us|what is|what are|worked on|interested in|good fit)\b/i.test(
      text,
    )
  );
}

function profileDetailCategory(text: string) {
  if (/\b(phone|telephone|mobile|tel)\b/i.test(text)) return "phone_number_field" as const;
  if (/\b(linkedin|linked in|portfolio|website|github|git hub|personal site)\b/i.test(text)) {
    return "profile_link_field" as const;
  }
  if (/\b(address|city|state|province|zip|postal|country|location|located|remote|hybrid|on.?site|onsite)\b/i.test(text)) {
    return "profile_location_field" as const;
  }
  return "profile_contact_field" as const;
}

export function classifyRequiredApplicationField(
  input: ClassifyRequiredApplicationFieldInput,
): RequiredApplicationFieldClassificationResult {
  const text = combinedText(input);
  const fieldType = normalize(input.fieldType).toLowerCase();
  const legal = LEGAL_OR_CONSENT.test(text);
  const sensitive = SENSITIVE_REQUIRES_KNOWN.test(text);
  const openEnded = isOpenEndedField(fieldType, text);

  if (fieldType === "file") {
    return {
      category: "unsupported_field",
      detailCategory: "unsupported_field",
      reason: "File inputs require the dedicated upload path.",
      sensitive,
      legal,
    };
  }

  if (/(g-recaptcha-response|recaptcha|hcaptcha|cf-turnstile|turnstile|captcha|security.?token)/i.test(text)) {
    return {
      category: "unsupported_field",
      detailCategory: "hidden_security_token",
      reason: "Hidden CAPTCHA or security token is not a normal application answer field.",
      sensitive,
      legal,
    };
  }

  if (legal) {
    return {
      category: "requires_user_confirmation",
      detailCategory: "sensitive_or_legal_field",
      reason: "Legal, consent, certification, EEO, or demographic field.",
      sensitive,
      legal,
    };
  }

  if (sensitive) {
    return {
      category: "requires_user_confirmation",
      detailCategory: "sensitive_or_legal_field",
      reason:
        "Sensitive preference or authorization field can only be filled from known saved data.",
      sensitive,
      legal,
    };
  }

  if (SOURCE_DIRECT.test(text) || PROFILE_DIRECT.test(text)) {
    if (openEnded && RESUME_DIRECT.test(text)) {
      return {
        category: "answerable_from_resume",
        detailCategory: "resume_backed_experience_question",
        reason: "The field asks about experience or resume-backed context.",
        sensitive,
        legal,
      };
    }

    if (openEnded && AI_SAFE.test(text)) {
      return {
        category: "answerable_by_ai",
        detailCategory: /why/i.test(text)
          ? "company_interest_question"
          : "open_ended_application_question",
        reason:
          "Required open-ended application question is safe to answer from resume/job context.",
        sensitive,
        legal,
      };
    }

    return {
      category: "answerable_from_profile",
      detailCategory: profileDetailCategory(text),
      reason: "The field can be answered from profile or application source data.",
      sensitive,
      legal,
    };
  }

  if (RESUME_DIRECT.test(text)) {
    return {
      category: openEnded ? "answerable_by_ai" : "answerable_from_resume",
      detailCategory: "resume_backed_experience_question",
      reason: openEnded
        ? "Open-ended experience question is safe to answer from resume/job context."
        : "The field asks about experience or resume-backed context.",
      sensitive,
      legal,
    };
  }

  if (
    AI_SAFE.test(text) ||
    fieldType === "textarea" ||
    (input.required === true && fieldType === "text")
  ) {
    return {
      category: "answerable_by_ai",
      detailCategory: AI_SAFE.test(text)
        ? /why/i.test(text)
          ? "company_interest_question"
          : "open_ended_application_question"
        : "open_ended_application_question",
      reason: "Required application question is safe to answer from resume/job context.",
      sensitive,
      legal,
    };
  }

  return {
    category: input.required ? "requires_user_confirmation" : "unsupported_field",
    detailCategory: input.required ? "unsupported_field" : "unsupported_field",
    reason: input.required
      ? "Required field is not confidently understood."
      : "Optional field is not needed for automation.",
    sensitive,
    legal,
  };
}
