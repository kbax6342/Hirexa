import { removeGloballyBannedJobLines } from "./formatJobText";
import { normalizeJobDescriptionText } from "./normalize-job-description";

export type FormattedAdzunaSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type FormattedAdzunaHighlight = {
  label: string;
  value: string;
};

export type FormattedAdzunaDescription = {
  highlights: FormattedAdzunaHighlight[];
  intro: string[];
  sections: FormattedAdzunaSection[];
  employmentType: string | null;
  schedule: string | null;
  compensation: string | null;
  rawDescription: string;
  hasExplicitHeadings: boolean;
  isWeak: boolean;
};

type SectionRule = {
  title: string;
  pattern: RegExp;
  preferBullets?: boolean;
};

type BucketKey =
  | "cultureService"
  | "responsibilities"
  | "qualifications"
  | "benefits";

const SECTION_RULES: SectionRule[] = [
  {
    title: "What You'll Do",
    pattern: /^(what you'll do|what you ll do)$/i,
    preferBullets: true,
  },
  {
    title: "What We're Looking For",
    pattern:
      /^(what we're looking for|what we re looking for|what you'll bring|what you ll bring)$/i,
    preferBullets: true,
  },
  {
    title: "Perks of Joining Our Team",
    pattern: /^(perks of joining our team)$/i,
    preferBullets: true,
  },
  {
    title: "Our Culture and Values",
    pattern: /^(our culture and values|culture and values)$/i,
  },
  {
    title: "Ready to Apply",
    pattern: /^(ready to apply|how to apply|application process)$/i,
  },
  {
    title: "Responsibilities",
    pattern: /^(responsibilities|duties)$/i,
    preferBullets: true,
  },
  {
    title: "Requirements",
    pattern:
      /^(requirements|required qualifications|minimum qualifications|basic qualifications)$/i,
    preferBullets: true,
  },
  {
    title: "Qualifications",
    pattern: /^(qualifications|preferred qualifications)$/i,
    preferBullets: true,
  },
  {
    title: "Benefits",
    pattern: /^(benefits|benefits and perks|perks)$/i,
    preferBullets: true,
  },
  {
    title: "About the Role",
    pattern: /^(about the role|role overview|job description|description)$/i,
  },
  {
    title: "About Us",
    pattern: /^(about us|about the company|company overview)$/i,
  },
];

const HEADING_BREAK_PATTERN = new RegExp(
  `\\b(${[
    "What You'll Do",
    "What You ll Do",
    "What We're Looking For",
    "What We Re Looking For",
    "What You'll Bring",
    "What You ll Bring",
    "Perks of Joining Our Team",
    "Our Culture and Values",
    "Culture and Values",
    "Ready to Apply",
    "How to Apply",
    "Application Process",
    "Responsibilities",
    "Duties",
    "Requirements",
    "Required Qualifications",
    "Minimum Qualifications",
    "Basic Qualifications",
    "Qualifications",
    "Preferred Qualifications",
    "Benefits",
    "Benefits and Perks",
    "Perks",
    "About the Role",
    "Role Overview",
    "Job Description",
    "Description",
    "About Us",
    "About the Company",
    "Company Overview",
  ]
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\s*:`,
  "gi"
);

const EMPLOYMENT_TYPE_RULES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bfull[\s-]?time\b/i, value: "FULL_TIME" },
  { pattern: /\bpart[\s-]?time\b/i, value: "PART_TIME" },
  { pattern: /\bcontract(?:or)?\b/i, value: "CONTRACT" },
  { pattern: /\btemporary\b/i, value: "TEMPORARY" },
  { pattern: /\bseasonal\b/i, value: "SEASONAL" },
  { pattern: /\bintern(ship)?\b/i, value: "INTERNSHIP" },
];

const WORKPLACE_RULES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bremote\b/i, value: "Remote" },
  { pattern: /\bhybrid\b/i, value: "Hybrid" },
  { pattern: /\bonsite\b/i, value: "On-site" },
];

