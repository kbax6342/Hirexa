import "server-only";

import { createHash } from "crypto";

import { NextResponse } from "next/server";
import OpenAI from "openai";

import {
  getMeaningfulJobTextChunks,
  isKnownJobJunkChunk,
  measurePrettyCoverage,
} from "@/app/lib/jobs/coverage";
import {
  cleanJobListItem,
  cleanJobText,
  isJunkJobLine,
} from "@/app/lib/jobs/clean-job-text";
import {
  filterHiddenMetadataValues,
  isHiddenMetadataPair,
  isHiddenMetadataSectionTitle,
  removeGloballyBannedJobLines,
  removeHiddenMetadataPairs,
} from "@/app/lib/jobs/formatJobText";
import { prettyFromDescription } from "@/app/lib/jobs/pretty-from-text";
import type { JobPretty, JobPrettySection, JobSource } from "@/app/lib/jobs/types";

export const runtime = "nodejs";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PRETTY_CACHE = new Map<string, JobPretty>();

const MODEL_NAME = process.env.OPENAI_MODEL?.trim() || "gpt-5-nano";
const MAX_INPUT_CHARS = 35_000;
const COVERAGE_THRESHOLD = 0.72;

const FORMAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    highlights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: "string" },
        },
        required: ["label", "value"],
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          kind: {
            type: "string",
            enum: ["paragraphs", "bullets", "callout", "smallprint"],
          },
          paragraphs: {
            type: "array",
            items: { type: "string" },
          },
          bullets: {
            type: "array",
            items: { type: "string" },
          },
          callout: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
            required: ["label", "value"],
          },
        },
        required: ["title", "kind", "paragraphs", "bullets", "callout"],
      },
    },
  },
  required: ["highlights", "sections"],
} as const;

const GENERIC_SECTION_TITLES = new Map<string, string>([
  ["additional details", "Important Notes"],
  ["additional info", "Important Notes"],
  ["miscellaneous", "Important Notes"],
  ["other details", "Important Notes"],
  ["other information", "Important Notes"],
  ["notes", "Important Notes"],
]);

const STOP_MARKERS = [
  /^apply for this job$/i,
  /^stats for this job$/i,
  /^receive similar jobs by email$/i,
  /^create alert$/i,
  /^popular searches$/i,
  /^back to last search$/i,
  /^back to search results$/i,
  /^by creating an alert/i,
  /^powered by homebase$/i,
  /^free employee scheduling$/i,
];

type RouteBody = {
  htmlOrText?: unknown;
  text?: unknown;
  source?: unknown;
  jobId?: unknown;
};

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSource(value: unknown): JobSource | null {
  const normalized = normalizeOptionalString(value);

  switch (normalized) {
    case "adzuna":
    case "greenhouse":
    case "lever":
    case "ashby":
    case "workable":
    case "usajobs":
    case "remotive":
    case "remoteok":
    case "workday":
    case "icims":
    case "jazzhr":
    case "other":
      return normalized;
    default:
      return null;
  }
}

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s$%/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeComparable(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function stripDangerousHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

function cap(value: string, maxChars = MAX_INPUT_CHARS) {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

function stripKnownJunk(text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0);

  const cleanedBlocks: string[] = [];

  for (const lines of blocks) {
    const keptLines: string[] = [];
    let shouldStop = false;

    for (const line of lines) {
      if (STOP_MARKERS.some((pattern) => pattern.test(line))) {
        shouldStop = true;
        break;
      }

      if (isKnownJobJunkChunk(line)) {
        continue;
      }

      keptLines.push(line);
    }

    if (keptLines.length > 0) {
      cleanedBlocks.push(keptLines.join("\n"));
    }

    if (shouldStop) {
      break;
    }
  }

  return cleanedBlocks.join("\n\n").trim();
}

function sanitizeFormatterInput(raw: string, source: JobSource | null) {
  const cleaned = cleanJobText(cap(stripDangerousHtml(raw)), { source });
  return stripKnownJunk(
    removeHiddenMetadataPairs(removeGloballyBannedJobLines(cleaned))
  );
}

function normalizeSectionTitle(title: string) {
  const normalized = normalizeComparable(title);
  return GENERIC_SECTION_TITLES.get(normalized) ?? title.trim();
}

function normalizeParagraphs(values: unknown[]) {
  return dedupeStrings(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) =>
        value
          .split(/\n+/)
          .map((line) => line.trim())
          .filter((line) => !isJunkJobLine(line))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean)
  );
}

function normalizeBullets(values: unknown[]) {
  return dedupeStrings(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => cleanJobListItem(value))
      .filter(Boolean)
  );
}

