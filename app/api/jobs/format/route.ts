import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Section = {
  title: string;
  bullets?: string[];
  paragraphs?: string[];
};

type FormattedJob = {
  intro?: string[];
  sections: Section[];
  salary?: string | null;
  jobId?: string | null;
};

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
- Extract salary range if present (return as salary string).
- Keep bullets as short bullet strings.

Return JSON in this schema:
{
  "intro": ["paragraph", ...],
  "sections": [
    { "title": "Title", "paragraphs": ["..."], "bullets": ["..."] }
  ],
  "salary": "string or null"
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
    const parsed = JSON.parse(content) as FormattedJob;

    return NextResponse.json({ jobId, formatted: parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}