const SCHEDULE_PATTERNS = [
  /\b\d{1,2}(?::\d{2})?\s?(?:AM|PM)\s*-\s*\d{1,2}(?::\d{2})?\s?(?:AM|PM)\b/i,
  /\b(?:shifts?|shift available|shift availability)\b/i,
  /\b(?:weekends?|evenings?|overnights?)\b/i,
  /\b(?:flexibility|flexible schedule|schedule flexibility)\b/i,
  /\b(?:business hours|day shift|night shift)\b/i,
];

const COMPENSATION_PATTERNS = [
  /\$\s?\d[\d,]*(?:\.\d{1,2})?\s*(?:an?\s+hour|per\s+hour|hourly)/i,
  /\$\s?\d[\d,]*(?:\.\d{1,2})?\s*(?:per\s+year|annually|annual(?:ly)?)/i,
  /\$\s?\d[\d,]*(?:\.\d{1,2})?\s*-\s*\$\s?\d[\d,]*(?:\.\d{1,2})?\s*(?:per\s+hour|per\s+year|annually)?/i,
  /\bstarting rate(?:\s+of)?\s+\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:an?\s+hour|per\s+hour|per\s+year))?/i,
  /\bpay range(?:\s+of)?\s+\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s*-\s*\$\s?\d[\d,]*(?:\.\d{1,2})?)?/i,
];

const RESPONSIBILITY_HINTS = [
  "assist",
  "support",
  "maintain",
  "manage",
  "coordinate",
  "prepare",
  "help",
  "handle",
  "provide",
  "ensure",
  "perform",
  "deliver",
  "stock",
  "operate",
  "greet",
  "serve",
  "process",
];

const REQUIREMENT_HINTS = [
  "must",
  "required",
  "requirement",
  "ability to",
  "experience",
  "customer service",
  "detail oriented",
  "communication skills",
  "reliable",
  "able to lift",
  "qualification",
  "background check",
];

const BENEFIT_HINTS = [
  "we offer",
  "medical",
  "dental",
  "vision",
  "401k",
  "401(k)",
  "weekly pay",
  "paid time off",
  "pto",
  "holiday pay",
  "employee discount",
  "tuition assistance",
  "benefits",
];

const CULTURE_SERVICE_HINTS = [
  "team",
  "culture",
  "company",
  "our mission",
  "our values",
  "join us",
  "about us",
  "customer service",
  "guest experience",
  "high end service",
  "cleanliness",
  "organization",
  "detail oriented",
  "polished",
];

const QUALIFICATION_SENTENCE_PATTERN =
  /\b(successful candidates will have|we expect|the ideal candidate|you should have)\b/i;

const RESPONSIBILITY_LINE_PATTERN =
  /\b(assist|support|maintain|manage|prepare|handle|provide|ensure|stock|operate|greet|serve|process|help)\b/i;

const SECTION_ORDER = [
  "Responsibilities",
  "Qualifications",
  "Benefits",
  "Culture / Service Expectations",
  "Additional Details",
] as const;

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeHeadingKey(value: string) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = normalizeWhitespace(value);
    const key = normalizeKey(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function matchHeading(value: string) {
  const normalized = normalizeHeadingKey(value);

  for (const rule of SECTION_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule;
    }
  }

  return null;
}

function injectHeadingBreaks(value: string) {
  return value.replace(HEADING_BREAK_PATTERN, "\n\n$1:\n");
}

function cleanIntroBlock(value: string) {
  return normalizeWhitespace(
    value.replace(/^job description\s*:?\s*/i, "").replace(/^description\s*:?\s*/i, "")
  );
}

function isBulletLine(value: string) {
  return /^[-*]\s+/.test(value) || /^\d+[\.\)]\s+/.test(value);
}

function isMetadataOnlyBlock(value: string) {
  const cleaned = cleanIntroBlock(value);
  if (!cleaned) return true;

  const lines = cleaned
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  if (lines.length !== 1) {
    return false;
  }

  const line = lines[0];
  const words = line.split(/\s+/).filter(Boolean);

  if (words.length > 8) {
    return false;
  }

  return Boolean(
    detectEmploymentType(line) ||
      detectWorkplace(line) ||
      detectCompensation(line) ||
      detectSchedule(line)
  );
}

