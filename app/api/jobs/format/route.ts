import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  careerLevel?: CareerLevel | null;
  schedule?: string | null;
  jobId?: string | null;
};

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

function sanitizeFormattedJob(value: unknown): FormattedJob {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const intro = Array.isArray(raw.intro)
    ? raw.intro
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;

  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map<Section | null>((section) => {
          const rawSection =
            section && typeof section === "object"
              ? (section as Record<string, unknown>)
              : null;

          if (!rawSection || typeof rawSection.title !== "string") {
            return null;
          }

          const paragraphs = Array.isArray(rawSection.paragraphs)
            ? rawSection.paragraphs
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter(Boolean)
            : undefined;

          const bullets = Array.isArray(rawSection.bullets)
            ? rawSection.bullets
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter(Boolean)
            : undefined;

          return {
            title: rawSection.title.trim(),
            ...(paragraphs?.length ? { paragraphs } : {}),
            ...(bullets?.length ? { bullets } : {}),
          };
        })
        .filter((section): section is Section => section !== null)
    : [];

  return {
    intro: intro?.length ? intro : undefined,
    sections,
    salary: normalizeOptionalString(raw.salary),
    careerLevel: normalizeCareerLevel(raw.careerLevel),
    schedule: normalizeOptionalString(raw.schedule),
    jobId: normalizeOptionalString(raw.jobId),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = String(body?.text ?? "");
    const jobId = body?.jobId ? String(body.jobId) : null;

    if (!raw.trim()) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const prompt = `
You will receive a job description that may contain HTML or plain text.

Task:
Convert it into clean structured JSON for a job UI.

Rules:
- Output MUST be valid JSON only (no markdown).
- Keep content faithful (no hallucinations).
- Remove legal/privacy boilerplate into a final section titled "Legal & Privacy" (optional).
- Create clear section titles like:
  "What you'll be doing", "What we look for", "Nice to haves", "Pay & Benefits", etc.
- Extract salary only when compensation is actually present in the posting (return as salary string or null).
- Infer career level from years of experience, scope, ownership, or seniority language.
- Career level MUST be one of "Entry", "Experienced", "Senior", or null.
- Infer schedule from the posting text.
- If schedule is implied but not explicit, prefer "Likely full-time / standard business hours".
- If schedule cannot be reasonably inferred, return null.
- Keep bullets as short bullet strings.

Return JSON in this schema:
{
  "intro": ["paragraph", ...],
  "sections": [
    { "title": "Title", "paragraphs": ["..."], "bullets": ["..."] }
  ],
  "salary": "string or null",
  "careerLevel": "Entry | Experienced | Senior | null",
  "schedule": "string or null"
}

Input:
${raw}
    `.trim();

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const content = resp.choices[0]?.message?.content ?? "{}";
    const parsed = sanitizeFormattedJob(JSON.parse(content));

    return NextResponse.json({ jobId, formatted: parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
