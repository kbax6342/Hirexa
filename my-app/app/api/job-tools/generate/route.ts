import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Tone = "professional" | "friendly" | "bold";

type GeneratePayload = {
  url: string;
  resumeText: string | null;
  tone: Tone;
  focusAreas: string[];
  instructions: string | null;
  pastedJobText: string | null;
  resumeFile: File | null;
};

function cleanText(s: string) {
  return s
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractJsonLdText($: cheerio.CheerioAPI) {
  const chunks: string[] = [];

  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const title = item?.title || item?.jobTitle || "";
        const description = item?.description || "";
        const company = item?.hiringOrganization?.name || "";
        const location = item?.jobLocation?.address?.addressLocality || item?.jobLocation?.name || "";
        const qualifications = item?.qualifications || "";
        const responsibilities = item?.responsibilities || "";
        const experience = item?.experienceRequirements || "";

        const text = cleanText(
          [title, company, location, description, qualifications, responsibilities, experience]
            .filter(Boolean)
            .join("\n")
        );

        if (text) chunks.push(text);
      }
    } catch {
      // ignore malformed blocks
    }
  });

  return cleanText(chunks.join("\n\n"));
}

function extractReadableText(html: string) {
  const $ = cheerio.load(html);

  $("script:not([type='application/ld+json']), style, noscript, svg, iframe").remove();
  $("nav, footer, header, aside, form").remove();

  const semanticCandidates = [
    "main",
    "article",
    "[role='main']",
    ".job-description",
    ".jobDescription",
    ".description",
    ".posting",
    ".content",
    "#content",
    "body",
  ];

  const attributeCandidates = $(
    "[class*='job'], [class*='description'], [class*='posting'], [class*='requirement'], [id*='job'], [id*='description'], [id*='posting'], [id*='requirement']"
  )
    .map((_, el) => cleanText($(el).text() || ""))
    .get()
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
    .join("\n\n");

  let bestText = "";
  for (const sel of semanticCandidates) {
    const t = cleanText($(sel).text() || "");
    if (t.length > bestText.length) bestText = t;
  }

  const jsonLdText = extractJsonLdText($);
  const metaDescription = cleanText(
    $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || ""
  );

  const merged = cleanText([jsonLdText, metaDescription, attributeCandidates, bestText].filter(Boolean).join("\n\n"));
  const fallback = cleanText($.text());

  let finalText = merged.length >= 250 ? merged : fallback;

  const MAX_CHARS = 12000;
  if (finalText.length > MAX_CHARS) finalText = `${finalText.slice(0, MAX_CHARS)}\n…[truncated]`;
  return finalText;
}

async function extractResumeTextFromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (type.includes("pdf") || name.endsWith(".pdf")) {
    const parsed = await pdfParse(buffer);
    return cleanText(parsed.text || "");
  }

  if (
    type.includes("officedocument.wordprocessingml.document") ||
    name.endsWith(".docx") ||
    type.includes("msword") ||
    name.endsWith(".doc")
  ) {
    const parsed = await mammoth.extractRawText({ buffer });
    return cleanText(parsed.value || "");
  }

  if (type.startsWith("text/") || name.endsWith(".txt")) {
    return cleanText(buffer.toString("utf-8"));
  }

  return "";
}

async function readPayload(req: Request): Promise<GeneratePayload> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const toneValue = String(form.get("tone") ?? "professional") as Tone;
    const focusRaw = String(form.get("focusAreas") ?? "[]");
    let focusAreas: string[] = [];

    try {
      const parsed = JSON.parse(focusRaw);
      if (Array.isArray(parsed)) focusAreas = parsed.map(String);
    } catch {
      focusAreas = [];
    }

    const resumeFile = form.get("resumeFile");

    return {
      url: String(form.get("url") ?? "").trim(),
      resumeText: form.get("resumeText") ? String(form.get("resumeText")) : null,
      tone: toneValue,
      focusAreas,
      instructions: form.get("instructions") ? String(form.get("instructions")) : null,
      pastedJobText: form.get("pastedJobText") ? String(form.get("pastedJobText")) : null,
      resumeFile: resumeFile instanceof File ? resumeFile : null,
    };
  }

  const body = await req.json();
  return {
    url: String(body?.url ?? "").trim(),
    resumeText: body?.resumeText ? String(body.resumeText) : null,
    tone: (String(body?.tone ?? "professional") as Tone) ?? "professional",
    focusAreas: Array.isArray(body?.focusAreas) ? body.focusAreas.map(String) : [],
    instructions: body?.instructions ? String(body.instructions) : null,
    pastedJobText: body?.pastedJobText ? String(body.pastedJobText) : null,
    resumeFile: null,
  };
}

export async function POST(req: Request) {
  try {
    const payload = await readPayload(req);
    const tone = payload.tone ?? "professional";

    let resumeText = payload.resumeText;
    if (!resumeText && payload.resumeFile) {
      resumeText = await extractResumeTextFromFile(payload.resumeFile);
    }

    let jobText = cleanText(payload.pastedJobText ?? "");

    if (!jobText) {
      if (!payload.url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

      let u: URL;
      try {
        u = new URL(payload.url);
      } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }

      const res = await fetch(u.toString(), {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `Could not read that page (HTTP ${res.status}). Some sites block automated access.` },
          { status: 400 }
        );
      }

      const html = await res.text();
      jobText = extractReadableText(html);
    }

    if (!jobText || jobText.length < 150) {
      return NextResponse.json(
        { error: "Could not extract enough text from that page. Paste the job description in the fallback field and try again." },
        { status: 400 }
      );
    }

    const selectedFocus = payload.focusAreas.length ? payload.focusAreas.join(", ") : "none provided";

    const system = `
You are an expert career coach + recruiter. Produce concise, high-quality, ATS-friendly writing.
Return ONLY valid JSON matching the schema I give you. No markdown.
Tone: ${tone}.
`.trim();

    const schema = {
      job: {
        title: "string?",
        company: "string?",
        location: "string?",
        summary: "string?",
        keyRequirements: ["string"],
      },
      coverLetter: "string",
      resumeUpdates: {
        summaryRewrite: "string?",
        skillsToAdd: ["string"],
        bulletEdits: [{ section: "string", before: "string", after: "string" }],
        atsKeywords: ["string"],
      },
      emails: {
        beforeInterview: "string",
        afterInterview: "string",
      },
    };

    const userPrompt = `
JOB POSTING TEXT:
${jobText}

CANDIDATE RESUME:
${resumeText ?? "[not provided]"}

FOCUS AREAS: ${selectedFocus}
EXTRA INSTRUCTIONS: ${payload.instructions ?? "none"}

TASK:
1) Infer job title/company/location if possible.
2) Generate a tailored cover letter (1 page max).
3) Propose resume updates:
   - optional new summary
   - skills to add
   - 4-8 bullet edits: if resume is provided, rewrite based on that resume; if not provided, create realistic placeholders.
   - ATS keyword list
4) Write two emails that reference the revised resume points where relevant:
   - before interview: confirming interest + asking 1-2 smart questions
   - after interview: thank-you email
Return JSON ONLY matching this schema shape:
${JSON.stringify(schema, null, 2)}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: "Model did not return valid JSON. Try again, or add a server-side JSON repair step.",
          raw,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
