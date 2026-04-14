import "server-only";

import * as cheerio from "cheerio";
import { NextResponse } from "next/server";

import {
  buildAdzunaStructuredHtml,
  splitAdzunaSections,
} from "@/app/lib/jobs/adzunaStructuredDetail";
import { cleanJobText } from "@/app/lib/jobs/clean-job-text";
import {
  formatAdzunaDescription,
  type FormattedAdzunaDescription,
} from "@/app/lib/jobs/formatAdzunaDescription";

type JsonLdNode = Record<string, unknown>;

type SalaryInfo = {
  text: string;
  min: number | null;
  max: number | null;
};

type SplitContext = {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
};

type DetailQualityResult = {
  isLowContent: boolean;
  score: number;
  reasons: string[];
};

type ExtractedSection = {
  title: string;
  kind: "paragraphs" | "bullets";
  paragraphs?: string[];
  bullets?: string[];
};

type ExtractedJobContent = {
  descriptionText: string;
  descriptionHtml: string | null;
  responsibilities: string[];
  qualifications: string[];
  benefits: string[];
  sections: ExtractedSection[];
  intro: string[];
  rawDescription: string;
  employmentType: string;
  schedule: string;
  compensation: string;
  quality: DetailQualityResult;
};

const DESCRIPTION_SECTION_MARKERS = [
  />\s*Job Description\s*</i,
  />\s*Description\s*</i,
  />\s*Position Overview\s*</i,
  />\s*Overview\s*</i,
  />\s*Responsibilities\s*</i,
  />\s*Requirements\s*</i,
  />\s*Qualifications\s*</i,
  />\s*About the Role\s*</i,
  />\s*About the Team\s*</i,
];

const DESCRIPTION_HTML_HEADING_PATTERN =
  /^(job description|description|position overview|overview|responsibilities|requirements|qualifications|about the role|about the team)$/i;

const DESCRIPTION_HTML_STOP_PATTERN =
  /^(apply now|share this job|report this job|similar jobs|related jobs|recommended jobs|about adzuna|sign in|register)$/i;

const DESCRIPTION_HTML_ATTR_PATTERN =
  /\b(description|job-description|jobdescription|job-details|jobdetails|details|content)\b/i;

const DESCRIPTION_IRRELEVANT_ATTR_PATTERN =
  /\b(apply|cta|share|social|salary|metadata|toolbar|action|header|footer|breadcrumb|similar|related|recommend|alert|signup|login|register|cookie|banner|promo|advert)\b/i;

const ALLOWED_DESCRIPTION_TAGS = new Set([
  "a",
  "article",
  "blockquote",
  "br",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "li",
  "ol",
  "p",
  "section",
  "span",
  "strong",
  "u",
  "ul",
]);

