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

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const pdfParse = getPdfParse();
  const result = await pdfParse(buffer);
  const fullText = normalizePdfText(result.text ?? "");
  const pages = fullText ? [{ page: 1, text: fullText }] : [];

  return { pages, fullText };
}
