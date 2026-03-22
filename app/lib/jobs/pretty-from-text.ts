import type { JobDetail, JobPretty, JobPrettySection, JobSource } from "@/app/lib/jobs/types";
import { cleanJobListItem, cleanJobText } from "@/app/lib/jobs/clean-job-text";
import {
  filterHiddenMetadataValues,
  isGloballyBannedJobLine,
  isHiddenMetadataPair,
} from "@/app/lib/jobs/formatJobText";

type PrettyFromDescriptionOptions = {
  source?: JobSource | null;
  detail?: Partial<JobDetail> | null;
};

type PrettySection = JobPretty["sections"][number];

type HeadingMatch = {
  title: string;
  kindHint?: JobPrettySection["kind"];
};

const BULLET_SECTION_TITLES = new Set([
  "Responsibilities",
  "Qualifications",
  "Preferred Qualifications",
  "Benefits",
  "Required Documents",
  "How You Will Be Evaluated",
  "Example Projects",
]);

const SMALLPRINT_SECTION_TITLES = new Set([
  "Additional Information",
  "Equal Opportunity Employer",
  "Security and Clearance",
  "Legal Notices",
  "Important Notes",
]);

const HEADING_RULES: Array<{
  pattern: RegExp;
  title: string;
  kindHint?: JobPrettySection["kind"];
}> = [
  { pattern: /^(about us|about the company|company overview|what we believe)$/i, title: "About the Company" },
  { pattern: /^(about the role|role overview|job description|description|position overview)$/i, title: "Position Overview" },
  { pattern: /^(role snapshot|summary|overview)$/i, title: "Position Overview" },
  { pattern: /^(what you'll do|what you ll do|responsibilities|position responsibilities|duties|the work)$/i, title: "Responsibilities", kindHint: "bullets" },
  { pattern: /^(essential job functions|supportive functions)$/i, title: "Responsibilities", kindHint: "bullets" },
  { pattern: /^(example projects include)$/i, title: "Example Projects", kindHint: "bullets" },
  { pattern: /^(what you bring|what you'll bring|what you ll bring|you may be a fit if|qualifications|basic qualifications|required qualifications|minimum qualifications|requirements|required)$/i, title: "Qualifications", kindHint: "bullets" },
  { pattern: /^(specific job knowledge skills and abilities|knowledge skills and abilities)$/i, title: "Qualifications", kindHint: "bullets" },
  { pattern: /^(desired skills|preferred qualifications|nice to have|bonus points)$/i, title: "Preferred Qualifications", kindHint: "bullets" },
  { pattern: /^(benefits|benefits \+ perks|benefits and perks|benefits offered|total rewards|perks)$/i, title: "Benefits", kindHint: "bullets" },
  { pattern: /^(pay transparency notice|pay range|compensation|salary)$/i, title: "Compensation", kindHint: "callout" },
  { pattern: /^(schedule|hours|shift|shift details)$/i, title: "Schedule", kindHint: "callout" },
  { pattern: /^(reports to|reporting to)$/i, title: "Reports To", kindHint: "callout" },
  { pattern: /^(how to apply|applying|application process)$/i, title: "How to Apply" },
  { pattern: /^(service expectations|guest experience|service standards)$/i, title: "Service / Guest Experience Standards", kindHint: "bullets" },
  { pattern: /^(training|team support)$/i, title: "Training / Team Support" },
  { pattern: /^(compliance|safety)$/i, title: "Compliance / Safety", kindHint: "bullets" },
  { pattern: /^(culture|culture and values)$/i, title: "Company / Brand Overview" },
  { pattern: /^(work environment|environment|work setting)$/i, title: "Work Environment" },
  { pattern: /^(required documents)$/i, title: "Required Documents", kindHint: "bullets" },
  { pattern: /^(how you will be evaluated)$/i, title: "How You Will Be Evaluated", kindHint: "bullets" },
  { pattern: /^(additional information|other important information you should know)$/i, title: "Additional Information", kindHint: "smallprint" },
  { pattern: /^(important notes|important information|please note)$/i, title: "Important Notes", kindHint: "smallprint" },
  { pattern: /^(equal opportunity employer|equal employment opportunity|eeo statement)$/i, title: "Equal Opportunity Employer", kindHint: "smallprint" },
  { pattern: /^(security clearance|security clearance statement|clearance statement)$/i, title: "Security and Clearance", kindHint: "smallprint" },
  { pattern: /^(duties)$/i, title: "Responsibilities", kindHint: "bullets" },
  { pattern: /^(summary)$/i, title: "Overview" },
];

function normalizeHeadingKey(line: string) {
  return line
    .replace(/[*:_-]+$/g, "")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchCanonicalHeading(line: string): HeadingMatch | null {
  const normalized = normalizeHeadingKey(line);
  if (!normalized) return null;

  for (const rule of HEADING_RULES) {
    if (rule.pattern.test(normalized)) {
      return { title: rule.title, kindHint: rule.kindHint };
    }
  }

  const wordCount = normalized.split(/\s+/).length;
  const uppercaseHeading =
    normalized.length <= 72 &&
    wordCount <= 8 &&
    normalized === normalized.toUpperCase() &&
    /[A-Z]/.test(normalized);

  if (uppercaseHeading) {
    return { title: toTitleCase(normalized) };
  }

  return null;
}

function looksLikeBulletLine(line: string) {
  return /^(?:[-*]|\u2022|\u00b7)\s+/.test(line) || /^\d+[\.\)]\s+/.test(line);
}

function cleanBulletLine(line: string) {
  return cleanJobListItem(line);
}

function splitBlocks(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function toParagraphs(blocks: string[]) {
  return filterHiddenMetadataValues(
    "",
    blocks
    .map((block) => block.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter((block) => !isGloballyBannedJobLine(block))
    .filter(Boolean)
  );
}

function toBullets(blocks: string[]) {
  return blocks
    .flatMap((block) =>
      block
        .split(/\n+/)
        .map((line) => cleanBulletLine(line))
        .filter(Boolean)
    )
    .filter((line) => !isHiddenMetadataPair("", line))
    .filter(Boolean);
}

function isMostlyBullets(blocks: string[]) {
  const lines = blocks.flatMap((block) =>
    block
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  if (lines.length < 2) return false;

  const bulletCount = lines.filter(looksLikeBulletLine).length;
  if (bulletCount >= Math.max(2, Math.ceil(lines.length * 0.5))) {
    return true;
  }

  return lines.length >= 3 && lines.every((line) => line.length <= 160 && !/[.!?]$/.test(line));
}

function buildSection(
  title: string,
  blocks: string[],
  kindHint?: JobPrettySection["kind"]
): PrettySection | null {
  if (!blocks.length) return null;

  if (kindHint === "callout") {
    const paragraphs = filterHiddenMetadataValues(title, toParagraphs(blocks));
    if (
      title === "Schedule" &&
      paragraphs.every((paragraph) => isGloballyBannedJobLine(paragraph))
    ) {
      return null;
    }
    if (paragraphs[0]) {
      return {
        title,
        kind: "callout",
        callout: { value: paragraphs.join(" ") },
      };
    }
  }

  if (kindHint === "smallprint" || SMALLPRINT_SECTION_TITLES.has(title)) {
    const paragraphs = filterHiddenMetadataValues(title, toParagraphs(blocks));
    if (!paragraphs.length) return null;
    return {
      title,
      kind: "smallprint",
      paragraphs,
    };
  }

  if (kindHint === "bullets" || BULLET_SECTION_TITLES.has(title) || isMostlyBullets(blocks)) {
    const bullets = filterHiddenMetadataValues(title, toBullets(blocks));
    if (bullets.length) {
      return {
        title,
        kind: "bullets",
        bullets,
      };
    }
  }

  const paragraphs = filterHiddenMetadataValues(title, toParagraphs(blocks));
  if (!paragraphs.length) return null;

  return {
    title,
    kind: "paragraphs",
    paragraphs,
  };
}

function extractSections(
  text: string,
  source?: JobSource | null
): PrettySection[] {
  const blocks = splitBlocks(text);
  if (!blocks.length) return [];

  const sections: PrettySection[] = [];
  let currentTitle =
    source === "ashby" || source === "remoteok"
      ? "Position Overview"
      : "Position Overview";
  let currentKindHint: JobPrettySection["kind"] | undefined;
  let currentBlocks: string[] = [];

  const flush = () => {
    const section = buildSection(currentTitle, currentBlocks, currentKindHint);
    if (section) sections.push(section);
    currentBlocks = [];
    currentKindHint = undefined;
  };

  for (const block of blocks) {
    const lines = block
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) continue;

    const standaloneHeading = lines.length === 1 ? matchCanonicalHeading(lines[0]) : null;
    if (standaloneHeading) {
      flush();
      currentTitle = standaloneHeading.title;
      currentKindHint = standaloneHeading.kindHint;
      continue;
    }

    const firstLineHeading = matchCanonicalHeading(lines[0]);
    if (firstLineHeading && lines.length > 1) {
      flush();
      currentTitle = firstLineHeading.title;
      currentKindHint = firstLineHeading.kindHint;
      currentBlocks.push(lines.slice(1).join("\n"));
      continue;
    }

    const inlineLabel = lines[0].match(/^([A-Za-z][A-Za-z0-9/&(),'\- ]{2,45}):\s+(.+)$/);
    if (inlineLabel) {
      const inlineHeading = matchCanonicalHeading(inlineLabel[1]);
      if (inlineHeading) {
        flush();
        currentTitle = inlineHeading.title;
        currentKindHint = inlineHeading.kindHint;
        currentBlocks.push(inlineLabel[2]);
        continue;
      }
    }

    currentBlocks.push(block);
  }

  flush();
  return sections;
}

function addHighlight(
  highlights: JobPretty["highlights"],
  label: string,
  value: string | null | undefined
) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return;
  if (isHiddenMetadataPair(label, normalized)) return;
  if (highlights.some((item) => item.label === label && item.value === normalized)) {
    return;
  }
  highlights.push({ label, value: normalized });
}

function extractHighlights(
  text: string,
  options?: PrettyFromDescriptionOptions
) {
  const highlights: JobPretty["highlights"] = [];
  const detail = options?.detail;

  addHighlight(highlights, "Compensation", detail?.salaryText ?? detail?.salary);
  addHighlight(highlights, "Employment", detail?.employmentType);

  const metadata = detail?.metadata ?? {};
  addHighlight(highlights, "Telework", metadata.telework ? String(metadata.telework) : null);
  addHighlight(highlights, "Travel", metadata.travel ? String(metadata.travel) : null);
  addHighlight(
    highlights,
    "Clearance",
    metadata.securityClearance ? String(metadata.securityClearance) : null
  );
  addHighlight(highlights, "Deadline", metadata.closingDate ? String(metadata.closingDate) : null);

  if (detail?.remote) {
    addHighlight(highlights, "Workplace", "Remote eligible");
  }

  if (!highlights.some((item) => item.label === "Compensation")) {
    const payMatch = text.match(
      /\$[\d,]+(?:\.\d+)?\s*(?:-|to)\s*\$[\d,]+(?:\.\d+)?(?:\s*(?:per hour|per year|annually|hourly))?/i
    );
    if (payMatch?.[0]) {
      addHighlight(highlights, "Compensation", payMatch[0]);
    }
  }

  if (!highlights.some((item) => item.label === "Deadline")) {
    const deadlineMatch = text.match(
      /(?:accepted until|application close date|closing date)[:\s]+([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i
    );
    if (deadlineMatch?.[1]) {
      addHighlight(highlights, "Deadline", deadlineMatch[1]);
    }
  }

  if (!highlights.some((item) => item.label === "Clearance")) {
    const clearanceMatch = text.match(
      /\b(top secret|secret|confidential|public trust|security clearance)\b/i
    );
    if (clearanceMatch?.[1]) {
      addHighlight(highlights, "Clearance", clearanceMatch[1]);
    }
  }

  if (
    !highlights.some((item) => item.label === "Workplace") &&
    /\b(remote|telework|hybrid|onsite)\b/i.test(text)
  ) {
    const workplaceMatch = text.match(/\b(remote|telework eligible|hybrid|onsite)\b/i);
    if (workplaceMatch?.[1]) {
      addHighlight(highlights, "Workplace", workplaceMatch[1]);
    }
  }

  return highlights;
}

function normalizeSections(sections: PrettySection[]) {
  const seen = new Set<string>();

  return sections.filter((section) => {
    const key = `${section.title}:${JSON.stringify(section)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractCompanyLocationFromDescription(description: string) {
  const normalized = cleanJobText(description);
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 24);

  let company: string | undefined;
  let location: string | undefined;

  for (const line of lines) {
    if (!company) {
      const companyMatch = line.match(/^company\s*:\s*(.+)$/i);
      if (companyMatch?.[1]) company = companyMatch[1].trim();
    }

    if (!location) {
      const locationMatch = line.match(/^location\s*:\s*(.+)$/i);
      if (locationMatch?.[1]) {
        location = locationMatch[1].trim();
        continue;
      }

      if (/\bremote\b/i.test(line) || /,\s*[A-Z]{2}\b/.test(line)) {
        location = line.replace(/^location\s*:\s*/i, "").trim();
      }
    }

    if (company && location) break;
  }

  return { company, location };
}

export function prettyFromDescription(
  description: string,
  options: PrettyFromDescriptionOptions = {}
): JobPretty {
  const normalized = cleanJobText(description, {
    source: options.source ?? options.detail?.source ?? null,
  });

  if (!normalized) {
    return { sections: [], highlights: [] };
  }

  const sections = normalizeSections(
    extractSections(normalized, options.source ?? options.detail?.source ?? null)
  );
  const highlights = extractHighlights(normalized, options);

  return {
    sections,
    highlights,
  };
}