const LOW_CONTENT_METADATA_LINE_PATTERN =
  /^(date posted|country|location|position role type|role type|citizenship|security clearance|clearance|workplace|job posted|state match|schedule)\b/i;

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value: string) {
  return decodeHtml(
    value
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function stripHtml(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(
        /<\/(p|div|br|li|h1|h2|h3|h4|h5|h6|section|article|main|ul|ol)>/gi,
        "\n"
      )
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
  );
}

function getElementTagName(node: unknown) {
  if (
    node &&
    typeof node === "object" &&
    "tagName" in node &&
    typeof (node as { tagName?: unknown }).tagName === "string"
  ) {
    return (node as { tagName: string }).tagName.toLowerCase();
  }

  return "";
}

function normalizeHtmlFragment(html: string) {
  return html
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasUsableDescriptionHtml(html: string) {
  return stripHtml(html).length > 120 && /<(p|ul|ol|li|br|strong|h[1-6])\b/i.test(html);
}

function scoreDescriptionHtmlCandidate(html: string) {
  const plain = stripHtml(html);
  const paragraphCount = (html.match(/<p\b/gi) ?? []).length;
  const listItemCount = (html.match(/<li\b/gi) ?? []).length;
  const headingCount = (html.match(/<(h[1-6]|strong)\b/gi) ?? []).length;
  const penalty =
    ((plain.match(/apply now|share this job|similar jobs|related jobs|recommended jobs/gi) ??
      []).length ?? 0) * 300;

  return plain.length + paragraphCount * 120 + listItemCount * 90 + headingCount * 40 - penalty;
}

function cleanDescriptionHtmlFragment(fragmentHtml: string) {
  const trimmed = fragmentHtml.trim();
  if (!trimmed) return "";

  const $ = cheerio.load(`<div data-adzuna-description-root="true">${trimmed}</div>`);
  const root = $("[data-adzuna-description-root='true']");

  root
    .find(
      "script,style,noscript,template,svg,form,button,nav,header,footer,aside,iframe,img,picture,source,input,textarea,select,meta,link"
    )
    .remove();

  root.find("*").each((_, element) => {
    const $element = $(element);
    const tagName = getElementTagName(element);

    if (!tagName) return;

    if ($element.attr("hidden") !== undefined || $element.attr("aria-hidden") === "true") {
      $element.remove();
      return;
    }

    const attrBlob = [
      $element.attr("id"),
      $element.attr("class"),
      $element.attr("data-testid"),
      $element.attr("role"),
      $element.attr("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const text = cleanText($element.text());

    if (DESCRIPTION_IRRELEVANT_ATTR_PATTERN.test(attrBlob)) {
      $element.remove();
      return;
    }

    if (
      (tagName === "a" || tagName === "button") &&
      /apply|share|report|save|sign in|register/i.test(text) &&
      text.length < 120
    ) {
      $element.remove();
      return;
    }

    if (!ALLOWED_DESCRIPTION_TAGS.has(tagName)) {
      $element.replaceWith($element.html() ?? $element.text());
      return;
    }

    for (const attributeName of Object.keys(element.attribs ?? {})) {
      if (tagName === "a" && ["href", "target", "rel"].includes(attributeName)) {
        continue;
      }
      $element.removeAttr(attributeName);
    }
  });

  root.find("*").each((_, element) => {
    const $element = $(element);
    const tagName = getElementTagName(element);

    if (!tagName || tagName === "br") return;

    const text = cleanText($element.text());
    const hasChildren = $element.children().length > 0;

    if (!text && !hasChildren) {
      $element.remove();
    }
  });

  return normalizeHtmlFragment(root.html() ?? "");
}

function extractDescriptionHtmlCandidates(html: string, jobPosting: JsonLdNode | null) {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (rawHtml: string) => {
    const cleaned = cleanDescriptionHtmlFragment(rawHtml);
    if (!hasUsableDescriptionHtml(cleaned)) return;

    const key = normalizeCompare(stripHtml(cleaned));
    if (!key || seen.has(key)) return;

    seen.add(key);
    candidates.push(cleaned);
  };

  const jsonLdDescription = asString(jobPosting?.description);
  if (/<[a-z][\s\S]*?>/i.test(jsonLdDescription)) {
    pushCandidate(jsonLdDescription);
  }

  const $ = cheerio.load(html);
  $("script,style,noscript,template").remove();

  const selectorCandidates = [
    "[itemprop='description']",
    "[id*='job-description']",
    "[class*='job-description']",
    "[id*='description']",
    "[class*='description']",
    "[id*='job-details']",
    "[class*='job-details']",
    "[id*='details']",
    "[class*='details']",
    "main",
    "article",
  ];

  for (const selector of selectorCandidates) {
    $(selector)
      .slice(0, 4)
      .each((_, element) => {
        const $element = $(element);
        const attrBlob = [
          $element.attr("id"),
          $element.attr("class"),
          $element.attr("data-testid"),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const tagName = getElementTagName(element);
        if (
          attrBlob &&
          !DESCRIPTION_HTML_ATTR_PATTERN.test(attrBlob) &&
          tagName !== "main" &&
          tagName !== "article"
        ) {
          return;
        }

        pushCandidate($.html(element) ?? "");
      });
  }

  $("h1,h2,h3,h4,h5,h6,p,strong,span,div")
    .slice(0, 200)
    .each((_, element) => {
      const headingText = cleanText($(element).text());

      if (!DESCRIPTION_HTML_HEADING_PATTERN.test(headingText) || headingText.length > 80) {
        return;
      }

      const parts: string[] = [];
      let sibling = $(element).next();
      let safetyCounter = 0;

      while (sibling.length > 0 && safetyCounter < 18) {
        const siblingText = cleanText(sibling.text());
        if (!siblingText) {
          sibling = sibling.next();
          safetyCounter += 1;
          continue;
        }

        if (DESCRIPTION_HTML_STOP_PATTERN.test(siblingText)) {
          break;
        }

        const siblingHtml = cleanDescriptionHtmlFragment($.html(sibling) ?? "");
        if (stripHtml(siblingHtml).length > 40) {
          parts.push(siblingHtml);
        }

        if (stripHtml(parts.join("\n")).length > 8000) {
          break;
        }

        sibling = sibling.next();
        safetyCounter += 1;
      }

      if (parts.length > 0) {
        pushCandidate(parts.join("\n"));
      }
    });

  return candidates.sort(
    (left, right) => scoreDescriptionHtmlCandidate(right) - scoreDescriptionHtmlCandidate(left)
  );
}

function normalizeCompare(value: string | null | undefined) {
  return cleanText(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => asStringArray(item));
  }

  const text = asString(value).trim();
  return text ? [text] : [];
}

function flattenJsonLd(value: unknown): JsonLdNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const node = value as JsonLdNode;
  return [node, ...flattenJsonLd(node["@graph"])];
}

function hasJsonLdType(node: JsonLdNode, typeName: string) {
  return asStringArray(node["@type"]).some(
    (value) => value.toLowerCase() === typeName.toLowerCase()
  );
}

function extractJobPostingJsonLd(html: string) {
  const matches = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const nodes = flattenJsonLd(parsed);
      const jobPosting = nodes.find((node) => hasJsonLdType(node, "JobPosting"));
      if (jobPosting) return jobPosting;
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return null;
}

function extractTitle(html: string) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) {
    return stripHtml(h1[1]);
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.[1]) {
    return stripHtml(title[1]).replace(/\s*\|\s*Adzuna\s*$/i, "");
  }

  return "";
}

function extractLocationFromText(titleText: string) {
  const match = titleText.match(/Job in\s+(.+?)\s*$/i);
  return match?.[1]?.trim() ?? "";
}

function readJobPostingCompany(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";

  const hiringOrganization = jobPosting.hiringOrganization;
  if (hiringOrganization && typeof hiringOrganization === "object") {
    return cleanText(asString((hiringOrganization as JsonLdNode).name));
  }

  return "";
}

function readJobPostingLocation(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";

  const locations = Array.isArray(jobPosting.jobLocation)
    ? jobPosting.jobLocation
    : jobPosting.jobLocation
      ? [jobPosting.jobLocation]
      : [];

  for (const location of locations) {
    if (!location || typeof location !== "object") continue;

    const node = location as JsonLdNode;
    const address =
      node.address && typeof node.address === "object"
        ? (node.address as JsonLdNode)
        : null;

    const parts = [
      address ? asString(address.addressLocality) : "",
      address ? asString(address.addressRegion) : "",
      address ? asString(address.addressCountry) : "",
    ]
      .map((value) => cleanText(value))
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(", ");
    }
  }

  return cleanText(asString(jobPosting.jobLocationType));
}

