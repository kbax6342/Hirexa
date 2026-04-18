import "server-only";

import { extractResumeTextFromBuffer } from "@/app/lib/resume/persistResumeToProfile";
import {
  estimateYearsExperience,
  extractNormalizedSkills,
} from "@/app/lib/recruiter/matchCandidates";

export type CandidateUploadInput = {
  resumeText?: string | null;
  file?:
    | {
        buffer: Buffer;
        fileName: string;
        mimeType: string;
      }
    | null
    | undefined;
};

export type ParsedRecruiterCandidate = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  resumeText: string | null;
  skills: string[];
  yearsExperience: number | null;
  warning: string | null;
  filename: string | null;
  mimeType: string | null;
  source: "UPLOAD" | "PASTE";
};

function trimOrNull(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeResumeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function extractEmail(text: string) {
  return trimOrNull(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null);
}

function extractPhone(text: string) {
  return trimOrNull(
    text.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}/)?.[0] ?? null
  );
}

function extractName(lines: string[]) {
  const firstLine = lines[0] ?? "";
  if (
    !firstLine ||
    firstLine.length > 60 ||
    /@|https?:\/\/|linkedin|github|\d{3}/i.test(firstLine)
  ) {
    return { firstName: null, lastName: null };
  }

  const parts = firstLine
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z'-]/g, ""))
    .filter(Boolean);

  if (parts.length < 2 || parts.length > 4) {
    return { firstName: null, lastName: null };
  }

  return {
    firstName: trimOrNull(parts[0]),
    lastName: trimOrNull(parts.slice(1).join(" ")),
  };
}

function extractLocation(lines: string[]) {
  for (const line of lines.slice(0, 10)) {
    const normalized = line.trim();
    if (!normalized) continue;
    if (/remote/i.test(normalized)) return normalized;
    if (/, [A-Z]{2}\b/.test(normalized) || /\b[A-Z][a-z]+,\s+[A-Z][a-z]+/.test(normalized)) {
      if (!/@|https?:\/\/|\d{5}/.test(normalized)) {
        return normalized;
      }
    }
  }

  return null;
}

function extractHeadline(lines: string[]) {
  for (const line of lines.slice(1, 6)) {
    const normalized = line.trim();
    if (!normalized) continue;
    if (normalized.length > 90) continue;
    if (/@|https?:\/\/|linkedin|github|\d{3}/i.test(normalized)) continue;
    return normalized;
  }

  return null;
}

export async function parseRecruiterCandidateInput(
  input: CandidateUploadInput
): Promise<ParsedRecruiterCandidate> {
  const source = input.file ? "UPLOAD" : "PASTE";
  const fileName = trimOrNull(input.file?.fileName);
  const mimeType = trimOrNull(input.file?.mimeType);

  let extractedText = normalizeResumeText(input.resumeText ?? "");

  if (!extractedText && input.file) {
    try {
      extractedText = normalizeResumeText(
        await extractResumeTextFromBuffer(
          input.file.buffer,
          input.file.mimeType,
          input.file.fileName
        )
      );
    } catch {
      extractedText = "";
    }
  }

  const lines = extractedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const { firstName, lastName } = extractName(lines);
  const email = extractEmail(extractedText);
  const phone = extractPhone(extractedText);
  const location = extractLocation(lines);
  const headline = extractHeadline(lines);
  const skills = extractNormalizedSkills(extractedText);
  const yearsExperience = estimateYearsExperience(extractedText);

  let warning: string | null = null;
  if (!extractedText) {
    warning = "Resume text extraction was limited. You can still edit this candidate later.";
  } else if (!email && !skills.length) {
    warning = "Candidate extraction was partial. Review the parsed fields before submitting.";
  }

  return {
    firstName,
    lastName,
    email,
    phone,
    location,
    headline,
    resumeText: extractedText || null,
    skills,
    yearsExperience,
    warning,
    filename: fileName,
    mimeType,
    source,
  };
}
