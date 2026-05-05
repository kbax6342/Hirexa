import "server-only";

export type ResumeRedactionResult = {
  redactedText: string;
  possibleContactInfo: {
    email: string | null;
    phone: string | null;
  };
  redactionNotes: string[];
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}/;
const ADDRESS_PATTERN =
  /\b\d{1,6}\s+[A-Za-z0-9.'-]+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|circle|cir|parkway|pkwy)\b/i;
const PROTECTED_KEYWORDS = [
  "date of birth",
  "dob",
  "birth date",
  "age",
  "gender",
  "sex",
  "pronouns",
  "marital status",
  "married",
  "single",
  "religion",
  "faith",
  "race",
  "ethnicity",
  "nationality",
  "national origin",
  "citizenship",
  "disability",
  "disabled",
  "veteran",
  "photo",
  "headshot",
];

function normalizeResumeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function extractPossibleContactInfo(text: string) {
  return {
    email: trimOrNull(text.match(EMAIL_PATTERN)?.[0] ?? null),
    phone: trimOrNull(text.match(PHONE_PATTERN)?.[0] ?? null),
  };
}

function looksLikeNameLine(line: string) {
  const normalized = line.trim();
  if (!normalized || normalized.length > 60) return false;
  if (/\d|@|https?:\/\/|linkedin|github/i.test(normalized)) return false;

  const parts = normalized
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z'-]/g, ""))
    .filter(Boolean);

  return parts.length >= 2 && parts.length <= 4;
}

function containsProtectedKeyword(line: string) {
  const normalized = line.toLowerCase();
  return PROTECTED_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function redactResumeForScoring(parsedText: string): ResumeRedactionResult {
  const normalizedText = normalizeResumeWhitespace(parsedText);
  if (!normalizedText) {
    return {
      redactedText: "",
      possibleContactInfo: { email: null, phone: null },
      redactionNotes: ["No resume text was available for redaction."],
    };
  }

  const possibleContactInfo = extractPossibleContactInfo(normalizedText);
  const redactionNotes = new Set<string>();
  const lines = normalizedText.split("\n");
  const keptLines: string[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      keptLines.push("");
      return;
    }

    if (index < 3 && looksLikeNameLine(trimmed)) {
      redactionNotes.add("Removed likely candidate name/header before scoring.");
      return;
    }

    if (containsProtectedKeyword(trimmed)) {
      redactionNotes.add("Removed line containing protected or non-job-related personal information.");
      return;
    }

    if (ADDRESS_PATTERN.test(trimmed)) {
      redactionNotes.add("Removed street-address style contact information before scoring.");
      return;
    }

    let nextLine = trimmed;
    if (EMAIL_PATTERN.test(nextLine)) {
      nextLine = nextLine.replace(EMAIL_PATTERN, "[redacted email]");
      redactionNotes.add("Redacted email address before scoring.");
    }
    if (PHONE_PATTERN.test(nextLine)) {
      nextLine = nextLine.replace(PHONE_PATTERN, "[redacted phone]");
      redactionNotes.add("Redacted phone number before scoring.");
    }
    if (/\b(address|email|phone|mobile):/i.test(nextLine)) {
      redactionNotes.add("Redacted explicit contact label before scoring.");
      nextLine = nextLine
        .replace(/email:\s*.+/i, "Email: [redacted]")
        .replace(/phone:\s*.+/i, "Phone: [redacted]")
        .replace(/mobile:\s*.+/i, "Mobile: [redacted]")
        .replace(/address:\s*.+/i, "Address: [redacted]");
    }

    keptLines.push(nextLine);
  });

  const redactedText = normalizeResumeWhitespace(
    keptLines.join("\n").replace(/\n{3,}/g, "\n\n")
  );

  if (redactionNotes.size === 0) {
    redactionNotes.add("No obvious non-job-related personal information required redaction.");
  }

  return {
    redactedText,
    possibleContactInfo,
    redactionNotes: [...redactionNotes],
  };
}

export { extractPossibleContactInfo };
