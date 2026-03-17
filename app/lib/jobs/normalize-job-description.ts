import type { JobSource } from "./types";

type NormalizeJobDescriptionOptions = {
  source?: JobSource | null;
};

const HTML_ENTITY_REPLACEMENTS: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#34;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
  "&ndash;": "-",
  "&mdash;": "-",
  "&bull;": "*",
  "&middot;": "*",
  "&hellip;": "...",
};

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["â", "'"],
  ["â€™", "'"],
  ["â", "'"],
  ["â€˜", "'"],
  ['â', '"'],
  ['â€œ', '"'],
  ['â', '"'],
  ['â€', '"'],
  ["â", "-"],
  ["â€“", "-"],
  ["â", "-"],
  ["â€”", "-"],
  ["â¢", "*"],
  ["â€¢", "*"],
  ["â¦", "..."],
  ["â€¦", "..."],
  ["Â ", " "],
  ["Â", ""],
];

const COMMON_FOOTER_PATTERNS = [
  /^apply for this job$/i,
  /^apply now$/i,
  /^share this job$/i,
  /^similar jobs$/i,
  /^related jobs$/i,
  /^recommended jobs$/i,
  /^create (a )?job alert$/i,
  /^job alerts$/i,
  /^email me jobs like this$/i,
  /^send me jobs like these$/i,
  /^sign up for job alerts$/i,
  /^back to search results$/i,
  /^return to search results$/i,
];

const SOURCE_FOOTER_PATTERNS: Partial<Record<JobSource, RegExp[]>> = {
  adzuna: [
    /^more jobs from this company$/i,
    /^advertised by:/i,
    /^easy apply$/i,
    /^create alert$/i,
    /^similar jobs by email$/i,
  ],
  remoteok: [
    /^this job is closed$/i,
    /^apply to position$/i,
    /^salary and compensation$/i,
  ],
};

function decodeHtmlEntities(value: string) {
  return value.replace(/&(nbsp|amp|lt|gt|quot|#34|#39|#x27|apos|ndash|mdash|bull|middot|hellip);/gi, (match) => {
    const normalized = match.toLowerCase();
    return HTML_ENTITY_REPLACEMENTS[normalized] ?? match;
  });
}

function fixMojibake(value: string) {
  return MOJIBAKE_REPLACEMENTS.reduce(
    (output, [needle, replacement]) => output.split(needle).join(replacement),
    value
  );
}

function htmlToText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6|blockquote)>/gi, "\n\n")
    .replace(/<(ul|ol)[^>]*>/gi, "\n")
    .replace(/<\/(ul|ol)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n* ")
    .replace(/<\/li>/gi, "")
    .replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeBlockKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeBlocks(blocks: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const block of blocks) {
    const key = normalizeBlockKey(block);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(block);
  }

  return result;
}

function isNoiseBlock(block: string, source?: JobSource | null) {
  const normalized = block
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!normalized) return true;

  const sourcePatterns = source ? SOURCE_FOOTER_PATTERNS[source] ?? [] : [];
  return [...COMMON_FOOTER_PATTERNS, ...sourcePatterns].some((pattern) =>
    pattern.test(normalized)
  );
}

function trimTrailingNoiseBlocks(blocks: string[], source?: JobSource | null) {
  const stopIndex = blocks.findIndex((block, index) => index > 0 && isNoiseBlock(block, source));
  return stopIndex >= 0 ? blocks.slice(0, stopIndex) : blocks;
}

export function normalizeJobDescriptionText(
  value: string,
  options: NormalizeJobDescriptionOptions = {}
) {
  const maybeHtml = value.includes("<") ? htmlToText(value) : value;
  const normalized = normalizeWhitespace(fixMojibake(decodeHtmlEntities(maybeHtml)));

  if (!normalized) return "";

  const blocks = dedupeBlocks(
    normalized
      .split(/\n{2,}/)
      .map((block) => normalizeWhitespace(block))
      .filter(Boolean)
  );

  return trimTrailingNoiseBlocks(blocks, options.source).join("\n\n").trim();
}