function looksLikeRealParagraph(value: string) {
  const cleaned = cleanIntroBlock(value);
  if (!cleaned || isMetadataOnlyBlock(cleaned)) {
    return false;
  }

  const lines = cleaned
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  if (lines.length === 0) {
    return false;
  }

  if (lines.every(isBulletLine)) {
    return false;
  }

  const joined = lines.join(" ");
  const words = joined.split(/\s+/).filter(Boolean);

  return words.length >= 8 || /[.!?]/.test(joined) || joined.length >= 60;
}

function extractOverviewParagraph(blocks: string[]) {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const lines = block
      .split(/\n+/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);

    if (lines.length === 0) continue;

    const standaloneHeading = lines.length === 1 ? matchHeading(lines[0]) : null;
    const firstLineHeading = matchHeading(lines[0]);
    const inlineHeading = lines[0].match(/^([^:]{2,60}):\s*(.+)$/);

    if (
      standaloneHeading ||
      firstLineHeading ||
      (inlineHeading && matchHeading(inlineHeading[1]))
    ) {
      break;
    }

    if (isMetadataOnlyBlock(block)) {
      continue;
    }

    if (looksLikeRealParagraph(block)) {
      return cleanIntroBlock(block);
    }

    break;
  }

  return null;
}

function pickFallbackOverview(values: string[]) {
  for (const value of values) {
    if (looksLikeRealParagraph(value)) {
      return cleanIntroBlock(value);
    }
  }

  return null;
}

function splitInlineBullets(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized.includes(" - ")) return [];

  return normalized
    .split(/\s+-\s+/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function splitSentenceItems(value: string) {
  const sentenceReady = normalizeWhitespace(value).replace(/\n+/g, " ");
  if (!sentenceReady) return [];

  const segments = sentenceReady
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);

  return segments.length > 1 ? segments : [sentenceReady];
}

function extractBullets(block: string, preferBullets: boolean) {
  const lines = block
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const explicitBullets = lines
    .flatMap((line) => {
      if (/^[-*]\s+/.test(line)) {
        return [line.replace(/^[-*]\s+/, "").trim()];
      }

      if (/^\d+[\.\)]\s+/.test(line)) {
        return [line.replace(/^\d+[\.\)]\s+/, "").trim()];
      }

      return [];
    })
    .filter(Boolean);

  if (explicitBullets.length > 0) {
    return dedupePreserveOrder(explicitBullets);
  }

  if (!preferBullets) {
    return [];
  }

  const inlineBullets = splitInlineBullets(block);
  if (inlineBullets.length > 1) {
    return dedupePreserveOrder(inlineBullets);
  }

  return [];
}

function extractParagraph(block: string) {
  return normalizeWhitespace(
    block
      .split(/\n+/)
      .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+[\.\)]\s+/, "").trim())
      .filter(Boolean)
      .join(" ")
  );
}

function buildSection(
  title: string,
  blocks: string[],
  preferBullets = false
): FormattedAdzunaSection | null {
  const bullets = dedupePreserveOrder(
    blocks.flatMap((block) => extractBullets(block, preferBullets))
  );
  const paragraphs = dedupePreserveOrder(
    blocks
      .map((block) => (extractBullets(block, preferBullets).length > 0 ? "" : extractParagraph(block)))
      .filter(Boolean)
  );

  if (bullets.length === 0 && paragraphs.length === 0) {
    return null;
  }

  return {
    title,
    paragraphs: paragraphs.length > 0 ? paragraphs : undefined,
    bullets: bullets.length > 0 ? bullets : undefined,
  };
}

function countHints(value: string, hints: string[]) {
  const normalized = normalizeKey(value);
  return hints.reduce(
    (count, hint) => count + (normalized.includes(normalizeKey(hint)) ? 1 : 0),
    0
  );
}

