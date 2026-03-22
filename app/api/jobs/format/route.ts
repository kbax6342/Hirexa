import { createHash } from "crypto";

import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const FORMAT_CACHE = new Map<string, FormattedJob>();

type CareerLevel = "Entry" | "Experienced" | "Senior";

type Section = {
  title: string;
  bullets?: string[];
  paragraphs?: string[];
};

type FormattedJob = {
  intro?: string[];
  sections: Section[];
  salary?: string | null;
  compensation?: string | null;
  careerLevel?: CareerLevel | null;
  schedule?: string | null;
  employmentType?: string | null;
  jobId?: string | null;
};

type FormatHints = {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  salary?: string | null;
  compensation?: string | null;
  employmentType?: string | null;
  schedule?: string | null;
  intro?: string[];
  sections?: Array<{
    title?: string | null;
    paragraphs?: string[];
    bullets?: string[];
  }>;
};

const FORMAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intro: {
      type: "array",
      items: { type: "string" },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          paragraphs: {
            type: "array",
            items: { type: "string" },
          },
          bullets: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["title", "paragraphs", "bullets"],
      },
    },
    salary: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    compensation: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    careerLevel: {
      anyOf: [
        { type: "string", enum: ["Entry", "Experienced", "Senior"] },
        { type: "null" },
      ],
    },
    schedule: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    employmentType: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
  required: [
    "intro",
    "sections",
    "salary",
    "compensation",
    "careerLevel",
    "schedule",
    "employmentType",
  ],
} as const;

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCareerLevel(value: unknown): CareerLevel | null {
  if (value === "Entry" || value === "Experienced" || value === "Senior") {
    return value;
  }

  return null;
}

function normalizeArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function sanitizeHints(value: unknown): FormatHints | null {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;

  if (!raw) return null;

  const intro = dedupeStrings(normalizeArray(raw.intro));
  const sections: NonNullable<FormatHints["sections"]> = Array.isArray(raw.sections)
    ? raw.sections
        .map<NonNullable<FormatHints["sections"]>[number] | null>((section) => {
          const sectionRecord =
            section && typeof section === "object"
              ? (section as Record<string, unknown>)
              : null;

          if (!sectionRecord) return null;

          const title = normalizeOptionalString(sectionRecord.title);
          if (!title) return null;

          const paragraphs = dedupeStrings(normalizeArray(sectionRecord.paragraphs));
          const bullets = dedupeStrings(normalizeArray(sectionRecord.bullets));

          return {
            title,
            ...(paragraphs.length ? { paragraphs } : {}),
            ...(bullets.length ? { bullets } : {}),
          };
        })
        .filter(
          (
            section
          ): section is NonNullable<FormatHints["sections"]>[number] => section !== null
        )
    : [];

  return {
    title: normalizeOptionalString(raw.title),
    company: normalizeOptionalString(raw.company),
    location: normalizeOptionalString(raw.location),
    salary: normalizeOptionalString(raw.salary),
    compensation: normalizeOptionalString(raw.compensation),
    employmentType: normalizeOptionalString(raw.employmentType),
    schedule: normalizeOptionalString(raw.schedule),
    ...(intro.length ? { intro } : {}),
    ...(sections.length ? { sections } : {}),
  };
}

function sanitizeFormattedJob(value: unknown): FormattedJob {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const intro = dedupeStrings(normalizeArray(raw.intro));
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map<Section | null>((section) => {
          const rawSection =
            section && typeof section === "object"
              ? (section as Record<string, unknown>)
              : null;

          if (!rawSection) return null;

          const title = normalizeOptionalString(rawSection.title);
          if (!title) {
            return null;
          }

          const paragraphs = dedupeStrings(normalizeArray(rawSection.paragraphs));
          const bullets = dedupeStrings(normalizeArray(rawSection.bullets));

          if (paragraphs.length === 0 && bullets.length === 0) {
            return null;
          }

          return {
            title,
            ...(paragraphs.length ? { paragraphs } : {}),
            ...(bullets.length ? { bullets } : {}),
          };
        })
        .filter((section): section is Section => section !== null)
    : [];

  const salary = normalizeOptionalString(raw.salary);
  const compensation = normalizeOptionalString(raw.compensation) ?? salary;

  return {
    intro: intro.length ? intro : undefined,
    sections,
    salary,
    compensation,
    careerLevel: normalizeCareerLevel(raw.careerLevel),
    schedule: normalizeOptionalString(raw.schedule),
    employmentType: normalizeOptionalString(raw.employmentType),
    jobId: normalizeOptionalString(raw.jobId),
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

function buildCacheKey(jobId: string | null, raw: string, hints: FormatHints | null) {
  const hash = createHash("sha256")
    .update(raw)
    .update(JSON.stringify(hints ?? {}))
    .digest("hex")
    .slice(0, 16);

  return jobId ? `job:${jobId}:${hash}` : `text:${hash}`;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const raw = String(body?.text ?? "").trim();
    const jobId = body?.jobId ? String(body.jobId) : null;
    const source = normalizeOptionalString(body?.source) ?? "unknown";
    const hints = sanitizeHints(body?.hints);

    if (!raw) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const cacheKey = buildCacheKey(jobId, raw, hints);
    const cached = FORMAT_CACHE.get(cacheKey);
    if (cached) {
      return NextResponse.json({ jobId, formatted: cached });
    }

    const system = `
Return ONLY valid JSON that matches the schema.

Rules:
- Organize the provided job posting into readable UI-ready JSON.
- Do not hallucinate or invent facts.
- Use only details supported by the source text.
- Preserve employer wording as much as possible while making it readable.
- If the posting lacks headings, you may organize content into supported sections such as "Position Overview", "About the Team", "Responsibilities", "Requirements", and "Benefits".
- Do not add a section unless the text supports it.
- Deduplicate repeated bullets or repeated paragraphs.
- Keep intro paragraphs concise.
- Keep bullets concise.
- Extract salary only when actual compensation is present.
- Infer career level from the text only when reasonably supported.
- Infer schedule from the text only when reasonably supported.
- If employment type is clear from the text, return it.
    `.trim();

    const userPrompt = [
      `Source: ${source}`,
      hints ? `Existing local parse hints:\n${JSON.stringify(hints, null, 2)}` : null,
      `Job text:\n${raw}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const resp = await openai.responses.create({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "FormattedJob",
          schema: FORMAT_SCHEMA,
          strict: true,
        },
      },
      store: false,
    });

    const jsonText = getResponseText(resp);
    if (!jsonText) {
      return NextResponse.json(
        { error: "Formatter returned empty output" },
        { status: 500 }
      );
    }

    const parsed = sanitizeFormattedJob(JSON.parse(jsonText));
    FORMAT_CACHE.set(cacheKey, parsed);

    return NextResponse.json(
      { jobId, formatted: parsed },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
