import "server-only";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type PdfParseResult = {
  text?: string | null;
};

type PdfParseFn = (
  dataBuffer: Buffer | Uint8Array,
  options?: Record<string, unknown>
) => Promise<PdfParseResult>;

let cachedPdfParse: PdfParseFn | null = null;

function getPdfParse(): PdfParseFn {
  if (cachedPdfParse) {
    return cachedPdfParse;
  }

  const mod = require("pdf-parse") as PdfParseFn | { default?: PdfParseFn };
  const pdfParse = typeof mod === "function" ? mod : mod.default;

  if (typeof pdfParse !== "function") {
    throw new Error("pdf-parse did not expose a callable parser.");
  }

  cachedPdfParse = pdfParse;
  return cachedPdfParse;
}

export type PdfTextPage = {
  page: number;
  text: string;
};

export type PdfTextResult = {
  pages: PdfTextPage[];
  fullText: string;
};

const PDF_UNREADABLE_MESSAGE =
  "We couldn’t read this PDF. Please re-save/export it as a new PDF or upload a DOCX file.";

// STEP 1: typed PDF parser error
export class PdfUnreadableError extends Error {
  cause?: unknown;

  constructor(message = PDF_UNREADABLE_MESSAGE, options?: { cause?: unknown }) {
    super(message);
    this.name = "PdfUnreadableError";
    Object.setPrototypeOf(this, new.target.prototype);
    this.cause = options?.cause;
  }
}

function normalizePdfText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// STEP 2: map malformed PDF failures
function isPdfStructureError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    stack?: unknown;
  };

  const combinedText = [
    candidate.name,
    candidate.message,
    candidate.code,
    candidate.stack,
    typeof error === "string" ? error : null,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  return (
    combinedText.includes("bad xref entry") ||
    combinedText.includes("formaterror") ||
    combinedText.includes("invalidpdfexception") ||
    combinedText.includes("xref")
  );
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const pdfParse = getPdfParse();
  let result: PdfParseResult;

  try {
    result = await pdfParse(buffer);
  } catch (error) {
    if (error instanceof PdfUnreadableError) {
      throw error;
    }

    if (isPdfStructureError(error)) {
      throw new PdfUnreadableError(undefined, { cause: error });
    }

    throw error;
  }

  const fullText = normalizePdfText(result.text ?? "");
  const pages = fullText ? [{ page: 1, text: fullText }] : [];

  return { pages, fullText };
}