function sectionHasContent(section: JobPrettySection) {
  if (section.kind === "bullets") {
    return Array.isArray(section.bullets) && section.bullets.length > 0;
  }

  if (section.kind === "callout") {
    return Boolean(section.callout?.value?.trim());
  }

  return Array.isArray(section.paragraphs) && section.paragraphs.length > 0;
}

function normalizePrettyOutput(input: unknown): JobPretty {
  const raw =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  const seenHighlights = new Set<string>();
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights
        .map((highlight) => {
          const item =
            highlight && typeof highlight === "object"
              ? (highlight as Record<string, unknown>)
              : null;

          const label = normalizeOptionalString(item?.label);
          const value = normalizeOptionalString(item?.value);
          if (!label || !value) return null;
          if (isHiddenMetadataPair(label, value)) return null;

          const key = `${normalizeComparable(label)}:${normalizeComparable(value)}`;
          if (seenHighlights.has(key)) return null;
          seenHighlights.add(key);
          return { label, value };
        })
        .filter(
          (
            highlight
          ): highlight is JobPretty["highlights"][number] => highlight !== null
        )
    : [];

  const seenSections = new Set<string>();
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map<JobPretty["sections"][number] | null>((section) => {
          const item =
            section && typeof section === "object"
              ? (section as Record<string, unknown>)
              : null;

          const title = normalizeOptionalString(item?.title);
          const kind = normalizeOptionalString(item?.kind);
          if (!title || !kind) return null;

          const normalizedTitle = normalizeSectionTitle(title);
          const paragraphs = Array.isArray(item?.paragraphs)
            ? filterHiddenMetadataValues(
                normalizedTitle,
                normalizeParagraphs(item.paragraphs)
              )
            : [];
          const bullets = Array.isArray(item?.bullets)
            ? filterHiddenMetadataValues(
                normalizedTitle,
                normalizeBullets(item.bullets)
              )
            : [];
          const calloutLabel = normalizeOptionalString(
            item?.callout && typeof item.callout === "object"
              ? (item.callout as Record<string, unknown>).label
              : null
          );
          const calloutValue = normalizeOptionalString(
            item?.callout && typeof item.callout === "object"
              ? (item.callout as Record<string, unknown>).value
              : null
          );
          const visibleCalloutValue =
            calloutValue &&
            !isHiddenMetadataPair(normalizedTitle, calloutValue) &&
            !(isHiddenMetadataSectionTitle(normalizedTitle) && !filterHiddenMetadataValues(normalizedTitle, [calloutValue]).length)
              ? calloutValue
              : null;

          let normalizedSection: JobPretty["sections"][number] | null = null;

          if (kind === "bullets") {
            normalizedSection =
              bullets.length > 0
                ? { title: normalizedTitle, kind: "bullets", bullets }
                : null;
          } else if (kind === "callout") {
            normalizedSection = visibleCalloutValue
              ? {
                  title: normalizedTitle,
                  kind: "callout",
                  callout: calloutLabel
                    ? { label: calloutLabel, value: visibleCalloutValue }
                    : { value: visibleCalloutValue },
                }
              : null;
          } else if (kind === "smallprint") {
            normalizedSection =
              paragraphs.length > 0
                ? { title: normalizedTitle, kind: "smallprint", paragraphs }
                : null;
          } else {
            normalizedSection =
              paragraphs.length > 0
                ? { title: normalizedTitle, kind: "paragraphs", paragraphs }
                : null;
          }

          if (!normalizedSection || !sectionHasContent(normalizedSection)) {
            return null;
          }

          const key = `${normalizeComparable(normalizedSection.title)}:${JSON.stringify(
            normalizedSection
          )}`;

          if (seenSections.has(key)) {
            return null;
          }

          seenSections.add(key);
          return normalizedSection;
        })
        .filter(
          (
            section
          ): section is JobPretty["sections"][number] => section !== null
        )
    : [];

  return { highlights, sections };
}

function ensurePresentablePretty(pretty: JobPretty, cleanedText: string): JobPretty {
  if (pretty.highlights.length > 0 || pretty.sections.length > 0) {
    return pretty;
  }

  const fallbackParagraphs = cleanedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 12)
    .filter((paragraph) => !isKnownJobJunkChunk(paragraph))
    .slice(0, 8);

  if (fallbackParagraphs.length === 0) {
    return pretty;
  }

  return {
    highlights: [],
    sections: [
      {
        title: "Position Overview",
        kind: "paragraphs",
        paragraphs: dedupeStrings(fallbackParagraphs),
      },
    ],
  };
}

