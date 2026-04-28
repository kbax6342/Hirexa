export type FormInputType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "hidden"
  | "unknown";

export type FormFieldOption = {
  label: string;
  value: string;
  selector?: string;
};

export type FormFieldDescriptor = {
  id: string;
  selector: string;
  stableSelector?: string;
  label: string;
  inferredLabel?: string;
  labelConfidence?: "high" | "medium" | "low";
  labelSources?: string[];
  inputType: FormInputType;
  required: boolean;
  disabled: boolean;
  visible: boolean;
  placeholder?: string;
  tagName?: string;
  name?: string;
  ariaLabel?: string;
  ariaLabelledByText?: string;
  ariaDescribedByText?: string;
  roleAttribute?: string;
  idAttribute?: string;
  inputMode?: string;
  autocomplete?: string;
  options?: FormFieldOption[];
  maxLength?: number;
  minLength?: number;
  validationText?: string;
  nearbyText?: string;
  parentGroupText?: string;
  sectionHeading?: string;
  fieldsetLegend?: string;
  errorText?: string;
  frameUrl?: string;
  pageUrl: string;
  pageTitle?: string;
};

export type FieldAnswerCategory =
  | "profile_direct"
  | "resume_direct"
  | "source_direct"
  | "ai_free_text_safe"
  | "ai_choice_safe"
  | "file_upload"
  | "sensitive_requires_known_answer"
  | "legal_requires_user_review"
  | "unknown_requires_user_review"
  | "unsupported";

export type FieldClassification = {
  fieldId: string;
  label: string;
  category: FieldAnswerCategory;
  normalizedKey?: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  sensitive: boolean;
  legal: boolean;
};

export type GeneratedFormAnswer = {
  fieldId: string;
  label: string;
  value: string | string[] | boolean;
  confidence: "high" | "medium" | "low";
  sourceBasis: string[];
  safeToAutofill: boolean;
  requiresUserReview: boolean;
  reason: string;
};

export type GenerateFormAnswersInput = {
  userProfile: unknown;
  resumeText?: string;
  resumeSummary?: string;
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  pageText?: string;
  source?: string;
  existingApplicationAnswers?: Record<string, string>;
  fields: FormFieldDescriptor[];
};

export type GenerateFormAnswersResult = {
  answers: GeneratedFormAnswer[];
  blockedFields: Array<{
    fieldId: string;
    label: string;
    reason: string;
    category:
      | "sensitive"
      | "legal"
      | "unknown"
      | "unsupported"
      | "low_confidence";
  }>;
};

export type FillGeneratedAnswersResult = {
  filledCount: number;
  skippedCount: number;
  failedCount: number;
  filledFields: Array<{ fieldId: string; label: string }>;
  skippedFields: Array<{ fieldId: string; label: string; reason: string }>;
  failedFields: Array<{ fieldId: string; label: string; reason: string }>;
  remainingRequiredFields: string[];
  resumeUploadAttempted: boolean;
  resumeUploadSucceeded: boolean;
};
