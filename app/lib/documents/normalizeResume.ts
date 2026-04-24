export type NormalizedResumeSection =
  | {
      type: "summary";
      heading: string;
      paragraphs: string[];
    }
  | {
      type: "skills";
      heading: string;
      items: string[];
    }
  | {
      type: "experience";
      heading: string;
      jobs: Array<{
        title?: string;
        companyLocation?: string;
        dateRange?: string;
        bullets: string[];
      }>;
    }
  | {
      type: "education";
      heading: string;
      items: string[];
    }
  | {
      type: "certifications";
      heading: string;
      items: string[];
    }
  | {
      type: "generic";
      heading: string;
      paragraphs: string[];
      bullets?: string[];
    };

export type NormalizedResume = {
  name?: string;
  contactLines: string[];
  sections: NormalizedResumeSection[];
};

type NormalizeResumeInput = {
  rawText: string;
  candidateName?: string | null;
  candidateContactLines?: string[];
};

type SectionType = "summary" | "skills" | "experience" | "education" | "certifications";

const headingMap: Array<{
  type: SectionType;
  heading: string;
  pattern: RegExp;
}> = [
  {
    type: "summary",
    heading: "PROFESSIONAL SUMMARY",
    pattern: /^(professional summary|summary)$/i,
  },
  {
    type: "skills",
    heading: "SKILLS",
    pattern: /^(technical skills|core skills|skills)$/i,
  },
  {
    type: "experience",
    heading: "PROFESSIONAL EXPERIENCE",
    pattern: /^(professional experience|work experience|experience)$/i,
  },
  {
    type: "education",
    heading: "EDUCATION",
    pattern: /^education$/i,
  },
  {
    type: "certifications",
    heading: "CERTIFICATIONS",
    pattern: /^(certifications?|licenses?)$/i,
  },
];

const spacingMarkerPattern = /<--[^>]*-->/gi;

