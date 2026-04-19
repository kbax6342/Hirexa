import { isKnownJobJunkChunk } from "./coverage";
import {
  isGloballyBannedJobLine,
  removeGloballyBannedJobLines,
  removeHiddenMetadataPairs,
} from "./formatJobText";
import { normalizeJobDescriptionText } from "./normalize-job-description";
import type { JobSource } from "./types";

type CleanJobTextOptions = {
  source?: JobSource | null;
  alreadyNormalized?: boolean;
};

const SEPARATOR_LINE_PATTERN = /^[-_=*~.\s]{3,}$/;
const BULLET_PREFIX_PATTERN = /^(?:[-*]|\u2022|\u00b7)+\s*/;
const EMPTY_BULLET_PATTERN = /^(?:[-*]|\u2022|\u00b7)+\s*$/;
const PUNCTUATION_BULLET_PATTERN = /^(?:[-*]|\u2022|\u00b7)+\s*[\W_]+$/;
const ORPHAN_LABEL_PATTERN =
  /^(required|required:|preferred|qualifications?:|responsibilities?:|benefits?:|apply:?)$/i;
const UI_CHROME_PATTERN =
  /^(ai assistant apply|career coach|apply|apply now|learn more|view posting)$/i;

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBulletLike(line: string) {
  return BULLET_PREFIX_PATTERN.test(line) || /^\d+[\.\)]\s+/.test(line);
}

export function isJunkJobLine(line: string) {
  if (!line) return true;
  if (isGloballyBannedJobLine(line)) return true;
  if (SEPARATOR_LINE_PATTERN.test(line)) return true;
  if (EMPTY_BULLET_PATTERN.test(line)) return true;
  if (PUNCTUATION_BULLET_PATTERN.test(line)) return true;
  if (ORPHAN_LABEL_PATTERN.test(line)) return true;
  if (UI_CHROME_PATTERN.test(line)) return true;
  if (isKnownJobJunkChunk(line)) return true;
  return false;
}

function shouldDropLine(line: string) {
  return isJunkJobLine(line);
}

export function cleanJobListItem(line: string) {
  if (/^\d+[\.\)]\s+/.test(line)) {
    line = line.replace(/^\d+[\.\)]\s+/, "").trim();
  } else {
    line = line.replace(BULLET_PREFIX_PATTERN, "").trim();
  }

  const cleaned = line
    .replace(/^[\s:;,.|/_=-]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  return shouldDropLine(cleaned) ? "" : cleaned;
}

function shouldMergeLines(previous: string, next: string) {
  if (!previous || !next) return false;
  if (isBulletLike(previous) || isBulletLike(next)) return false;
  if (/[.:!?]$/.test(previous)) return false;
  return /^[a-z0-9(]/.test(next) || next.length <= 48;
}

export function cleanJobText(value: string, options: CleanJobTextOptions = {}) {
  const normalized = normalizeWhitespace(
    removeHiddenMetadataPairs(
      removeGloballyBannedJobLines(
        options.alreadyNormalized
          ? value
          : normalizeJobDescriptionText(value, { source: options.source })
      )
    )
  );

  if (!normalized) {
    return "";
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split(/\n+/)
        .map((line) => line.trim())
        .map((line) => (isBulletLike(line) ? cleanJobListItem(line) : line))
        .filter((line) => !shouldDropLine(line))
    )
    .filter((lines) => lines.length > 0);

  const seen = new Set<string>();
  const cleanedBlocks: string[] = [];

  for (const lines of blocks) {
    const merged: string[] = [];

    for (const line of lines) {
      const previous = merged[merged.length - 1] ?? "";

      if (shouldMergeLines(previous, line)) {
        merged[merged.length - 1] = `${previous} ${line}`.trim();
      } else {
        merged.push(line);
      }
    }

    const deduped = merged.filter((line) => {
      const key = normalizeKey(line);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length > 0) {
      cleanedBlocks.push(deduped.join("\n"));
    }
  }

  return normalizeWhitespace(cleanedBlocks.join("\n\n"));
}
