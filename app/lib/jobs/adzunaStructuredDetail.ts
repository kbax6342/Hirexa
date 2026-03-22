import { normalizeJobDescriptionText } from "./normalize-job-description";

type SplitContext = {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
};

export type AdzunaStructuredDetail = {
  descriptionIntro: string[];
  responsibilities: string[];
  qualifications: string[];
  description: string;
};

const STOP_MARKERS = [
  "apply for this job",
  "stats for this job",
  "receive similar jobs by email",
  "create alert",
  "popular searches",
  "back to last search",
  "by creating an alert",
  "powered by homebase",
  "free employee scheduling",
];

const SECTION_HEADINGS = [
  {
    key: "description" as const,
    pattern:
      /^(job description|description|position overview|overview|about the role|about the team|role overview)$/i,
  },
  {
    key: "responsibilities" as const,
    pattern:
      /^(responsibilities|duties|position responsibilities|what you'll do|what you ll do|the work)$/i,
  },
  {
    key: "qualifications" as const,
    pattern:
      /^(qualifications|requirements|minimum qualifications|required qualifications|preferred qualifications|what you'll bring|what you bring|experience and qualifications)$/i,
  },
];

function normalizeCompare(value: string | null | undefined) {
  return normalizeWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeWhitespace(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function injectSectionBreaks(value: string) {
  return value
    .replace(/\u2022/g, "\n- ")
    .replace(
      /\b(Job Description|Description|Position Overview|Overview|Responsibilities|Duties|Qualifications|Requirements|About the Role|About the Team)\s*:\s*/gi,
      "\n$1:\n"
    );
}

function isStopMarker(line: string) {
  const normalized = normalizeCompare(line);
  return STOP_MARKERS.some((marker) => normalized.includes(normalizeCompare(marker)));
}

function isStructuralHeading(line: string) {
  const normalized = normalizeWhitespace(line).replace(/:$/, "");
  return SECTION_HEADINGS.some(({ pattern }) => pattern.test(normalized));
}

function isContextDuplicate(line: string, context: SplitContext) {
  const normalized = normalizeCompare(line);
  if (!normalized) return true;

  const targets = [
    context.title,
    context.company,
    context.location,
    context.salary,
  ]
    .map((value) => normalizeCompare(value))
    .filter(Boolean);

  return targets.some(
    (target) =>
      normalized === target ||
      normalized === `company ${target}` ||
      normalized === `location ${target}` ||
      normalized === `salary ${target}` ||
      normalized.includes(`company ${target}`) ||
      normalized.includes(`location ${target}`) ||
      normalized.includes(`salary ${target}`)
  );
}

function isBoilerplateLine(line: string, context: SplitContext) {
  if (!line) return false;
  if (isStructuralHeading(line)) return false;
  if (isContextDuplicate(line, context)) return true;

  const normalized = normalizeCompare(line);
  if (!normalized) return true;

  if (STOP_MARKERS.some((marker) => normalized.includes(normalizeCompare(marker)))) {
    return true;
  }

  return (
    normalized === "adzuna" ||
    normalized === "apply now" ||
    normalized === "apply externally" ||
    normalized === "share this job" ||
    normalized === "similar jobs" ||
    normalized === "job alerts" ||
    normalized === "create a job alert"
  );
}

export function dedupeLinesPreserveOrder(lines: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) {
      if (result[result.length - 1] !== "") {
        result.push("");
      }
      continue;
    }

    const key = normalizeCompare(line);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(line);
  }

  while (result[0] === "") result.shift();
  while (result[result.length - 1] === "") result.pop();

  return result;
}

export function stripBoilerplateLines(text: string, context: SplitContext = {}) {
  const normalized = normalizeJobDescriptionText(injectSectionBreaks(text), {
    source: "adzuna",
  });
  const lines = normalized.split("\n");
  const filtered: string[] = [];
  let lastWasBlank = true;

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);

    if (!line) {
      if (!lastWasBlank && filtered.length > 0) {
        filtered.push("");
      }
      lastWasBlank = true;
      continue;
    }

    if (isStopMarker(line)) {
      break;
    }

    if (isBoilerplateLine(line, context)) {
      continue;
    }

    filtered.push(line);
    lastWasBlank = false;
  }

  return dedupeLinesPreserveOrder(filtered);
}

