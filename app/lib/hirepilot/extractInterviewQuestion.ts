const INTERVIEW_QUESTION_PATTERNS = [
  /tell me about yourself/i,
  /walk me through(?: your)? (?:resume|background|experience)/i,
  /why do you want to work here/i,
  /why do you want this role/i,
  /why should we hire you/i,
  /what are your strengths/i,
  /what are your weaknesses/i,
  /describe a time(?: when)?/i,
  /give me an example(?: of)?/i,
  /how do you handle/i,
  /how did you handle/i,
  /can you talk about/i,
  /could you explain/i,
  /where do you see yourself/i,
  /what (?:are|is|would|do|did|can|makes)/i,
  /how (?:do|did|would|have|can)/i,
  /can you/i,
  /could you/i,
  /would you/i,
  /talk about/i,
  /explain/i,
];

const LEADING_FILLER_PATTERNS = [
  /^(?:hello|hi|hey)\b[\s,.-]*/i,
  /^(?:thank you|thanks)(?:\s+for\s+taking\s+the\s+time(?:\s+to\s+speak\s+with\s+me(?:\s+today)?)?)?[\s,.-]*/i,
  /^(?:i(?:'m| am)\s+going\s+to\s+ask\s+you|i(?:'d| would)\s+like\s+to\s+ask\s+you)\b[\s,.-]*/i,
  /^(?:please\s+take\s+your\s+time|if\s+you\s+need\s+a\s+moment)\b[\s,.-]*/i,
  /^(?:i\s+would\s+like\s+to\s+learn\s+(?:a\s+little\s+)?more\s+about\s+you)\b[\s,.-]*/i,
  /^(?:and\s+the\s+question\s+is|the\s+question\s+is|question\s+is)\b[\s,.-]*/i,
  /^(?:again|so|well|okay|ok|alright|right)\b[\s,.-]*/i,
];

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function looksReadableText(value: string) {
  return value.length >= 8 && /[a-z]/i.test(value);
}

function ensureQuestionPunctuation(value: string) {
  const trimmed = normalizeSpace(value).replace(/^["'\s]+|["'\s]+$/g, "");
  if (!trimmed) return null;
  if (/[?!.]$/.test(trimmed)) return trimmed;
  return `${trimmed}?`;
}

function splitTranscriptIntoChunks(transcript: string) {
  return transcript
    .split(/(?<=[.?!])\s+|\n+|(?<=,)\s+/)
    .map((chunk) => normalizeSpace(chunk))
    .filter(Boolean);
}

function findQuestionStartIndex(value: string) {
  let bestIndex = -1;

  for (const pattern of INTERVIEW_QUESTION_PATTERNS) {
    const match = value.match(pattern);
    const index = match?.index ?? -1;
    if (index >= 0 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
    }
  }

  return bestIndex;
}

function cleanInterviewQuestionCandidate(value: string) {
  let cleaned = normalizeSpace(value);

  for (let index = 0; index < LEADING_FILLER_PATTERNS.length; index += 1) {
    const next = cleaned.replace(LEADING_FILLER_PATTERNS[index], "");
    if (next !== cleaned) {
      cleaned = normalizeSpace(next);
      index = -1;
    }
  }

  const questionStartIndex = findQuestionStartIndex(cleaned);
  if (questionStartIndex > 0) {
    cleaned = normalizeSpace(cleaned.slice(questionStartIndex));
  }

  if (!looksReadableText(cleaned)) {
    return null;
  }

  const questionBoundary = cleaned.search(/[?!.](?:\s|$)/);
  const candidate =
    questionBoundary >= 0 ? cleaned.slice(0, questionBoundary + 1) : cleaned;

  const capitalized =
    candidate.length > 1
      ? `${candidate.charAt(0).toUpperCase()}${candidate.slice(1)}`
      : candidate.toUpperCase();

  return ensureQuestionPunctuation(capitalized);
}

export function extractInterviewQuestionCandidate(transcript: string) {
  const normalized = normalizeSpace(transcript);
  if (!normalized) return null;

  const chunks = splitTranscriptIntoChunks(normalized);
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index];
    if (!looksReadableText(chunk)) continue;

    const questionStartIndex = findQuestionStartIndex(chunk);
    if (questionStartIndex >= 0) {
      return normalizeSpace(chunk.slice(questionStartIndex));
    }

    if (chunk.includes("?")) {
      return chunk;
    }
  }

  const fullTranscriptStartIndex = findQuestionStartIndex(normalized);
  if (fullTranscriptStartIndex >= 0) {
    return normalizeSpace(normalized.slice(fullTranscriptStartIndex));
  }

  return null;
}

export function extractInterviewQuestion(transcript: string) {
  const rawCandidate = extractInterviewQuestionCandidate(transcript);
  if (!rawCandidate) return null;

  return cleanInterviewQuestionCandidate(rawCandidate);
}