function getResponseText(resp: unknown): string {
  const response = resp as
    | {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
      }
    | undefined;

  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function buildCacheKey(jobId: string | null, source: JobSource | null, cleanedText: string) {
  const hash = createHash("sha256").update(cleanedText).digest("hex").slice(0, 20);
  return `${source ?? "unknown"}:${jobId ?? "text"}:${hash}`;
}

async function requestPrettyFromModel(params: {
  cleanedText: string;
  source: JobSource | null;
  retryInstruction?: string;
}) {
  const systemPrompt = `
Return ONLY valid JSON that matches the schema.

Rules:
- Keep content faithful to the source text.
- Do not hallucinate, add employer claims, or invent missing facts.
- Remove duplicated lines, repeated bullets, separator lines, stray bullet prefixes, and scraped boilerplate or footer junk.
- Every meaningful statement from the source must be assigned to the best fitting visible section.
- Do not leave any meaningful content outside sections.
- Do not create a generic catch-all section such as "Additional Details".
- Do not output separator lines such as ----- or orphan headings such as REQUIRED by themselves.
- Convert short action lines, requirements, and checklist items into clean bullet items when appropriate.
- Prefer clear section titles when supported by the text, such as:
  Position Overview, Responsibilities, Qualifications, Service / Guest Experience Standards, Training / Team Support, Compliance / Safety, Benefits, Schedule, Compensation, How to Apply, Company / Brand Overview, Reports To, Work Environment, Important Notes.
- Use bullets for task lists, requirements, benefits, and short factual items.
- Use paragraphs for company background, role overview, and descriptive context.
- Use callout only for compact metadata that is better as a single value.
- Keep real application instructions, reporting lines, shifts, compensation, benefits, and direct email/apply directions when present.
${params.retryInstruction ?? ""}
  `.trim();

  const userPrompt = [`Source: ${params.source ?? "unknown"}`, `Job text:\n${params.cleanedText}`]
    .filter(Boolean)
    .join("\n\n");

  const response = await openai.responses.create({
    model: MODEL_NAME,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "JobPretty",
        schema: FORMAT_SCHEMA,
        strict: true,
      },
    },
    store: false,
  });

  const jsonText = getResponseText(response);
  if (!jsonText) {
    throw new Error("Pretty formatter returned empty output");
  }

  return normalizePrettyOutput(JSON.parse(jsonText));
}

function shouldRetryCoverage(coverageRatio: number, sourceChunkCount: number) {
  return sourceChunkCount >= 4 && coverageRatio < COVERAGE_THRESHOLD;
}

function chooseBetterPretty(
  cleanedText: string,
  firstPretty: JobPretty,
  secondPretty: JobPretty
) {
  const firstCoverage = measurePrettyCoverage(cleanedText, firstPretty);
  const secondCoverage = measurePrettyCoverage(cleanedText, secondPretty);

  if (secondCoverage.ratio > firstCoverage.ratio) {
    return { pretty: secondPretty, coverage: secondCoverage };
  }

  return { pretty: firstPretty, coverage: firstCoverage };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as RouteBody | null;
  const rawInput = String(body?.htmlOrText ?? body?.text ?? "");
  const source = normalizeSource(body?.source);
  const jobId = normalizeOptionalString(body?.jobId);

  if (!rawInput.trim()) {
    return NextResponse.json({ highlights: [], sections: [] } satisfies JobPretty);
  }

  const cleanedText = sanitizeFormatterInput(rawInput, source);
  const localFallback = ensurePresentablePretty(
    prettyFromDescription(cleanedText, { source }),
    cleanedText
  );

  if (!cleanedText) {
    return NextResponse.json(localFallback, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const cacheKey = buildCacheKey(jobId, source, cleanedText);
  const cached = PRETTY_CACHE.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    PRETTY_CACHE.set(cacheKey, localFallback);
    return NextResponse.json(localFallback, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    let bestPretty = ensurePresentablePretty(
      await requestPrettyFromModel({ cleanedText, source }),
      cleanedText
    );
    let bestCoverage = measurePrettyCoverage(cleanedText, bestPretty);

    if (shouldRetryCoverage(bestCoverage.ratio, bestCoverage.sourceChunks.length)) {
      const retryPretty = ensurePresentablePretty(
        await requestPrettyFromModel({
          cleanedText,
          source,
          retryInstruction:
            "Retry requirement: do not omit any meaningful statement from the source. Reassign missing facts into the most fitting visible section instead of dropping them.",
        }),
        cleanedText
      );

      const better = chooseBetterPretty(cleanedText, bestPretty, retryPretty);
      bestPretty = better.pretty;
      bestCoverage = better.coverage;
    }

    const finalPretty =
      bestCoverage.ratio >= COVERAGE_THRESHOLD || getMeaningfulJobTextChunks(cleanedText).length < 4
        ? bestPretty
        : localFallback;

    PRETTY_CACHE.set(cacheKey, finalPretty);

    return NextResponse.json(finalPretty, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.warn("[jobs/pretty] falling back to local parser", {
      source,
      jobId,
      model: MODEL_NAME,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    PRETTY_CACHE.set(cacheKey, localFallback);

    return NextResponse.json(localFallback, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
