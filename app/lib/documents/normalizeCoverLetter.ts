export type NormalizedCoverLetter = {
  applicantName?: string;
  applicantContactLines: string[];
  dateLine?: string;
  recipientLines: string[];
  greeting?: string;
  bodyParagraphs: string[];
  closing?: string;
  signatureName?: string;
};

type NormalizeCoverLetterInput = {
  rawText: string;
  candidateName?: string | null;
  candidateContactLines?: string[];
  company?: string | null;
  dateLine?: string | null;
  defaultGreeting?: string;
  defaultClosing?: string;
};

const dateLinePattern =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/i;
const greetingPattern = /^(dear|hello|hi)\b/i;
const closingPattern = /^(sincerely|best regards|kind regards|regards|best|thank you|thanks),?$/i;
const contactPattern =
  /@|linkedin|portfolio|github|www\.|https?:\/\/|\+?\d[\d\s().-]{7,}/i;
const recipientCuePattern =
  /\b(hiring team|hiring manager|recruit(?:er|ing)|talent acquisition|human resources|selection committee)\b/i;
const streetAddressPattern =
  /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,6}\s(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|circle|cir|way|parkway|pkwy|place|pl|terrace|ter)\b/i;
const cityStatePattern =
  /^[A-Za-z.'-]+(?:\s+[A-Za-z.'-]+)*,\s*(?:[A-Z]{2}|[A-Za-z]+(?:\s+[A-Za-z]+)*)(?:\s+\d{4,10}(?:-\d{4})?)?$/i;

function normalizeInputText(value: string) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dedupeNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = normalizeInputText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function isDateLine(line: string) {
  return dateLinePattern.test(line.trim());
}

function isGreetingLine(line: string) {
  return greetingPattern.test(line.trim());
}

function isClosingLine(line: string) {
  return closingPattern.test(line.trim());
}

function isContactLine(line: string) {
  return contactPattern.test(line.trim());
}

function isRecipientCueLine(line: string) {
  return recipientCuePattern.test(line.trim());
}

function isStreetAddressLine(line: string) {
  return streetAddressPattern.test(line.trim());
}

function isCityStateLine(line: string) {
  return cityStatePattern.test(line.trim());
}

function isLikelyApplicantContactLine(line: string) {
  return isContactLine(line) || isStreetAddressLine(line) || isCityStateLine(line);
}

function isEmailLine(line: string) {
  return /@/.test(line.trim());
}

function isPhoneLine(line: string) {
  return /\+?\d[\d\s().-]{7,}/.test(line.trim());
}

function orderApplicantContactLines(values: string[]) {
  const ranked = values.map((value, index) => {
    const line = value.trim();
    let rank = 4;
    if (isStreetAddressLine(line)) rank = 0;
    else if (isCityStateLine(line)) rank = 1;
    else if (isEmailLine(line)) rank = 2;
    else if (isPhoneLine(line)) rank = 3;
    return { line, index, rank };
  });

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.index - b.index;
  });

  return ranked.map((entry) => entry.line);
}

function looksLikeNameLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.includes("@")) return false;
  if (trimmed.includes("|")) return false;
  if (trimmed.length > 60) return false;
  return /^[A-Za-z][A-Za-z\s.'-]{1,}$/.test(trimmed) && trimmed.split(/\s+/).length <= 5;
}

function lineMatchesCompany(line: string, company: string) {
  const normalizedCompany = normalizeInputText(company).toLowerCase();
  if (!normalizedCompany) return false;
  const normalizedLine = normalizeInputText(line).toLowerCase();
  if (!normalizedLine) return false;
  if (normalizedLine.includes(normalizedCompany)) return true;
  return normalizedCompany.length > 8 && normalizedCompany.includes(normalizedLine);
}

function splitParagraphByConclusionCue(paragraph: string) {
  const cues = [
    /\bThank you for considering my application\b/i,
    /\bThank you for your time and consideration\b/i,
    /\bI look forward to\b/i,
  ];
  const normalized = normalizeInputText(paragraph);
  if (!normalized) return [];

  const cueIndexes = cues
    .map((cue) => normalized.search(cue))
    .filter((index) => index > 0)
    .sort((a, b) => a - b);
  if (cueIndexes.length === 0) return [normalized];

  const splitIndex = cueIndexes.find((index) => {
    const before = normalized.slice(0, index).trimEnd();
    return /[.!?]$/.test(before);
  });
  if (typeof splitIndex !== "number") return [normalized];

  const head = normalizeInputText(normalized.slice(0, splitIndex));
  const tail = normalizeInputText(normalized.slice(splitIndex));
  return dedupeNonEmpty([head, tail]);
}