function pickHeuristicBucket(value: string): BucketKey | null {
  const normalized = normalizeKey(value);
  const serviceScore = countHints(value, CULTURE_SERVICE_HINTS);
  const benefitScore = countHints(value, BENEFIT_HINTS);
  const qualificationScore = countHints(value, REQUIREMENT_HINTS);
  const responsibilityScore = countHints(value, RESPONSIBILITY_HINTS);

  if (QUALIFICATION_SENTENCE_PATTERN.test(normalized)) {
    return serviceScore > 0 ? "cultureService" : "qualifications";
  }

  const ranked = ([
    { key: "cultureService", score: serviceScore },
    { key: "benefits", score: benefitScore },
    { key: "qualifications", score: qualificationScore },
    { key: "responsibilities", score: responsibilityScore },
  ] as Array<{ key: BucketKey; score: number }>).sort(
    (left, right) => right.score - left.score
  );

  if (ranked[0]?.score > 0) {
    return ranked[0].key;
  }

  return null;
}

function inferSectionsFromBlob(text: string) {
  const items = dedupePreserveOrder(
    text
      .split(/\n{2,}/)
      .flatMap((block) => {
        const inlineBullets = splitInlineBullets(block);
        if (inlineBullets.length > 1) {
          return inlineBullets;
        }

        return splitSentenceItems(block);
      })
      .map((item) => normalizeWhitespace(item))
      .filter((item) => item.length >= 24)
  );

  const intro: string[] = [];
  const buckets: Record<BucketKey, string[]> = {
    cultureService: [],
    responsibilities: [],
    qualifications: [],
    benefits: [],
  };

  for (const item of items) {
    const bucket = pickHeuristicBucket(item);
    if (bucket) {
      buckets[bucket].push(item);
      continue;
    }

    if (intro.length < 2 && !RESPONSIBILITY_LINE_PATTERN.test(item)) {
      intro.push(item);
    } else if (RESPONSIBILITY_LINE_PATTERN.test(item)) {
      buckets.responsibilities.push(item);
    } else {
      buckets.cultureService.push(item);
    }
  }

  const sections: FormattedAdzunaSection[] = [];

  const addParagraphSection = (title: string, values: string[]) => {
    const paragraphs = dedupePreserveOrder(values);
    if (paragraphs.length > 0) {
      sections.push({ title, paragraphs });
    }
  };

  const addBulletSection = (title: string, values: string[]) => {
    const bullets = dedupePreserveOrder(values);
    if (bullets.length > 0) {
      sections.push({ title, bullets });
    }
  };

  addBulletSection("Responsibilities", buckets.responsibilities);
  addBulletSection("Qualifications", buckets.qualifications);
  addBulletSection("Benefits", buckets.benefits);
  addParagraphSection("Culture / Service Expectations", buckets.cultureService);

  return {
    intro: dedupePreserveOrder(intro.map(cleanIntroBlock).filter(Boolean)),
    sections,
  };
}

function detectEmploymentType(text: string) {
  for (const rule of EMPLOYMENT_TYPE_RULES) {
    if (rule.pattern.test(text)) {
      return rule.value;
    }
  }

  return null;
}

function formatEmploymentType(value: string) {
  switch (value) {
    case "FULL_TIME":
      return "Full-time";
    case "PART_TIME":
      return "Part-time";
    case "CONTRACT":
      return "Contract";
    case "TEMPORARY":
      return "Temporary";
    case "SEASONAL":
      return "Seasonal";
    case "INTERNSHIP":
      return "Internship";
    default:
      return value;
  }
}

function detectWorkplace(text: string) {
  for (const rule of WORKPLACE_RULES) {
    if (rule.pattern.test(text)) {
      return rule.value;
    }
  }

  return null;
}

function findSentenceMatch(text: string, patterns: RegExp[]) {
  const sentences = dedupePreserveOrder(
    text
      .split(/\n+/)
      .flatMap((line) => splitSentenceItems(line))
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
  );

  for (const sentence of sentences) {
    if (patterns.some((pattern) => pattern.test(sentence))) {
      return sentence;
    }
  }

  return null;
}

function detectSchedule(text: string) {
  return findSentenceMatch(text, SCHEDULE_PATTERNS);
}

function detectCompensation(text: string) {
  for (const pattern of COMPENSATION_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return normalizeWhitespace(match[0]);
    }
  }

  return null;
}

