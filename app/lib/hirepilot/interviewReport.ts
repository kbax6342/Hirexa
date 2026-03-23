export type HirePilotSessionStatus = "listening" | "completed" | "canceled" | "failed";

export type HirePilotSessionInputSource = "microphone" | "tab_audio" | "practice";

export type HirePilotDetectedQuestion = {
  question: string;
};

export type HirePilotSuggestedAnswer = {
  question: string;
  answer: string;
  source: "openai" | "fallback" | null;
};

export type HirePilotInterviewReport = {
  interviewDateTime: string;
  completedAt: string | null;
  summary: string;
  interviewTopics: string[];
  strongestAnswers: Array<{
    question: string;
    answer: string;
  }>;
  weakerAnswerOpportunities: string[];
  followUpQuestions: string[];
  coachingTips: string[];
  feedback: {
    confidence: string;
    clarity: string;
    specificity: string;
  };
  overallSummary: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function dedupeByQuestion<T extends { question: string }>(values: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const normalizedQuestion = normalizeText(value.question);
    if (!normalizedQuestion) continue;

    const key = normalizedQuestion.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...value,
      question: normalizedQuestion,
    });
  }

  return result;
}

function scoreAnswer(answer: string, source?: "openai" | "fallback" | null) {
  const normalized = normalizeText(answer);
  let score = normalized.length;

  if (source === "openai") {
    score += 40;
  }

  if (/\b(result|impact|improved|increased|reduced|delivered|led|managed)\b/i.test(normalized)) {
    score += 25;
  }

  if (/\b(example|specific|measurable|outcome|team|customer|project)\b/i.test(normalized)) {
    score += 15;
  }

  return score;
}

function buildInterviewTopic(question: string) {
  const normalized = normalizeText(question).replace(/[?!.]+$/g, "");
  if (!normalized) return "";

  if (/tell me about yourself/i.test(normalized)) return "Professional background";
  if (/strength/i.test(normalized)) return "Strengths";
  if (/weakness/i.test(normalized)) return "Growth areas";
  if (/challenge|difficult|conflict|problem/i.test(normalized)) return "Problem solving";
  if (/team|collabor/i.test(normalized)) return "Teamwork";
  if (/customer|guest|service/i.test(normalized)) return "Customer service";
  if (/why .*role|why .*company|interested/i.test(normalized)) return "Motivation for the role";
  if (/experience|background/i.test(normalized)) return "Relevant experience";

  return normalized;
}

function buildFollowUpQuestion(question: string) {
  const normalized = normalizeText(question).replace(/[?!.]+$/g, "");
  if (!normalized) return "";

  if (/tell me about yourself/i.test(normalized)) {
    return "Which part of your background is most relevant to this role, and why?";
  }
  if (/challenge|difficult|conflict|problem/i.test(normalized)) {
    return "What was the measurable result, and what would you do differently next time?";
  }
  if (/customer|guest|service/i.test(normalized)) {
    return "Can you share a specific example of how you handled a customer or guest issue?";
  }
  if (/strength/i.test(normalized)) {
    return "Can you give a recent example that shows that strength in action?";
  }

  return "Can you give a specific example and the result you achieved?";
}

