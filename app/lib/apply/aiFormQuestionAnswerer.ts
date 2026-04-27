import {
  getCachedApplicationAnswer,
  setCachedApplicationAnswer,
  type CachedApplicationAnswer,
} from "@/app/lib/apply/applicationAnswerCache";
import { generateApplicationFieldAnswer } from "@/app/lib/apply/ai-form-answer-generator";
import {
  classifyRequiredApplicationField,
  type RequiredApplicationFieldClassification,
} from "@/app/lib/apply/form-field-classifier";
import type { MappedApplicationField } from "@/app/lib/apply/formFieldMapper";

export type GenerateApplicationQuestionAnswerInput = {
  applicationId: string;
  sessionId: string;
  field: MappedApplicationField;
  jobTitle?: string | null;
  companyName?: string | null;
  jobDescription?: string | null;
  resumeText?: string | null;
  userProfile?: unknown;
  existingApplicationMaterials?: unknown;
  cachedAnswers?: CachedApplicationAnswer[];
};

export type GenerateApplicationQuestionAnswerResult = {
  answer: string | null;
  confidence: "high" | "medium" | "low";
  classification:
    | "answerable_by_ai"
    | "answerable_from_profile"
    | "answerable_from_resume"
    | "safe_default"
    | "requires_user_confirmation"
    | "sensitive_or_legal"
    | "unsupported";
  reason: string;
  shouldFill: boolean;
  shouldStop: boolean;
  cached?: boolean;
};

function toResultClassification(
  classification: RequiredApplicationFieldClassification,
  generatedClassification?: RequiredApplicationFieldClassification,
) {
  const effective = generatedClassification ?? classification;
  if (effective === "requires_user_confirmation") return "requires_user_confirmation";
  if (effective === "unsupported_field") return "unsupported";
  return effective;
}

function answerSourceFromHints(
  hints: string[],
): CachedApplicationAnswer["answerSource"] {
  if (hints.some((hint) => /profile|known_profile/i.test(hint))) return "profile";
  if (hints.some((hint) => /resume/i.test(hint))) return "resume";
  if (hints.some((hint) => /safe_default|application_source/i.test(hint))) {
    return "safe_default";
  }
  if (hints.some((hint) => /job|company/i.test(hint))) return "job";
  return "ai_generated";
}

export async function generateApplicationQuestionAnswer(
  input: GenerateApplicationQuestionAnswerInput,
): Promise<GenerateApplicationQuestionAnswerResult> {
  const classification = classifyRequiredApplicationField({
    questionLabel: input.field.label,
    fieldType: input.field.type,
    placeholder: input.field.sourceHints.placeholder,
    required: input.field.required,
    name: input.field.sourceHints.name,
    id: input.field.sourceHints.id,
    nearbyText: input.field.sourceHints.nearbyText,
    options: input.field.options?.map((option) => ({ label: option, value: option })),
  });

  if (classification.legal) {
    console.log("[AUTO_APPLY_AI_ANSWER] final gate blocked sensitive field", {
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      label: input.field.label,
      classification: classification.category,
      detailCategory: classification.detailCategory,
      reason: classification.reason,
    });
    return {
      answer: null,
      confidence: "low",
      classification: "sensitive_or_legal",
      reason: classification.reason,
      shouldFill: false,
      shouldStop: true,
    };
  }

  const cached =
    getCachedApplicationAnswer({
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      fieldFingerprint: input.field.fingerprint,
      questionLabel: input.field.label,
    }) ??
    input.cachedAnswers?.find(
      (answer) =>
        answer.fieldFingerprint === input.field.fingerprint ||
        answer.normalizedQuestionLabel === input.field.normalizedLabel,
    ) ??
    null;

  if (cached) {
    return {
      answer: cached.answer,
      confidence: cached.confidence,
      classification:
        cached.classification === "answerable_from_profile" ||
        cached.classification === "answerable_from_resume" ||
        cached.classification === "safe_default"
          ? cached.classification
          : "answerable_by_ai",
      reason: "Reused temporary answer generated earlier in this apply session.",
      shouldFill: true,
      shouldStop: false,
      cached: true,
    };
  }

  const generated = await generateApplicationFieldAnswer({
    questionLabel: input.field.label,
    fieldType: input.field.type,
    placeholder: input.field.sourceHints.placeholder,
    required: input.field.required,
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    jobDescription: input.jobDescription,
    resumeText: input.resumeText,
    profile: input.userProfile,
    applicationContext: input.existingApplicationMaterials,
  });

  const resultClassification = toResultClassification(
    classification.category,
    generated.classification,
  );
  if (!generated.answer || generated.requiresUserConfirmation) {
    console.log("[AUTO_APPLY_AI_ANSWER] final gate blocked sensitive field", {
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      label: input.field.label,
      classification: resultClassification,
      detailCategory: classification.detailCategory,
      reason: generated.reason || classification.reason,
    });
    return {
      answer: null,
      confidence: "low",
      classification:
        classification.sensitive || classification.legal
          ? "sensitive_or_legal"
          : resultClassification === "unsupported"
            ? "unsupported"
            : resultClassification,
      reason: generated.reason || classification.reason,
      shouldFill: false,
      shouldStop: true,
    };
  }

  setCachedApplicationAnswer({
    applicationId: input.applicationId,
    sessionId: input.sessionId,
    fieldId: input.field.fieldId,
    fieldFingerprint: input.field.fingerprint,
    questionLabel: input.field.label,
    label: input.field.label,
    normalizedLabel: input.field.normalizedLabel,
    answer: generated.answer,
    classification:
      generated.sourceHints.some((hint) => /safe_default|application_source/i.test(hint))
        ? "safe_default"
        : resultClassification,
    confidence: generated.confidence,
    answerSource: answerSourceFromHints(generated.sourceHints),
    sourceHints: generated.sourceHints,
  });

  console.log("[AUTO_APPLY_AI_ANSWER] final gate allowed answerable question", {
    applicationId: input.applicationId,
    sessionId: input.sessionId,
    label: input.field.label,
    fieldId: input.field.fieldId,
    classification: resultClassification,
    detailCategory: classification.detailCategory,
    confidence: generated.confidence,
    answerLength: generated.answer.length,
  });

  return {
    answer: generated.answer,
    confidence: generated.confidence,
    classification:
      generated.sourceHints.some((hint) => /safe_default|application_source/i.test(hint))
        ? "safe_default"
        : resultClassification,
    reason: generated.reason,
    shouldFill: true,
    shouldStop: false,
  };
}
