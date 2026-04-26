import type {
  FieldAnswerCategory,
  FormFieldDescriptor,
} from "@/app/lib/apply/formIntelligence/types";

const LEGAL_PATTERNS =
  /(eeo|equal employment|demographic|gender|race|ethnicity|hispanic|latino|veteran|disability|disabled|self-identif|voluntary self|criminal|felony|background check|convict|certif(y|ication)|signature|e-sign|electronic signature|truthful|accurate|terms|conditions|privacy|consent|agreement|acknowledge|authorization to contact)/i;

const SENSITIVE_PATTERNS =
  /(legally authorized|work authorization|authori[sz]ed to work|visa|sponsor|sponsorship|require sponsorship|salary|compensation|pay expectation|desired pay|start date|availability|relocate|clearance|citizenship|age|date of birth|dob|ssn|social security)/i;

const FILE_PATTERNS = /(resume|cv|curriculum vitae|cover letter|attachment|upload)/i;

const SOURCE_PATTERNS =
  /(how did you hear|where did you hear|source|referred|referral|job board|found this opportunity)/i;

const PROFILE_PATTERNS =
  /(first name|last name|full name|preferred name|email|e-mail|phone|mobile|address|city|state|province|zip|postal|country|location|located|linkedin|linked in|portfolio|website|github|git hub|personal site)/i;

const RESUME_PATTERNS =
  /(years of experience|experience with|skills|technologies|current company|current title|education|degree|certification|project|hardest technical|technical problem|achievement|accomplishment)/i;

const MOTIVATION_PATTERNS =
  /(why (do|are) you|why.*interested|why.*work|what interests|cover letter|tell us about yourself|additional information|anything else|role fit|good fit|motivation)/i;

function fieldText(field: FormFieldDescriptor) {
  return [
    field.label,
    field.inferredLabel,
    field.name,
    field.idAttribute,
    field.ariaLabel,
    field.placeholder,
    field.nearbyText,
    field.sectionHeading,
    field.fieldsetLegend,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLabelKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export function isLegalOrComplianceField(field: FormFieldDescriptor) {
  return LEGAL_PATTERNS.test(fieldText(field));
}

export function isSensitiveField(field: FormFieldDescriptor) {
  return SENSITIVE_PATTERNS.test(fieldText(field));
}

export function classifyByPolicy(field: FormFieldDescriptor): {
  category: FieldAnswerCategory;
  reason: string;
  sensitive: boolean;
  legal: boolean;
} {
  const text = fieldText(field);
  const legal = isLegalOrComplianceField(field);
  const sensitive = isSensitiveField(field);

  if (!field.visible || field.disabled || field.inputType === "hidden") {
    return {
      category: "unsupported",
      reason: "Field is hidden, disabled, or not interactable.",
      sensitive,
      legal,
    };
  }

  if (field.inputType === "file" || FILE_PATTERNS.test(text)) {
    return {
      category: "file_upload",
      reason: "Field requests a resume, cover letter, or attachment.",
      sensitive,
      legal,
    };
  }

  if (legal) {
    return {
      category: "legal_requires_user_review",
      reason: "Legal, certification, consent, EEO, or demographic field.",
      sensitive,
      legal,
    };
  }

  if (sensitive) {
    return {
      category: "sensitive_requires_known_answer",
      reason: "Sensitive field can only be filled from known saved answers.",
      sensitive,
      legal,
    };
  }

  if (SOURCE_PATTERNS.test(text)) {
    return {
      category: "source_direct",
      reason: "Source question can be answered from the application source.",
      sensitive,
      legal,
    };
  }

  if (PROFILE_PATTERNS.test(text)) {
    return {
      category: "profile_direct",
      reason: "Contact, location, or profile-link field.",
      sensitive,
      legal,
    };
  }

  if (RESUME_PATTERNS.test(text)) {
    return {
      category: field.options?.length ? "ai_choice_safe" : "resume_direct",
      reason: "Experience or resume-backed field.",
      sensitive,
      legal,
    };
  }

  if (MOTIVATION_PATTERNS.test(text)) {
    return {
      category: field.options?.length ? "ai_choice_safe" : "ai_free_text_safe",
      reason: "Safe career motivation or role-fit question.",
      sensitive,
      legal,
    };
  }

  if (field.inputType === "select" || field.inputType === "radio") {
    return {
      category: "unknown_requires_user_review",
      reason: "Choice field is not confidently understood.",
      sensitive,
      legal,
    };
  }

  if (field.inputType === "checkbox") {
    return {
      category: "unknown_requires_user_review",
      reason: "Unknown checkbox should not be checked automatically.",
      sensitive,
      legal,
    };
  }

  return {
    category: field.required
      ? "unknown_requires_user_review"
      : "ai_free_text_safe",
    reason: field.required
      ? "Required field label is ambiguous."
      : "Optional free-text field can be answered conservatively.",
    sensitive,
    legal,
  };
}
