// my-app/app/lib/jobs/formatJobText.ts

export type ParsedSection = {
  title: string;
  bullets: string[];
};

const HIDDEN_METADATA_RULES = [
  { title: "workplace", value: "on site" },
  { title: "clearance", value: "confidential" },
] as const;

function normalizeComparableJobLine(line: string) {
  return line
    .trim()
    .replace(/^(?:[-*]|\u2022|\u00b7)\s*/, "")
    .replace(/^\d+[\.\)]\s*/, "")
    .replace(/^[A-Za-z][A-Za-z0-9/&(),'\- ]{2,24}:\s*/, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const BANNED_JOB_LINE_KEY = normalizeComparableJobLine(
  "Participate in Pre-Shift meetings and learn new menu items."
);

export function isGloballyBannedJobLine(line: string) {
  if (!line) return false;
  return normalizeComparableJobLine(line) === BANNED_JOB_LINE_KEY;
}

export function isHiddenStandaloneMetadataValue(value: string) {
  const normalized = normalizeComparableJobLine(value);
  return HIDDEN_METADATA_RULES.some((rule) => rule.value === normalized);
}

export function isHiddenMetadataSectionTitle(title: string) {
  const normalized = normalizeComparableJobLine(title);
  return HIDDEN_METADATA_RULES.some((rule) => rule.title === normalized);
}

export function isHiddenMetadataPair(title: string, value: string) {
  const normalizedTitle = normalizeComparableJobLine(title);
  const normalizedValue = normalizeComparableJobLine(value);

  return HIDDEN_METADATA_RULES.some(
    (rule) => rule.title === normalizedTitle && rule.value === normalizedValue
  );
}

function matchInlineMetadataPair(line: string) {
  const match = line
    .trim()
    .match(/^([A-Za-z][A-Za-z0-9/&(),'\- ]{2,24})\s*:\s*(.+)$/);

  if (!match) {
    return null;
  }

  return { title: match[1], value: match[2] };
}

function findNextNonEmptyIndex(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      return index;
    }
  }

  return -1;
}

export function removeGloballyBannedJobLines(text: string) {
  return text
    .split(/\n/)
    .filter((line) => !isGloballyBannedJobLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function removeHiddenMetadataPairs(text: string) {
  const lines = text.split(/\n/);
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inlinePair = matchInlineMetadataPair(line);

    if (inlinePair && isHiddenMetadataPair(inlinePair.title, inlinePair.value)) {
      continue;
    }

    const nextIndex = findNextNonEmptyIndex(lines, index + 1);
    if (
      nextIndex !== -1 &&
      isHiddenMetadataPair(line, lines[nextIndex])
    ) {
      index = nextIndex;
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function filterHiddenMetadataValues(title: string, values: string[]) {
  return values.filter((value) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (isHiddenMetadataPair(title, trimmed)) return false;
    return !isHiddenMetadataSectionTitle(title) || !isHiddenStandaloneMetadataValue(trimmed);
  });
}

export function cleanJobText(html: string) {
  if (!html) return "";

  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return removeHiddenMetadataPairs(removeGloballyBannedJobLines(text));
}

export function splitSections(text: string): ParsedSection[] {
  if (!text) return [];

  const sections = removeHiddenMetadataPairs(
    removeGloballyBannedJobLines(text)
  ).split(/\n(?=[A-Z][^\n]+:)/);

  return sections
    .map((section) => {
      const [title, ...rest] = section.split("\n");
      const cleanTitle = title.replace(":", "").trim();
      const bullets = filterHiddenMetadataValues(
        cleanTitle,
        rest
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !isGloballyBannedJobLine(line))
      );

      return {
        title: cleanTitle,
        bullets,
      };
    })
    .filter((section) => {
      if (section.bullets.length === 0 && /^schedule$/i.test(section.title)) {
        return false;
      }

      if (section.bullets.length === 0 && isHiddenMetadataSectionTitle(section.title)) {
        return false;
      }

      return section.bullets.length > 0;
    });
}