function extractHighlights(params: {
  employmentType: string | null;
  workplace: string | null;
  compensation: string | null;
  schedule: string | null;
}) {
  const highlights: FormattedAdzunaHighlight[] = [];

  if (params.employmentType) {
    highlights.push({
      label: "Employment Type",
      value: formatEmploymentType(params.employmentType),
    });
  }

  if (params.workplace) {
    highlights.push({ label: "Workplace", value: params.workplace });
  }

  if (params.compensation) {
    highlights.push({ label: "Compensation", value: params.compensation });
  }

  if (params.schedule) {
    highlights.push({ label: "Schedule", value: params.schedule });
  }

  return highlights;
}

function mergeSections(
  explicitSections: FormattedAdzunaSection[],
  heuristicSections: FormattedAdzunaSection[]
) {
  const seenTitles = new Set(explicitSections.map((section) => normalizeKey(section.title)));
  const merged = [...explicitSections];

  for (const section of heuristicSections) {
    const key = normalizeKey(section.title);
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    merged.push(section);
  }

  return merged;
}

function buildCandidateFragments(text: string) {
  return dedupePreserveOrder(
    text
      .split(/\n{2,}/)
      .flatMap((block) => {
        const bulletItems = extractBullets(block, true);
        if (bulletItems.length > 0) {
          return bulletItems;
        }

        return splitSentenceItems(block);
      })
      .map((item) => cleanIntroBlock(item))
      .filter((item) => item.length >= 12)
  );
}

function buildAssignedKeys(params: {
  highlights: FormattedAdzunaHighlight[];
  intro: string[];
  sections: FormattedAdzunaSection[];
}) {
  const assigned = new Set<string>();

  const addAssignedValue = (value: string) => {
    const cleaned = cleanIntroBlock(value);
    const key = normalizeKey(cleaned);
    if (key) {
      assigned.add(key);
    }

    for (const sentence of splitSentenceItems(cleaned)) {
      const sentenceKey = normalizeKey(sentence);
      if (sentenceKey) {
        assigned.add(sentenceKey);
      }
    }
  };

  for (const highlight of params.highlights) {
    assigned.add(normalizeKey(highlight.value));
  }

  for (const paragraph of params.intro) {
    addAssignedValue(paragraph);
  }

  for (const section of params.sections) {
    for (const paragraph of section.paragraphs ?? []) {
      addAssignedValue(paragraph);
    }
    for (const bullet of section.bullets ?? []) {
      addAssignedValue(bullet);
    }
  }

  return assigned;
}

function appendAdditionalDetailsSection(
  text: string,
  highlights: FormattedAdzunaHighlight[],
  intro: string[],
  sections: FormattedAdzunaSection[]
) {
  const assignedKeys = buildAssignedKeys({ highlights, intro, sections });
  const leftovers = buildCandidateFragments(text).filter((fragment) => {
    const key = normalizeKey(fragment);
    return key && !assignedKeys.has(key);
  });

  if (leftovers.length === 0) {
    return sections;
  }

  return [
    ...sections,
    {
      title: "Additional Details",
      paragraphs: leftovers,
    },
  ];
}

function orderSections(sections: FormattedAdzunaSection[]) {
  const orderMap = new Map<string, number>(
    SECTION_ORDER.map((title, index) => [title, index])
  );

  return [...sections].sort((left, right) => {
    const leftOrder = orderMap.get(left.title) ?? SECTION_ORDER.length;
    const rightOrder = orderMap.get(right.title) ?? SECTION_ORDER.length;
    return leftOrder - rightOrder;
  });
}

export function shouldUseAiForAdzunaDescription(
  formatted: FormattedAdzunaDescription | null
) {
  return !formatted || formatted.isWeak;
}

