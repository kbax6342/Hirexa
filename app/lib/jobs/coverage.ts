import type { JobPretty } from "./types";

const JOB_JUNK_PATTERNS = [
  /^apply for this job$/i,
  /^apply now$/i,
  /^receive similar jobs by email$/i,
  /^create alert$/i,
  /^popular searches$/i,
  /^stats for this job$/i,
  /^back to last search$/i,
  /^back to search results$/i,
  /^by creating an alert/i,
  /^powered by homebase$/i,
  /^free employee scheduling$/i,
  /^share this job$/i,
  /^similar jobs$/i,
  /^recommended jobs$/i,
  /^email me jobs like this$/i,
  /^send me jobs like these$/i,
  /^sign up for job alerts$/i,
];

function normalizeChunk(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s$%/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeChunks(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeChunk(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function splitSentenceLike(block: string) {
  const normalized = block.replace(/\n+/g, " ").trim();
  if (!normalized) return [];

  const byDash = normalized.includes(" - ")
    ? normalized.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean)
    : [];

  if (byDash.length > 1) {
    return byDash;
  }

  const bySentence = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((item) => item.trim())
    .filter(Boolean);

  return bySentence.length > 1 ? bySentence : [normalized];
}

function tokenize(value: string) {
  return normalizeChunk(value)
    .split(" ")
    .filter((token) => token.length >= 3 || /\d/.test(token));
}

export function isKnownJobJunkChunk(value: string) {
  const normalized = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!normalized) {
    return true;
  }

  return JOB_JUNK_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function getMeaningfulJobTextChunks(text: string) {
  const chunks = text
    .split(/\n{2,}/)
    .flatMap((block) => {
      const bulletLines = block
        .split(/\n+/)
        .map((line) =>
          line
            .trim()
            .replace(/^[-*\u2022]\s+/, "")
            .replace(/^\d+[\.\)]\s+/, "")
        )
        .filter(Boolean);

      if (bulletLines.length > 1) {
        return bulletLines;
      }

      return splitSentenceLike(block);
    })
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)
    .filter((item) => !isKnownJobJunkChunk(item));

  return dedupeChunks(chunks);
}

function getPrettyTextChunks(pretty: JobPretty) {
  const chunks = [
    ...pretty.highlights.map((highlight) => `${highlight.label} ${highlight.value}`),
    ...pretty.sections.flatMap((section) => {
      if (section.kind === "bullets") {
        return section.bullets ?? [];
      }

      if (section.kind === "callout") {
        const value = section.callout?.value ?? "";
        const label = section.callout?.label ?? "";
        return value ? [`${label} ${value}`.trim()] : [];
      }

      return section.paragraphs ?? [];
    }),
  ];

  return dedupeChunks(chunks);
}

function isChunkCovered(sourceChunk: string, formattedChunks: string[]) {
  const normalizedSource = normalizeChunk(sourceChunk);
  if (!normalizedSource) return true;

  const sourceTokens = tokenize(sourceChunk);

  return formattedChunks.some((formattedChunk) => {
    const normalizedFormatted = normalizeChunk(formattedChunk);
    if (!normalizedFormatted) return false;

    if (
      normalizedFormatted.includes(normalizedSource) ||
      normalizedSource.includes(normalizedFormatted)
    ) {
      return true;
    }

    const formattedTokens = tokenize(formattedChunk);
    if (sourceTokens.length === 0 || formattedTokens.length === 0) {
      return false;
    }

    const overlap = sourceTokens.filter((token) => formattedTokens.includes(token));
    const threshold =
      sourceTokens.length >= 6 ? 0.65 : sourceTokens.length >= 4 ? 0.75 : 1;

    return overlap.length / sourceTokens.length >= threshold;
  });
}

export function measurePrettyCoverage(sourceText: string, pretty: JobPretty) {
  const sourceChunks = getMeaningfulJobTextChunks(sourceText);
  const formattedChunks = getPrettyTextChunks(pretty);
  const missing = sourceChunks.filter(
    (chunk) => !isChunkCovered(chunk, formattedChunks)
  );

  return {
    sourceChunks,
    formattedChunks,
    missing,
    ratio:
      sourceChunks.length === 0
        ? 1
        : (sourceChunks.length - missing.length) / sourceChunks.length,
  };
}