function matchSectionHeading(line: string) {
  const trimmed = normalizeWhitespace(line);
  if (!trimmed) return null;

  for (const { key, pattern } of SECTION_HEADINGS) {
    const exact = trimmed.replace(/:$/, "");
    if (pattern.test(exact)) {
      return { key, remainder: "" };
    }

    const inlineMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (inlineMatch && pattern.test(normalizeWhitespace(inlineMatch[1]))) {
      return { key, remainder: normalizeWhitespace(inlineMatch[2]) };
    }
  }

  return null;
}

function splitBulletCandidates(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return [];

  const bulletReady = normalized
    .replace(/^\d+[\.\)]\s+/, "")
    .replace(/^[-*\u2022]\s+/, "");

  const byBullet = bulletReady
    .split(/\s*(?:[-*]|\u2022|\u25AA)\s+/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
  if (byBullet.length > 1) return byBullet;

  const bySemicolon = bulletReady
    .split(/\s*;\s+/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
  if (bySemicolon.length > 1) return bySemicolon;

  return [bulletReady];
}

function dedupeList(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = normalizeWhitespace(item);
    const key = normalizeCompare(normalized);
    if (!key || seen.has(key) || isStopMarker(normalized)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function splitAdzunaSections(
  text: string,
  context: SplitContext = {}
): AdzunaStructuredDetail {
  const lines = stripBoilerplateLines(text, context);
  const introParagraphs: string[] = [];
  const responsibilities: string[] = [];
  const qualifications: string[] = [];
  const fallbackParagraphs: string[] = [];
  let currentSection: "description" | "responsibilities" | "qualifications" =
    "description";
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    const paragraph = normalizeWhitespace(paragraphBuffer.join(" "));
    paragraphBuffer = [];

    if (!paragraph || isContextDuplicate(paragraph, context)) {
      return;
    }

    introParagraphs.push(paragraph);
    fallbackParagraphs.push(paragraph);
  };

  for (const line of lines) {
    if (!line) {
      if (currentSection === "description") {
        flushParagraph();
      }
      continue;
    }

    const heading = matchSectionHeading(line);
    if (heading) {
      if (currentSection === "description") {
        flushParagraph();
      }

      currentSection = heading.key;
      if (!heading.remainder) {
        continue;
      }

      if (heading.key === "description") {
        paragraphBuffer.push(heading.remainder);
      } else if (heading.key === "responsibilities") {
        responsibilities.push(...splitBulletCandidates(heading.remainder));
      } else {
        qualifications.push(...splitBulletCandidates(heading.remainder));
      }
      continue;
    }

    if (currentSection === "responsibilities") {
      responsibilities.push(...splitBulletCandidates(line));
      continue;
    }

    if (currentSection === "qualifications") {
      qualifications.push(...splitBulletCandidates(line));
      continue;
    }

    paragraphBuffer.push(line);
  }

  if (currentSection === "description") {
    flushParagraph();
  }

  const dedupedResponsibilities = dedupeList(responsibilities);
  const responsibilitiesKeys = new Set(
    dedupedResponsibilities.map((item) => normalizeCompare(item))
  );
  const dedupedQualifications = dedupeList(qualifications).filter(
    (item) => !responsibilitiesKeys.has(normalizeCompare(item))
  );
  const dedupedIntro = dedupeList(introParagraphs);
  const fallbackDescription = normalizeWhitespace(
    (dedupedIntro.length > 0 ? dedupedIntro : dedupeList(fallbackParagraphs)).join(
      "\n\n"
    )
  );

  return {
    descriptionIntro: dedupedIntro,
    responsibilities: dedupedResponsibilities,
    qualifications: dedupedQualifications,
    description: fallbackDescription,
  };
}

export function buildAdzunaStructuredHtml(detail: AdzunaStructuredDetail) {
  const sections: string[] = [];

  if (detail.descriptionIntro.length > 0) {
    sections.push(
      `<section><h3>Job Description</h3>${detail.descriptionIntro
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("")}</section>`
    );
  } else if (detail.description) {
    sections.push(
      `<section><h3>Job Description</h3>${detail.description
        .split(/\n{2,}/)
        .map((paragraph) => normalizeWhitespace(paragraph))
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("")}</section>`
    );
  }

  if (detail.responsibilities.length > 0) {
    sections.push(
      `<section><h3>Responsibilities</h3><ul>${detail.responsibilities
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul></section>`
    );
  }

  if (detail.qualifications.length > 0) {
    sections.push(
      `<section><h3>Qualifications</h3><ul>${detail.qualifications
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul></section>`
    );
  }

  return sections.join("\n");
}