function normalizeText(value: string) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .replace(spacingMarkerPattern, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLine(value: string) {
  const normalized = normalizeText(value)
    .replace(/\u2022/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const line = cleanLine(value);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }
  return deduped;
}

function looksLikeName(value: string) {
  const line = cleanLine(value);
  if (!line) return false;
  if (line.includes("@")) return false;
  if (line.includes("|")) return false;
  if (line.startsWith("-")) return false;
  if (line.length > 70) return false;
  return /^[A-Za-z][A-Za-z\s.'-]{1,}$/.test(line) && line.split(/\s+/).length <= 6;
}

function isBulletLine(value: string) {
  return /^[-*]\s+/.test(cleanLine(value));
}

function normalizeBullet(value: string) {
  return cleanLine(value).replace(/^[-*]\s*/, "").trim();
}

function detectHeading(value: string): { type: SectionType; heading: string } | null {
  const normalized = cleanLine(value).replace(/:+$/, "").trim();
  if (!normalized) return null;
  for (const entry of headingMap) {
    if (entry.pattern.test(normalized)) {
      return { type: entry.type, heading: entry.heading };
    }
  }
  return null;
}

function splitParagraphs(lines: string[]) {
  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const paragraph = cleanLine(current.join(" "));
    if (paragraph) paragraphs.push(paragraph);
    current = [];
  };

  for (const line of lines) {
    const normalized = cleanLine(line);
    if (!normalized) {
      flush();
      continue;
    }
    if (isBulletLine(normalized)) {
      flush();
      continue;
    }
    current.push(normalized);
  }
  flush();

  return dedupe(paragraphs);
}

function splitContentBlocks(lines: string[]) {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  return blocks;
}

function looksLikeDateRange(value: string) {
  const line = cleanLine(value);
  if (!line) return false;
  return (
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(line) &&
    /(?:-|–|—|to|present|current)/i.test(line)
  );
}

function parseExperienceJobs(lines: string[]) {
  const jobs: Array<{
    title?: string;
    companyLocation?: string;
    dateRange?: string;
    bullets: string[];
  }> = [];
  const blocks = splitContentBlocks(lines);

  for (const block of blocks) {
    const bulletLines = block.filter((line) => isBulletLine(line)).map((line) => normalizeBullet(line));
    const nonBulletLines = block.filter((line) => !isBulletLine(line)).map((line) => cleanLine(line));

    if (nonBulletLines.length === 0 && bulletLines.length > 0) {
      if (jobs.length > 0) {
        jobs[jobs.length - 1].bullets.push(...bulletLines);
      } else {
        jobs.push({ bullets: bulletLines });
      }
      continue;
    }

    const title = nonBulletLines[0] || undefined;
    const companyLocation = nonBulletLines[1] || undefined;
    let dateRange: string | undefined;
    let extraLines: string[] = [];

    if (nonBulletLines.length > 2) {
      if (looksLikeDateRange(nonBulletLines[2])) {
        dateRange = nonBulletLines[2];
        extraLines = nonBulletLines.slice(3);
      } else {
        extraLines = nonBulletLines.slice(2);
      }
    }

    const bullets = dedupe([
      ...bulletLines,
      ...extraLines.filter((line) => line && !detectHeading(line)).map((line) => line),
    ]);
    jobs.push({
      title,
      companyLocation,
      dateRange,
      bullets,
    });
  }

  return jobs;
}

function parseSkillItems(lines: string[]) {
  const bulletItems = lines
    .filter((line) => isBulletLine(line))
    .map((line) => normalizeBullet(line))
    .filter(Boolean);
  if (bulletItems.length > 0) return dedupe(bulletItems);

  const commaSplit = lines
    .map((line) => cleanLine(line))
    .flatMap((line) => line.split(","))
    .map((item) => cleanLine(item))
    .filter(Boolean);
  return dedupe(commaSplit);
}

function parseLineItems(lines: string[]) {
  const items = lines
    .map((line) => (isBulletLine(line) ? normalizeBullet(line) : cleanLine(line)))
    .filter(Boolean);
  return dedupe(items);
}

function renderBullets(items: string[]) {
  return items.map((item) => `- ${item}`);
}

function renderSection(section: NormalizedResumeSection) {
  const lines: string[] = [section.heading, ""];

  if (section.type === "summary") {
    if (section.paragraphs.length > 0) {
      lines.push(section.paragraphs.join("\n\n"));
    }
    return lines;
  }

  if (section.type === "skills") {
    lines.push(...renderBullets(section.items));
    return lines;
  }

  if (section.type === "experience") {
    section.jobs.forEach((job, index) => {
      if (job.title) lines.push(job.title);
      if (job.companyLocation) lines.push(job.companyLocation);
      if (job.dateRange) lines.push(job.dateRange);
      if (job.bullets.length > 0) {
        if (job.title || job.companyLocation || job.dateRange) {
          lines.push("");
        }
        lines.push(...renderBullets(job.bullets));
      }
      if (index < section.jobs.length - 1) {
        lines.push("");
      }
    });
    return lines;
  }

  if (section.type === "education" || section.type === "certifications") {
    lines.push(...section.items);
    return lines;
  }

  if (section.paragraphs.length > 0) {
    lines.push(section.paragraphs.join("\n\n"));
  }
  if (section.bullets?.length) {
    if (section.paragraphs.length > 0) lines.push("");
    lines.push(...renderBullets(section.bullets));
  }
  return lines;
}

function mergeSection(
  sections: NormalizedResumeSection[],
  incoming: NormalizedResumeSection
) {
  if (incoming.type === "generic") {
    sections.push(incoming);
    return;
  }

  const existing = sections.find(
    (section) => section.type === incoming.type && section.heading === incoming.heading
  );
  if (!existing) {
    sections.push(incoming);
    return;
  }

  if (existing.type === "summary" && incoming.type === "summary") {
    existing.paragraphs = dedupe([...existing.paragraphs, ...incoming.paragraphs]);
    return;
  }
  if (existing.type === "skills" && incoming.type === "skills") {
    existing.items = dedupe([...existing.items, ...incoming.items]);
    return;
  }
  if (existing.type === "experience" && incoming.type === "experience") {
    existing.jobs = [...existing.jobs, ...incoming.jobs];
    return;
  }
  if (existing.type === "education" && incoming.type === "education") {
    existing.items = dedupe([...existing.items, ...incoming.items]);
    return;
  }
  if (existing.type === "certifications" && incoming.type === "certifications") {
    existing.items = dedupe([...existing.items, ...incoming.items]);
  }
}

export function normalizeResume(input: NormalizeResumeInput): NormalizedResume {
  const normalizedText = normalizeText(input.rawText);
  const lines = normalizedText.split("\n");
  const firstHeadingIndex = lines.findIndex((line) => detectHeading(line));
  const headerSlice =
    firstHeadingIndex >= 0 ? lines.slice(0, firstHeadingIndex) : lines.slice(0, Math.min(lines.length, 5));
  const headerLines = headerSlice.map((line) => cleanLine(line)).filter(Boolean);

  const providedName = cleanLine(input.candidateName ?? "");
  const inferredName = headerLines.find((line) => looksLikeName(line)) || undefined;
  const name = providedName || inferredName;
  const headerContactLines = dedupe(
    headerLines.filter((line) => (name ? line.toLowerCase() !== name.toLowerCase() : true))
  );
  const seededContacts = dedupe(input.candidateContactLines ?? []).filter(
    (seededLine) =>
      !headerContactLines.some((contactLine) =>
        contactLine.toLowerCase().includes(seededLine.toLowerCase())
      )
  );
  const contactLines = dedupe([...headerContactLines, ...seededContacts]);

  type RawSection = {
    type: SectionType | "generic";
    heading: string;
    lines: string[];
  };

  const rawSections: RawSection[] = [];
  let current: RawSection | null = null;

  for (let index = firstHeadingIndex >= 0 ? firstHeadingIndex : headerSlice.length; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = cleanLine(rawLine);
    if (!line) {
      if (current) current.lines.push("");
      continue;
    }

    const headingMatch = detectHeading(line);
    if (headingMatch) {
      const duplicateEmptyHeading =
        current &&
        current.type === headingMatch.type &&
        current.lines.every((sectionLine) => !cleanLine(sectionLine));
      if (duplicateEmptyHeading) continue;

      current = {
        type: headingMatch.type,
        heading: headingMatch.heading,
        lines: [],
      };
      rawSections.push(current);
      continue;
    }

    if (!current) {
      current = {
        type: "generic",
        heading: "ADDITIONAL INFORMATION",
        lines: [],
      };
      rawSections.push(current);
    }

    current.lines.push(rawLine);
  }

  const sections: NormalizedResumeSection[] = [];

  for (const section of rawSections) {
    const cleanedLines = section.lines.map((line) => cleanLine(line));
    if (section.type === "summary") {
      mergeSection(sections, {
        type: "summary",
        heading: section.heading,
        paragraphs: splitParagraphs(cleanedLines),
      });
      continue;
    }
    if (section.type === "skills") {
      mergeSection(sections, {
        type: "skills",
        heading: section.heading,
        items: parseSkillItems(cleanedLines),
      });
      continue;
    }
    if (section.type === "experience") {
      mergeSection(sections, {
        type: "experience",
        heading: section.heading,
        jobs: parseExperienceJobs(cleanedLines),
      });
      continue;
    }
    if (section.type === "education") {
      mergeSection(sections, {
        type: "education",
        heading: section.heading,
        items: parseLineItems(cleanedLines),
      });
      continue;
    }
    if (section.type === "certifications") {
      mergeSection(sections, {
        type: "certifications",
        heading: section.heading,
        items: parseLineItems(cleanedLines),
      });
      continue;
    }

    const paragraphs = splitParagraphs(cleanedLines.filter((line) => !isBulletLine(line)));
    const bullets = dedupe(
      cleanedLines.filter((line) => isBulletLine(line)).map((line) => normalizeBullet(line))
    );
    mergeSection(sections, {
      type: "generic",
      heading: section.heading,
      paragraphs,
      bullets: bullets.length > 0 ? bullets : undefined,
    });
  }

  return {
    name,
    contactLines,
    sections: sections.filter((section) => {
      if (section.type === "summary") return section.paragraphs.length > 0;
      if (section.type === "skills") return section.items.length > 0;
      if (section.type === "experience") return section.jobs.length > 0;
      if (section.type === "education" || section.type === "certifications") {
        return section.items.length > 0;
      }
      return section.paragraphs.length > 0 || Boolean(section.bullets?.length);
    }),
  };
}

export function normalizedResumeToText(resume: NormalizedResume) {
  const lines: string[] = [];

  if (resume.name) lines.push(cleanLine(resume.name));
  if (resume.contactLines.length > 0) {
    lines.push(...resume.contactLines.map((line) => cleanLine(line)));
  }
  if (lines.length > 0 && resume.sections.length > 0) {
    lines.push("");
  }

  resume.sections.forEach((section, index) => {
    lines.push(...renderSection(section));
    if (index < resume.sections.length - 1) {
      lines.push("");
    }
  });

  return normalizeText(lines.join("\n"));
}