export function formatAdzunaDescription(
  rawDescription: string | null | undefined
): FormattedAdzunaDescription | null {
  const normalized = normalizeWhitespace(
    removeGloballyBannedJobLines(
      injectHeadingBreaks(
        normalizeJobDescriptionText(String(rawDescription ?? ""), {
          source: "adzuna",
        })
      )
    )
  );

  if (!normalized) {
    return null;
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => normalizeWhitespace(block))
    .filter(Boolean);

  const introBlocks: string[] = [];
  const explicitSections: FormattedAdzunaSection[] = [];
  let activeTitle: string | null = null;
  let activePreferBullets = false;
  let activeBlocks: string[] = [];
  let hasExplicitHeadings = false;

  const flushSection = () => {
    if (!activeTitle) return;
    const section = buildSection(activeTitle, activeBlocks, activePreferBullets);
    if (section) {
      explicitSections.push(section);
    }
    activeBlocks = [];
  };

  for (const block of blocks) {
    const lines = block
      .split(/\n+/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);

    if (lines.length === 0) continue;

    const standaloneHeading = lines.length === 1 ? matchHeading(lines[0]) : null;
    if (standaloneHeading) {
      flushSection();
      activeTitle = standaloneHeading.title;
      activePreferBullets = Boolean(standaloneHeading.preferBullets);
      hasExplicitHeadings = true;
      continue;
    }

    const firstLineHeading = matchHeading(lines[0]);
    if (firstLineHeading && lines.length > 1) {
      flushSection();
      activeTitle = firstLineHeading.title;
      activePreferBullets = Boolean(firstLineHeading.preferBullets);
      activeBlocks = [lines.slice(1).join("\n")];
      hasExplicitHeadings = true;
      continue;
    }

    const inlineHeading = lines[0].match(/^([^:]{2,60}):\s*(.+)$/);
    if (inlineHeading) {
      const matchedHeading = matchHeading(inlineHeading[1]);
      if (matchedHeading) {
        flushSection();
        activeTitle = matchedHeading.title;
        activePreferBullets = Boolean(matchedHeading.preferBullets);
        activeBlocks = [inlineHeading[2], ...lines.slice(1)];
        hasExplicitHeadings = true;
        continue;
      }
    }

    if (activeTitle) {
      activeBlocks.push(block);
    } else {
      introBlocks.push(block);
    }
  }

  flushSection();

  const explicitIntro = dedupePreserveOrder(
    introBlocks.map(cleanIntroBlock).filter(Boolean)
  );
  const heuristic = inferSectionsFromBlob(normalized);
  const overviewParagraph =
    extractOverviewParagraph(blocks) ??
    pickFallbackOverview(explicitIntro) ??
    pickFallbackOverview(heuristic.intro);
  const mergedIntro = overviewParagraph ? [overviewParagraph] : [];
  const mergedSections = mergeSections(explicitSections, heuristic.sections).map(
    (section) => ({
      ...section,
      paragraphs: dedupePreserveOrder(
        (section.paragraphs ?? []).filter(
          (paragraph) => !mergedIntro.some((intro) => normalizeKey(intro) === normalizeKey(paragraph))
        )
      ),
      bullets: dedupePreserveOrder(
        (section.bullets ?? []).filter(
          (bullet) => !mergedIntro.some((intro) => normalizeKey(intro) === normalizeKey(bullet))
        )
      ),
    })
  ).filter((section) => (section.paragraphs?.length ?? 0) > 0 || (section.bullets?.length ?? 0) > 0);
  const employmentType = detectEmploymentType(normalized);
  const workplace = detectWorkplace(normalized);
  const schedule = detectSchedule(normalized);
  const compensation = detectCompensation(normalized);
  const highlights = extractHighlights({
    employmentType,
    workplace,
    compensation,
    schedule,
  });
  const losslessSections = orderSections(
    appendAdditionalDetailsSection(normalized, highlights, mergedIntro, mergedSections)
  );
  const isWeak =
    losslessSections.length === 0 ||
    (!hasExplicitHeadings &&
      normalized.length > 900 &&
      losslessSections.length < 2 &&
      mergedIntro.length < 2);

  return {
    highlights,
    intro: mergedIntro,
    sections: losslessSections,
    employmentType,
    schedule,
    compensation,
    rawDescription: normalized,
    hasExplicitHeadings,
    isWeak,
  };
}
