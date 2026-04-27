import { normalizeApplicationFieldLabel } from "@/app/lib/apply/formFieldMapper";

export type CachedApplicationAnswer = {
  applicationId: string;
  sessionId: string;
  fieldId?: string;
  fieldFingerprint: string;
  questionLabel: string;
  normalizedQuestionLabel: string;
  label?: string;
  normalizedLabel?: string;
  answer: string;
  classification?: string;
  confidence: "high" | "medium" | "low";
  answerSource: "profile" | "resume" | "job" | "ai_generated" | "safe_default";
  sourceHints?: string[];
  generatedAt: string;
};

const cache = new Map<string, CachedApplicationAnswer>();

function cacheKey(args: {
  applicationId: string;
  sessionId: string;
  fieldFingerprint?: string | null;
  questionLabel?: string | null;
}) {
  const normalizedQuestionLabel = normalizeApplicationFieldLabel(args.questionLabel);
  return [
    args.applicationId,
    args.sessionId,
    args.fieldFingerprint || normalizedQuestionLabel,
  ].join(":");
}

export function getCachedApplicationAnswer(args: {
  applicationId: string;
  sessionId: string;
  fieldFingerprint?: string | null;
  questionLabel?: string | null;
}) {
  const direct = cache.get(cacheKey(args));
  if (direct) return direct;

  const normalizedQuestionLabel = normalizeApplicationFieldLabel(args.questionLabel);
  for (const answer of cache.values()) {
    if (
      answer.applicationId === args.applicationId &&
      answer.sessionId === args.sessionId &&
      answer.normalizedQuestionLabel === normalizedQuestionLabel
    ) {
      return answer;
    }
  }
  return null;
}

export function setCachedApplicationAnswer(
  answer: Omit<CachedApplicationAnswer, "normalizedQuestionLabel" | "generatedAt"> & {
    generatedAt?: string;
  },
) {
  const cached: CachedApplicationAnswer = {
    ...answer,
    normalizedQuestionLabel: normalizeApplicationFieldLabel(answer.questionLabel),
    normalizedLabel:
      answer.normalizedLabel ?? normalizeApplicationFieldLabel(answer.label ?? answer.questionLabel),
    generatedAt: answer.generatedAt ?? new Date().toISOString(),
  };
  cache.set(
    cacheKey({
      applicationId: cached.applicationId,
      sessionId: cached.sessionId,
      fieldFingerprint: cached.fieldFingerprint,
      questionLabel: cached.questionLabel,
    }),
    cached,
  );
  return cached;
}

export function listCachedApplicationAnswers(args: {
  applicationId: string;
  sessionId: string;
}) {
  return Array.from(cache.values()).filter(
    (answer) =>
      answer.applicationId === args.applicationId &&
      answer.sessionId === args.sessionId,
  );
}

export function clearCachedApplicationAnswers(args: {
  applicationId: string;
  sessionId: string;
}) {
  for (const [key, answer] of cache.entries()) {
    if (
      answer.applicationId === args.applicationId &&
      answer.sessionId === args.sessionId
    ) {
      cache.delete(key);
    }
  }
}