function formatInterviewDateTime(value: Date) {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function sanitizeDetectedQuestions(value: unknown): HirePilotDetectedQuestion[] {
  if (!Array.isArray(value)) return [];

  return dedupeByQuestion<HirePilotDetectedQuestion>(
    value
      .map((item) => {
        if (!item || typeof item !== "object") return null;

        const question = normalizeText((item as { question?: unknown }).question);
        return question ? { question } : null;
      })
      .filter((item): item is HirePilotDetectedQuestion => Boolean(item))
  );
}

export function sanitizeSuggestedAnswers(value: unknown): HirePilotSuggestedAnswer[] {
  if (!Array.isArray(value)) return [];

  return dedupeByQuestion<HirePilotSuggestedAnswer>(
    value
      .map((item) => {
        if (!item || typeof item !== "object") return null;

        const question = normalizeText((item as { question?: unknown }).question);
        const answer = normalizeText((item as { answer?: unknown }).answer);
        const sourceValue = (item as { source?: unknown }).source;
        const source =
          sourceValue === "openai" || sourceValue === "fallback" ? sourceValue : null;

        if (!question || !answer) return null;

        return {
          question,
          answer,
          source,
        } satisfies HirePilotSuggestedAnswer;
      })
      .filter((item): item is HirePilotSuggestedAnswer => Boolean(item))
  );
}

export function canGenerateInterviewReport(session: {
  inputSource?: string | null;
  reportEligible?: boolean | null;
  status?: string | null;
}) {
  return (
    session.inputSource === "tab_audio" &&
    Boolean(session.reportEligible) &&
    session.status === "completed"
  );
}

export function isMeaningfulInterviewSession(params: {
  transcript?: string | null;
  detectedQuestions?: HirePilotDetectedQuestion[];
  suggestedAnswers?: HirePilotSuggestedAnswer[];
}) {
  const transcript = normalizeText(params.transcript);
  const detectedQuestions = params.detectedQuestions ?? [];
  const suggestedAnswers = params.suggestedAnswers ?? [];

  return transcript.length >= 80 || detectedQuestions.length > 0 || suggestedAnswers.length > 0;
}

export function buildInterviewReport(params: {
  startedAt: Date;
  endedAt: Date;
  transcript?: string | null;
  detectedQuestions?: HirePilotDetectedQuestion[];
  suggestedAnswers?: HirePilotSuggestedAnswer[];
}): HirePilotInterviewReport {
  const transcript = normalizeText(params.transcript);
  const detectedQuestions = sanitizeDetectedQuestions(params.detectedQuestions);
  const suggestedAnswers = sanitizeSuggestedAnswers(params.suggestedAnswers);
  const interviewTopics = dedupeStrings(
    detectedQuestions.map((item) => buildInterviewTopic(item.question))
  ).slice(0, 6);
  const strongestAnswers = [...suggestedAnswers]
    .sort((left, right) => scoreAnswer(right.answer, right.source) - scoreAnswer(left.answer, left.source))
    .slice(0, 3)
    .map((item) => ({
      question: item.question,
      answer: item.answer,
    }));
  const weakerAnswerOpportunities = dedupeStrings(
    detectedQuestions
      .filter(
        (question) =>
          !suggestedAnswers.some(
            (answer) => answer.question.toLowerCase() === question.question.toLowerCase()
          )
      )
      .map((question) => `Prepare a tighter example for: ${question.question}`)
      .concat(
        suggestedAnswers
          .filter((answer) => normalizeText(answer.answer).length < 140 || answer.source === "fallback")
          .map((answer) => `Add more detail, outcomes, or specificity to: ${answer.question}`)
      )
  ).slice(0, 4);
  const followUpQuestions = dedupeStrings(
    detectedQuestions.map((item) => buildFollowUpQuestion(item.question))
  ).slice(0, 4);
  const coachingTips = dedupeStrings(
    [
      transcript.length < 200
        ? "Give fuller examples with clear actions and results when answering follow-up questions."
        : "Keep using concrete examples and measurable outcomes to support your answers.",
      suggestedAnswers.some((item) => item.source === "fallback")
        ? "Replace general wording with role-specific details from your real experience."
        : "Maintain the same level of specificity and keep tying answers back to the role.",
      detectedQuestions.length > suggestedAnswers.length
        ? "Be ready with backup examples so you can answer follow-up questions without pausing."
        : "Your coverage was strong. Focus next on tightening delivery and pacing.",
    ].filter(Boolean)
  ).slice(0, 4);

  const confidence =
    strongestAnswers.length >= 2 ? "Strong" : strongestAnswers.length === 1 ? "Moderate" : "Developing";
  const clarity =
    transcript.length >= 300 ? "Strong" : transcript.length >= 120 ? "Moderate" : "Needs work";
  const specificity =
    suggestedAnswers.some((item) => /\b(result|impact|improved|increased|reduced)\b/i.test(item.answer))
      ? "Strong"
      : suggestedAnswers.length > 0
        ? "Moderate"
        : "Needs work";

  const summary = detectedQuestions.length
    ? `This interview covered ${detectedQuestions.length} detected question${
        detectedQuestions.length === 1 ? "" : "s"
      }, with the strongest coverage around ${interviewTopics.slice(0, 2).join(" and ") || "the main role themes"}.`
    : "A shared-audio session was completed, but only limited interview content was captured.";

  const overallSummary = strongestAnswers.length
    ? "You have a usable answer base from this session. Focus next on giving slightly sharper examples and stronger result statements."
    : "This session captured useful interview context, but the next step should be building more complete answers with clearer examples and outcomes.";

  return {
    interviewDateTime: formatInterviewDateTime(params.startedAt),
    completedAt: params.endedAt.toISOString(),
    summary,
    interviewTopics,
    strongestAnswers,
    weakerAnswerOpportunities,
    followUpQuestions,
    coachingTips,
    feedback: {
      confidence,
      clarity,
      specificity,
    },
    overallSummary,
  };
}
