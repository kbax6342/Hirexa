import "server-only";

import mammoth from "mammoth";

import { extractPdfText, PdfUnreadableError } from "@/app/lib/pdf/serverPdfParser";

export const SUPPORTED_RESUME_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const DOCX_EXTENSION = /\.docx$/i;
const PDF_EXTENSION = /\.pdf$/i;

export class UnsupportedResumeFileTypeError extends Error {
  constructor(message = "Only PDF and DOCX resumes are supported.") {
    super(message);
    this.name = "UnsupportedResumeFileTypeError";
  }
}

export class ResumeParseError extends Error {
  cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ResumeParseError";
    this.cause = options?.cause;
  }
}

export type ParsedResumeFile = {
  text: string;
  normalizedMimeType: (typeof SUPPORTED_RESUME_MIME_TYPES)[number];
};

function normalizeResumeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeResumeMimeType(fileName: string, mimeType?: string | null) {
  const normalizedMimeType = String(mimeType ?? "").trim().toLowerCase();
  const normalizedFileName = fileName.trim().toLowerCase();

  if (normalizedMimeType === "application/pdf" || PDF_EXTENSION.test(normalizedFileName)) {
    return "application/pdf" as const;
  }

  if (
    normalizedMimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    DOCX_EXTENSION.test(normalizedFileName)
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
  }

  return null;
}

export function isSupportedResumeFileType(fileName: string, mimeType?: string | null) {
  return Boolean(normalizeResumeMimeType(fileName, mimeType));
}

export async function parseResumeFile(args: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
}): Promise<ParsedResumeFile> {
  const normalizedMimeType = normalizeResumeMimeType(args.fileName, args.mimeType);
  if (!normalizedMimeType) {
    throw new UnsupportedResumeFileTypeError();
  }

  try {
    if (normalizedMimeType === "application/pdf") {
      const parsed = await extractPdfText(args.buffer);
      return {
        text: normalizeResumeWhitespace(parsed.fullText),
        normalizedMimeType,
      };
    }

    const parsed = await mammoth.extractRawText({ buffer: args.buffer });
    return {
      text: normalizeResumeWhitespace(parsed.value ?? ""),
      normalizedMimeType,
    };
  } catch (error) {
    if (error instanceof UnsupportedResumeFileTypeError) {
      throw error;
    }

    if (error instanceof PdfUnreadableError) {
      throw new ResumeParseError(error.message, { cause: error });
    }

    throw new ResumeParseError("We couldn't parse this resume. Try a different PDF or DOCX file.", {
      cause: error,
    });
  }
}
