import {
  classifyByPolicy,
  normalizeLabelKey,
} from "@/app/lib/apply/formIntelligence/answerPolicy";
import type {
  FieldClassification,
  FormFieldDescriptor,
} from "@/app/lib/apply/formIntelligence/types";

export function classifyFormField(
  field: FormFieldDescriptor,
): FieldClassification {
  const policy = classifyByPolicy(field);
  const label = field.label || field.inferredLabel || field.name || field.id;

  return {
    fieldId: field.id,
    label,
    category: policy.category,
    normalizedKey: normalizeLabelKey(label),
    confidence:
      policy.category === "unknown_requires_user_review" ||
      policy.category === "unsupported"
        ? "low"
        : policy.legal || policy.sensitive
          ? "medium"
          : "high",
    reason: policy.reason,
    sensitive: policy.sensitive,
    legal: policy.legal,
  };
}

export function classifyFormFields(fields: FormFieldDescriptor[]) {
  return fields.map((field) => classifyFormField(field));
}