function readJobPostingEmploymentType(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";
  return cleanText(asStringArray(jobPosting.employmentType).join(", "));
}

function readJobPostingCategory(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";

  return cleanText(
    [
      ...asStringArray(jobPosting.occupationalCategory),
      ...asStringArray(jobPosting.industry),
    ].join(", ")
  );
}

function readJobPostingDate(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";
  return cleanText(asString(jobPosting.datePosted));
}

function formatPostedLabel(dateValue: string) {
  if (!dateValue) return "";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return cleanText(dateValue);
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isPredictedSalary(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function readSalaryInfo(baseSalary: unknown): SalaryInfo {
  if (!baseSalary || typeof baseSalary !== "object") {
    return {
      text: "",
      min: null,
      max: null,
    };
  }

  const node = baseSalary as JsonLdNode;
  const currency = asString(node.currency) || "USD";
  const unitText = cleanText(
    asString(node.unitText) ||
      (node.value && typeof node.value === "object"
        ? asString((node.value as JsonLdNode).unitText)
        : "")
  );

  const valueNode =
    node.value && typeof node.value === "object" ? (node.value as JsonLdNode) : node;
  const minValue = Number(valueNode.minValue ?? valueNode.value ?? NaN);
  const maxValue = Number(valueNode.maxValue ?? NaN);

  if (!Number.isFinite(minValue) && !Number.isFinite(maxValue)) {
    return {
      text: "",
      min: null,
      max: null,
    };
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  const formattedMin = Number.isFinite(minValue) ? formatter.format(minValue) : "";
  const formattedMax = Number.isFinite(maxValue) ? formatter.format(maxValue) : "";
  const unitSuffix = unitText ? ` / ${unitText}` : "";

  if (formattedMin && formattedMax) {
    if (Math.round(minValue) === Math.round(maxValue)) {
      return {
        text: `${formattedMin}${unitSuffix}`,
        min: minValue,
        max: maxValue,
      };
    }

    return {
      text: `${formattedMin} - ${formattedMax}${unitSuffix}`,
      min: minValue,
      max: maxValue,
    };
  }

  if (formattedMin) {
    return {
      text: `From ${formattedMin}${unitSuffix}`,
      min: minValue,
      max: Number.isFinite(maxValue) ? maxValue : null,
    };
  }

  return {
    text: `Up to ${formattedMax}${unitSuffix}`,
    min: Number.isFinite(minValue) ? minValue : null,
    max: maxValue,
  };
}

function readSalaryIsEstimated(html: string, jobPosting: JsonLdNode | null) {
  if (isPredictedSalary(jobPosting?.salary_is_predicted)) {
    return true;
  }

  return (
    /salary_is_predicted["']?\s*[:=]\s*(?:true|1)/i.test(html) ||
    /\bestimated salary\b/i.test(html)
  );
}

function formatSalaryText(text: string, estimated: boolean) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";
  return estimated ? `${cleaned} - estimated` : cleaned;
}

function readJobPostingUrl(jobPosting: JsonLdNode | null, fallbackUrl: string) {
  if (!jobPosting) return fallbackUrl;
  const url = cleanText(asString(jobPosting.url));
  return url || fallbackUrl;
}

function extractDescriptionCandidates(
  html: string,
  jobPosting: JsonLdNode | null,
  htmlCandidates: string[] = []
) {
  const candidates: string[] = [];

  for (const htmlCandidate of htmlCandidates) {
    const plainText = stripHtml(htmlCandidate);
    if (plainText.length > 80) {
      candidates.push(plainText);
    }
  }

  const jsonLdDescription = stripHtml(asString(jobPosting?.description));
  if (jsonLdDescription.length > 80) {
    candidates.push(jsonLdDescription);
  }

  for (const pattern of DESCRIPTION_SECTION_MARKERS) {
    const markerIndex = html.search(pattern);
    if (markerIndex === -1) continue;
    const chunk = stripHtml(html.slice(Math.max(0, markerIndex - 200), markerIndex + 80000));
    if (chunk.length > 80) {
      candidates.push(chunk);
    }
  }

  const mainMatch = html.match(/<(main|article)[^>]*>([\s\S]{600,120000}?)<\/\1>/i);
  if (mainMatch?.[2]) {
    const chunk = stripHtml(mainMatch[2]);
    if (chunk.length > 80) {
      candidates.push(chunk);
    }
  }

  const fullText = stripHtml(html);
  if (fullText.length > 80) {
    candidates.push(fullText);
  }

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const candidate of candidates) {
    const cleanedCandidate = cleanJobText(candidate, { source: "adzuna" });
    const key = normalizeCompare(cleanedCandidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(cleanedCandidate);
  }

  return deduped;
}

function scoreStructuredContent(params: {
  descriptionIntro: string[];
  responsibilities: string[];
  qualifications: string[];
  description: string;
}) {
  return (
    params.descriptionIntro.join(" ").length +
    params.description.length +
    params.responsibilities.length * 120 +
    params.qualifications.length * 120
  );
}

function findSectionBullets(
  sections: Array<{ title: string; bullets?: string[]; paragraphs?: string[] }>,
  pattern: RegExp
) {
  return sections
    .filter((section) => pattern.test(section.title))
    .flatMap((section) => section.bullets ?? [])
    .filter(Boolean);
}

function dedupeTextItems(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(String(value ?? ""));
    const key = normalizeCompare(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function mapFormattedSections(formatted: FormattedAdzunaDescription | null): ExtractedSection[] {
  const mappedSections: Array<ExtractedSection | null> = (formatted?.sections ?? [])
    .map((section) => {
      const title = cleanText(section.title);
      const bullets = dedupeTextItems(section.bullets ?? []);
      const paragraphs = dedupeTextItems(section.paragraphs ?? []);

      if (!title) return null;

      if (bullets.length > 0) {
        return {
          title,
          kind: "bullets" as const,
          bullets,
        };
      }

      if (paragraphs.length > 0) {
        return {
          title,
          kind: "paragraphs" as const,
          paragraphs,
        };
      }

      return null;
    });

  return mappedSections.filter(
    (section): section is ExtractedSection => section !== null
  );
}

function buildFallbackSectionsFromStructured(structured: {
  descriptionIntro: string[];
  responsibilities: string[];
  qualifications: string[];
  description: string;
}): ExtractedSection[] {
  const sections: ExtractedSection[] = [];

  if (cleanText(structured.description)) {
    sections.push({
      title: "Position Overview",
      kind: "paragraphs",
      paragraphs: [cleanText(structured.description)],
    });
  }

  if (structured.responsibilities.length > 0) {
    sections.push({
      title: "Responsibilities",
      kind: "bullets",
      bullets: dedupeTextItems(structured.responsibilities),
    });
  }

  if (structured.qualifications.length > 0) {
    sections.push({
      title: "Qualifications",
      kind: "bullets",
      bullets: dedupeTextItems(structured.qualifications),
    });
  }

  return sections;
}

function findSectionValues(
  sections: Array<{ title: string; bullets?: string[]; paragraphs?: string[] }>,
  pattern: RegExp
) {
  return dedupeTextItems(
    sections
      .filter((section) => pattern.test(section.title))
      .flatMap((section) => [...(section.bullets ?? []), ...(section.paragraphs ?? [])])
  );
}

function flattenSectionsToText(sections: ExtractedSection[]) {
  return cleanText(
    sections
      .map((section) =>
        [
          section.title,
          ...(section.paragraphs ?? []),
          ...(section.bullets ?? []).map((bullet) => `- ${bullet}`),
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n")
  );
}

function getSectionContentLength(section: ExtractedSection) {
  return [...(section.paragraphs ?? []), ...(section.bullets ?? [])].join(" ").length;
}

function mergeSectionsPreferRicher(
  baseSections: ExtractedSection[],
  enrichedSections: ExtractedSection[],
  preferEnriched: boolean
) {
  const ordered = preferEnriched
    ? [...enrichedSections, ...baseSections]
    : [...baseSections, ...enrichedSections];
  const merged = new Map<string, ExtractedSection>();

  for (const section of ordered) {
    const key = `${normalizeCompare(section.title)}:${section.kind}`;
    const existing = merged.get(key);

    if (!existing || getSectionContentLength(section) > getSectionContentLength(existing)) {
      merged.set(key, section);
    }
  }

  return [...merged.values()];
}

function chooseBetterText(
  currentValue: string | null,
  nextValue: string | null,
  currentScore: number,
  nextScore: number
) {
  const currentLength = stripHtml(currentValue ?? "").length;
  const nextLength = stripHtml(nextValue ?? "").length;

  if (!nextLength) return currentValue;
  if (!currentLength) return nextValue;

  if (nextScore > currentScore + 120) return nextValue;
  if (nextLength > currentLength * 1.2) return nextValue;

  return currentValue;
}

function mergeTextLists(
  baseItems: string[],
  enrichedItems: string[],
  preferEnriched: boolean
) {
  return dedupeTextItems(
    preferEnriched
      ? [...enrichedItems, ...baseItems]
      : [...baseItems, ...enrichedItems]
  );
}

function assessDetailQuality(params: {
  descriptionText: string;
  descriptionHtml: string | null;
  intro: string[];
  sections: ExtractedSection[];
  responsibilities: string[];
  qualifications: string[];
  benefits: string[];
  formatted: FormattedAdzunaDescription | null;
}) {
  const bodyText = cleanJobText(
    [
      params.descriptionText,
      params.intro.join("\n\n"),
      flattenSectionsToText(params.sections),
    ]
      .filter(Boolean)
      .join("\n\n"),
    { source: "adzuna" }
  );
  const meaningfulParagraphs = bodyText
    .split(/\n{2,}/)
    .map((paragraph) => cleanText(paragraph))
    .filter(
      (paragraph) =>
        paragraph.length >= 70 && !LOW_CONTENT_METADATA_LINE_PATTERN.test(paragraph)
    );
  const bulletCount = dedupeTextItems([
    ...params.responsibilities,
    ...params.qualifications,
    ...params.benefits,
    ...params.sections.flatMap((section) => section.bullets ?? []),
  ]).length;
  const sectionCount =
    params.sections.filter(
      (section) =>
        (section.paragraphs?.length ?? 0) > 0 || (section.bullets?.length ?? 0) > 0
    ).length + (params.intro.length > 0 ? 1 : 0);
  const metadataLineCount = bodyText
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter((line) => LOW_CONTENT_METADATA_LINE_PATTERN.test(line)).length;

  let score =
    Math.min(bodyText.length, 1800) +
    Math.min(meaningfulParagraphs.length, 6) * 120 +
    Math.min(sectionCount, 6) * 160 +
    Math.min(bulletCount, 12) * 55;
  const reasons: string[] = [];

  if (bodyText.length < 900) {
    score -= 320;
    reasons.push("body_too_short");
  }

  if (meaningfulParagraphs.length < 2) {
    score -= 180;
    reasons.push("too_few_paragraphs");
  }

  if (sectionCount < 2) {
    score -= 220;
    reasons.push("too_few_sections");
  }

  if (bulletCount < 3) {
    score -= 180;
    reasons.push("too_few_bullets");
  }

  if (params.responsibilities.length === 0) {
    reasons.push("missing_responsibilities");
  }

  if (params.qualifications.length === 0) {
    reasons.push("missing_qualifications");
  }

  if (metadataLineCount >= 3) {
    score -= metadataLineCount * 100;
    reasons.push("metadata_heavy");
  }

  if (params.descriptionHtml && stripHtml(params.descriptionHtml).length < 700) {
    score -= 100;
    reasons.push("html_block_too_small");
  }

  if (params.formatted?.isWeak) {
    score -= 220;
    reasons.push("formatted_sections_weak");
  }

  const isLowContent =
    score < 1400 ||
    (bodyText.length < 900 && sectionCount < 2) ||
    (metadataLineCount >= 3 && bulletCount < 3);

  return {
    isLowContent,
    score,
    reasons: dedupeTextItems(reasons),
  } satisfies DetailQualityResult;
}

function buildTimeoutSignal(timeoutMs: number) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
}

async function fetchExternalJobPage(url: string, detailsUrl: string): Promise<string | null> {
  const candidate = cleanText(url);
  if (!candidate) return null;

  let parsedUrl: URL;
  let parsedDetailsUrl: URL;

  try {
    parsedUrl = new URL(candidate);
    parsedDetailsUrl = new URL(detailsUrl);
  } catch {
    return null;
  }

  if (!/^https?:$/i.test(parsedUrl.protocol)) {
    return null;
  }

  if (
    parsedUrl.hostname === parsedDetailsUrl.hostname &&
    parsedUrl.pathname === parsedDetailsUrl.pathname
  ) {
    return null;
  }

  if (
    /(^|\.)adzuna\.com$/i.test(parsedUrl.hostname) &&
    parsedUrl.pathname.startsWith("/details/")
  ) {
    return null;
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      cache: "no-store",
      redirect: "follow",
      signal: buildTimeoutSignal(8000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return null;
    }

    const html = await response.text();
    return html.length > 200 ? html : null;
  } catch {
    return null;
  }
}

function extractJobContentFromHtml(params: {
  html: string;
  jobPosting: JsonLdNode | null;
  context: SplitContext;
}): ExtractedJobContent {
  const descriptionHtmlCandidates = extractDescriptionHtmlCandidates(
    params.html,
    params.jobPosting
  );
  const descriptionCandidates = extractDescriptionCandidates(
    params.html,
    params.jobPosting,
    descriptionHtmlCandidates
  );
  const structuredCandidates = descriptionCandidates
    .map((candidate) => ({
      structured: splitAdzunaSections(candidate, params.context),
    }))
    .filter(
      ({ structured }) =>
        structured.description.length > 0 ||
        structured.descriptionIntro.length > 0 ||
        structured.responsibilities.length > 0 ||
        structured.qualifications.length > 0
    )
    .sort(
      (left, right) =>
        scoreStructuredContent(right.structured) - scoreStructuredContent(left.structured)
    );

  const structured =
    structuredCandidates[0]?.structured ?? {
      descriptionIntro: [],
      responsibilities: [],
      qualifications: [],
      description: "",
    };

  const structuredHtml = buildAdzunaStructuredHtml(structured);
  const cleanedDescriptionHtml = descriptionHtmlCandidates[0] || structuredHtml || "";
  const fallbackDescription =
    structured.description ||
    structured.descriptionIntro.join("\n\n") ||
    stripHtml(cleanedDescriptionHtml) ||
    descriptionCandidates[0] ||
    "";
  const cleanedDescriptionText = cleanJobText(
    fallbackDescription || descriptionCandidates[0] || "",
    { source: "adzuna" }
  );
  const formattedSource = cleanedDescriptionHtml || cleanedDescriptionText || "";
  const formatted = formatAdzunaDescription(formattedSource);
  const fallbackSections = buildFallbackSectionsFromStructured(structured);
  const resolvedSections = (() => {
    const mappedSections = mapFormattedSections(formatted);
    return mappedSections.length > 0 ? mappedSections : fallbackSections;
  })();
  const resolvedIntro =
    structured.descriptionIntro.length > 0
      ? dedupeTextItems(structured.descriptionIntro)
      : dedupeTextItems(formatted?.intro ?? []);
  const resolvedResponsibilities =
    structured.responsibilities.length > 0
      ? dedupeTextItems(structured.responsibilities)
      : findSectionValues(resolvedSections, /responsibilities|what you'll do|duties/i);
  const resolvedQualifications =
    structured.qualifications.length > 0
      ? dedupeTextItems(structured.qualifications)
      : findSectionValues(
          resolvedSections,
          /requirements|qualifications|what we're looking for|what you'll bring/i
        );
  const resolvedBenefits = findSectionValues(
    resolvedSections,
    /benefits|perks|what we offer|total rewards/i
  );
  const rawDescription =
    formatted?.rawDescription ||
    cleanedDescriptionText ||
    stripHtml(cleanedDescriptionHtml) ||
    "";

  return {
    descriptionText: cleanedDescriptionText,
    descriptionHtml: cleanedDescriptionHtml || null,
    responsibilities: resolvedResponsibilities,
    qualifications: resolvedQualifications,
    benefits: resolvedBenefits,
    sections: resolvedSections,
    intro: resolvedIntro,
    rawDescription,
    employmentType: cleanText(formatted?.employmentType ?? ""),
    schedule: cleanText(formatted?.schedule ?? ""),
    compensation: cleanText(formatted?.compensation ?? ""),
    quality: assessDetailQuality({
      descriptionText: cleanedDescriptionText,
      descriptionHtml: cleanedDescriptionHtml || null,
      intro: resolvedIntro,
      sections: resolvedSections,
      responsibilities: resolvedResponsibilities,
      qualifications: resolvedQualifications,
      benefits: resolvedBenefits,
      formatted,
    }),
  };
}

function extractExternalJobContent(
  html: string,
  context: SplitContext
): ExtractedJobContent {
  const externalJobPosting = extractJobPostingJsonLd(html);

  return extractJobContentFromHtml({
    html,
    jobPosting: externalJobPosting,
    context: {
      title:
        cleanText(asString(externalJobPosting?.title)) || context.title,
      company:
        readJobPostingCompany(externalJobPosting) || context.company,
      location:
        readJobPostingLocation(externalJobPosting) || context.location,
      salary: context.salary,
    },
  });
}

function mergeExtractedContent(base: ExtractedJobContent, enriched: ExtractedJobContent) {
  const preferEnriched =
    enriched.quality.score > base.quality.score + 120 ||
    (!enriched.quality.isLowContent && base.quality.isLowContent);
  const descriptionHtml = chooseBetterText(
    base.descriptionHtml,
    enriched.descriptionHtml,
    base.quality.score,
    enriched.quality.score
  );
  const descriptionText = chooseBetterText(
    base.descriptionText,
    enriched.descriptionText,
    base.quality.score,
    enriched.quality.score
  ) ?? "";
  const responsibilities = mergeTextLists(
    base.responsibilities,
    enriched.responsibilities,
    preferEnriched || base.responsibilities.length < 3
  );
  const qualifications = mergeTextLists(
    base.qualifications,
    enriched.qualifications,
    preferEnriched || base.qualifications.length < 3
  );
  const benefits = mergeTextLists(
    base.benefits,
    enriched.benefits,
    preferEnriched || base.benefits.length === 0
  );
  const intro = mergeTextLists(base.intro, enriched.intro, preferEnriched || base.intro.length === 0);
  const sections = mergeSectionsPreferRicher(base.sections, enriched.sections, preferEnriched);
  const merged: ExtractedJobContent = {
    descriptionText,
    descriptionHtml,
    responsibilities,
    qualifications,
    benefits,
    sections,
    intro,
    rawDescription:
      chooseBetterText(
        base.rawDescription,
        enriched.rawDescription,
        base.quality.score,
        enriched.quality.score
      ) ?? descriptionText,
    employmentType: chooseBetterText(
      base.employmentType,
      enriched.employmentType,
      base.quality.score,
      enriched.quality.score
    ) ?? base.employmentType,
    schedule: chooseBetterText(
      base.schedule,
      enriched.schedule,
      base.quality.score,
      enriched.quality.score
    ) ?? base.schedule,
    compensation: chooseBetterText(
      base.compensation,
      enriched.compensation,
      base.quality.score,
      enriched.quality.score
    ) ?? base.compensation,
    quality: base.quality,
  };

  merged.quality = assessDetailQuality({
    descriptionText: merged.descriptionText,
    descriptionHtml: merged.descriptionHtml,
    intro: merged.intro,
    sections: merged.sections,
    responsibilities: merged.responsibilities,
    qualifications: merged.qualifications,
    benefits: merged.benefits,
    formatted: formatAdzunaDescription(merged.descriptionHtml || merged.descriptionText),
  });

  return {
    merged,
    improved:
      merged.quality.score > base.quality.score + 80 ||
      merged.sections.length > base.sections.length ||
      merged.responsibilities.length > base.responsibilities.length ||
      merged.qualifications.length > base.qualifications.length ||
      stripHtml(merged.descriptionHtml ?? "").length >
        stripHtml(base.descriptionHtml ?? "").length * 1.1 ||
      merged.descriptionText.length > base.descriptionText.length * 1.1,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const detailsUrl = `https://www.adzuna.com/details/${encodeURIComponent(id)}`;

    const res = await fetch(detailsUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        {
          error: `Failed to fetch Adzuna details page (${res.status})`,
          snippet: text.slice(0, 200),
        },
        { status: 404 }
      );
    }

    const html = await res.text();
    const jobPosting = extractJobPostingJsonLd(html);

    const title =
      cleanText(asString(jobPosting?.title)) ||
      extractTitle(html) ||
      "Untitled role";
    const company = readJobPostingCompany(jobPosting) || "Unknown company";
    const location =
      readJobPostingLocation(jobPosting) ||
      extractLocationFromText(title) ||
      "Unknown location";
    const posted = readJobPostingDate(jobPosting);
    const postedLabel = formatPostedLabel(posted);
    const employmentType = readJobPostingEmploymentType(jobPosting);
    const category = readJobPostingCategory(jobPosting);
    const salaryInfo = readSalaryInfo(jobPosting?.baseSalary);
    const salaryIsEstimated = readSalaryIsEstimated(html, jobPosting);
    const salaryText = formatSalaryText(salaryInfo.text, salaryIsEstimated);
    const jobUrl = readJobPostingUrl(jobPosting, detailsUrl);

    const initialContent = extractJobContentFromHtml({
      html,
      jobPosting,
      context: {
        title,
        company,
        location,
        salary: salaryText,
      },
    });
    let finalContent = initialContent;
    let externalEnrichmentAttempted = false;
    let externalEnrichmentImproved = false;

    if (initialContent.quality.isLowContent) {
      const externalHtml = await fetchExternalJobPage(jobUrl, detailsUrl);
      externalEnrichmentAttempted = Boolean(externalHtml);

      if (externalHtml) {
        const enrichedContent = extractExternalJobContent(externalHtml, {
          title,
          company,
          location,
          salary: salaryText,
        });
        const mergedResult = mergeExtractedContent(initialContent, enrichedContent);
        finalContent = mergedResult.merged;
        externalEnrichmentImproved = mergedResult.improved;
      }

      console.info("[ADZUNA_DETAILS_ENRICHMENT]", {
        id,
        lowContentDetected: true,
        reasons: initialContent.quality.reasons.join(", "),
        initialScore: initialContent.quality.score,
        externalEnrichmentAttempted,
        externalEnrichmentImproved,
        finalScore: finalContent.quality.score,
      });
    }

    const resolvedSalaryText =
      salaryText ||
      formatSalaryText(finalContent.compensation || "", salaryIsEstimated);
    const resolvedEmploymentType =
      employmentType || finalContent.employmentType || "";
    const resolvedSchedule =
      finalContent.schedule || resolvedEmploymentType || "";
    const rawDescription =
      finalContent.rawDescription || finalContent.descriptionText || "";

    return NextResponse.json({
      id,
      source: "Adzuna",
      title,
      company,
      companyName: company,
      location,
      posted: posted || "",
      postedLabel: postedLabel || "",
      salary: resolvedSalaryText || null,
      salaryText: resolvedSalaryText || null,
      salaryMin: salaryInfo.min,
      salaryMax: salaryInfo.max,
      salaryIsEstimated,
      compensation: resolvedSalaryText || null,
      employmentType: resolvedEmploymentType || null,
      schedule: resolvedSchedule || null,
      category: category || null,
      descriptionIntro: finalContent.intro,
      responsibilities: finalContent.responsibilities,
      qualifications: finalContent.qualifications,
      benefits: finalContent.benefits,
      sections: finalContent.sections,
      description: finalContent.descriptionText,
      descriptionText: finalContent.descriptionText,
      content: rawDescription || null,
      contentHtml: finalContent.descriptionHtml || null,
      descriptionHtml: finalContent.descriptionHtml || null,
      summary: rawDescription || null,
      snippet: rawDescription || null,
      rawDescription: rawDescription || null,
      jobUrl,
      applyUrl: jobUrl,
      externalUrl: jobUrl,
      url: jobUrl,
      detailsUrl,
      metadata: {
        source: "Adzuna",
        postedLabel: postedLabel || null,
        salaryText: resolvedSalaryText || null,
        salaryIsEstimated,
        employmentType: resolvedEmploymentType || null,
        schedule: resolvedSchedule || null,
        category: category || null,
        detailQualityScore: finalContent.quality.score,
        detailQualityReasons: finalContent.quality.reasons.join(", ") || null,
        externalEnrichmentAttempted,
        externalEnrichmentImproved,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADZUNA_DETAILS] failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