function splitParagraphs(lines: string[]) {
  const paragraphs: string[] = [];
  let current: string[] = [];

  const flushCurrent = () => {
    if (current.length === 0) return;
    const joined = normalizeInputText(current.join(" "));
    if (joined) paragraphs.push(joined);
    current = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushCurrent();
      continue;
    }
    current.push(line.trim());
  }

  flushCurrent();

  const expandedParagraphs: string[] = [];
  for (const paragraph of dedupeNonEmpty(paragraphs)) {
    expandedParagraphs.push(...splitParagraphByConclusionCue(paragraph));
  }

  return dedupeNonEmpty(expandedParagraphs);
}

export function normalizeCoverLetter(input: NormalizeCoverLetterInput): NormalizedCoverLetter {
  const normalizedText = normalizeInputText(input.rawText);
  const lines = normalizedText.split("\n");
  const defaultGreeting = input.defaultGreeting ?? "Dear Hiring Team,";
  const defaultClosing = input.defaultClosing ?? "Sincerely,";

  let greetingIndex = lines.findIndex((line) => isGreetingLine(line));
  if (greetingIndex < 0) greetingIndex = -1;

  let closingIndex = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (isClosingLine(lines[i])) {
      closingIndex = i;
      break;
    }
  }

  const providedName = normalizeInputText(input.candidateName ?? "");
  const applicantName =
    providedName ||
    lines.find((line) => looksLikeNameLine(line))?.trim() ||
    undefined;

  const firstDateLine = lines.find((line) => isDateLine(line))?.trim();
  const dateLine =
    normalizeInputText(input.dateLine ?? "") || firstDateLine || undefined;

  const preGreetingEntries = lines
    .slice(0, greetingIndex >= 0 ? greetingIndex : lines.length)
    .map((line, index) => ({ index, line: line.trim() }))
    .filter((entry) => Boolean(entry.line));
  const dateIndex = preGreetingEntries.find((entry) => isDateLine(entry.line))?.index ?? -1;
  const recipientCueIndex =
    preGreetingEntries.find((entry) => isRecipientCueLine(entry.line))?.index ?? -1;
  const companyMatchIndex =
    preGreetingEntries.find((entry) => lineMatchesCompany(entry.line, input.company ?? ""))?.index ?? -1;

  let recipientStartIndex = -1;
  for (const candidateIndex of [recipientCueIndex, companyMatchIndex]) {
    if (candidateIndex < 0) continue;
    if (recipientStartIndex < 0 || candidateIndex < recipientStartIndex) {
      recipientStartIndex = candidateIndex;
    }
  }
  if (recipientStartIndex >= 0 && dateIndex >= 0 && recipientStartIndex < dateIndex) {
    recipientStartIndex = -1;
  }
  if (recipientStartIndex < 0 && dateIndex >= 0) {
    const firstLikelyRecipientAfterDate = preGreetingEntries.find(
      (entry) =>
        entry.index > dateIndex &&
        !isLikelyApplicantContactLine(entry.line) &&
        !isDateLine(entry.line)
    );
    if (firstLikelyRecipientAfterDate) {
      recipientStartIndex = firstLikelyRecipientAfterDate.index;
    }
  }

  const seededContacts = dedupeNonEmpty(input.candidateContactLines ?? []);
  const topContactLines = preGreetingEntries
    .filter((entry) => {
      const line = entry.line;
      const lowerLine = line.toLowerCase();
      if (!line) return false;
      if (applicantName && lowerLine === applicantName.toLowerCase()) return false;
      if (dateLine && lowerLine === dateLine.toLowerCase()) return false;
      if (isDateLine(line)) return false;
      if (isGreetingLine(line)) return false;
      if (isClosingLine(line)) return false;

      const isBeforeDate = dateIndex >= 0 ? entry.index < dateIndex : false;
      const isBetweenDateAndRecipient =
        dateIndex >= 0 &&
        entry.index > dateIndex &&
        (recipientStartIndex < 0 || entry.index < recipientStartIndex);
      const isBeforeRecipient =
        recipientStartIndex < 0 || entry.index < recipientStartIndex;
      const likelyApplicant =
        isBeforeDate ||
        (isLikelyApplicantContactLine(line) && isBeforeRecipient) ||
        (isBetweenDateAndRecipient && isLikelyApplicantContactLine(line));
      if (!likelyApplicant) return false;
      if (isRecipientCueLine(line)) return false;
      if (lineMatchesCompany(line, input.company ?? "")) return false;
      return true;
    })
    .map((entry) => entry.line);
  const applicantContactLines = orderApplicantContactLines(
    dedupeNonEmpty([...seededContacts, ...topContactLines])
  );

  const recipientLines = dedupeNonEmpty(
    preGreetingEntries
      .filter((entry) => {
        const line = entry.line;
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (applicantName && trimmed.toLowerCase() === applicantName.toLowerCase()) return false;
        if (dateLine && trimmed.toLowerCase() === dateLine.toLowerCase()) return false;
        if (applicantContactLines.some((contact) => contact.toLowerCase() === trimmed.toLowerCase())) {
          return false;
        }
        if (isDateLine(trimmed)) return false;
        if (isContactLine(trimmed)) return false;
        if (isGreetingLine(trimmed)) return false;

        if (recipientStartIndex >= 0) {
          return entry.index >= recipientStartIndex;
        }

        if (isRecipientCueLine(trimmed) || lineMatchesCompany(trimmed, input.company ?? "")) {
          return true;
        }

        if (dateIndex >= 0 && entry.index > dateIndex && !isLikelyApplicantContactLine(trimmed)) {
          return true;
        }
        return false;
      })
      .map((entry) => entry.line)
      .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (applicantName && trimmed.toLowerCase() === applicantName.toLowerCase()) return false;
      if (dateLine && trimmed.toLowerCase() === dateLine.toLowerCase()) return false;
      if (applicantContactLines.some((contact) => contact.toLowerCase() === trimmed.toLowerCase())) {
        return false;
      }
      if (isDateLine(trimmed)) return false;
      if (isContactLine(trimmed)) return false;
      if (isGreetingLine(trimmed)) return false;
      return true;
      })
  );

  const greeting =
    (greetingIndex >= 0 ? normalizeInputText(lines[greetingIndex]) : "") ||
    defaultGreeting;

  const postGreetingLines = lines.slice(greetingIndex >= 0 ? greetingIndex + 1 : 0);
  const bodyCandidateLines =
    closingIndex >= 0
      ? lines.slice(greetingIndex >= 0 ? greetingIndex + 1 : 0, closingIndex)
      : postGreetingLines;
  const bodyParagraphs = splitParagraphs(
    bodyCandidateLines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (applicantName && trimmed.toLowerCase() === applicantName.toLowerCase()) return false;
      if (dateLine && trimmed.toLowerCase() === dateLine.toLowerCase()) return false;
      if (recipientLines.some((recipient) => recipient.toLowerCase() === trimmed.toLowerCase())) {
        return false;
      }
      if (isGreetingLine(trimmed) || isClosingLine(trimmed)) return false;
      return true;
    })
  );

  const closing =
    (closingIndex >= 0 ? normalizeInputText(lines[closingIndex]) : "") || defaultClosing;
  const trailingLines =
    closingIndex >= 0 ? lines.slice(closingIndex + 1).map((line) => line.trim()) : [];
  const signatureName =
    trailingLines.find((line) => line && !isClosingLine(line) && !isGreetingLine(line)) ||
    applicantName ||
    undefined;

  const resolvedRecipientLines =
    recipientLines.length > 0
      ? recipientLines
      : dedupeNonEmpty(["Hiring Team", normalizeInputText(input.company ?? "")]);

  return {
    applicantName,
    applicantContactLines,
    dateLine,
    recipientLines: resolvedRecipientLines,
    greeting,
    bodyParagraphs,
    closing,
    signatureName,
  };
}

export function normalizedCoverLetterToText(
  value: NormalizedCoverLetter
) {
  const lines: string[] = [];

  if (value.applicantName) lines.push(value.applicantName);
  if (value.applicantContactLines.length > 0) {
    lines.push(...value.applicantContactLines);
  }
  if (lines.length > 0) lines.push("");

  if (value.dateLine) {
    lines.push(value.dateLine, "");
  }

  if (value.recipientLines.length > 0) {
    lines.push(...value.recipientLines, "");
  }

  if (value.greeting) {
    lines.push(value.greeting, "");
  }

  if (value.bodyParagraphs.length > 0) {
    lines.push(value.bodyParagraphs.join("\n\n"), "");
  }

  if (value.closing) lines.push(value.closing);
  if (value.signatureName) lines.push("", value.signatureName);

  return normalizeInputText(lines.join("\n"));
}
