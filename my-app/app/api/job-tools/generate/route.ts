import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import mammoth from "mammoth";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Tone = "professional" | "friendly" | "bold";

type RequestPayload = {
  url: string;
  resumeText: string | null;
  tone: Tone;
};

function cleanText(s: string) {
  return s
    .replace(/\r/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pickTone(value: unknown): Tone {
  const v = String(value ?? "professional").toLowerCase();
  if (v === "friendly" || v === "bold") return v;
  return "professional";
}

function parseJsonLdJobText($: cheerio.CheerioAPI) {
  const chunks: string[] = [];

  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;

        const asAny = item as Record<string, unknown>;
        const typeValue = String(asAny["@type"] ?? "").toLowerCase();
        if (!typeValue.includes("jobposting")) continue;

        const fields = [
          asAny.title,
          asAny.description,
          asAny.qualifications,
          asAny.responsibilities,
          asAny.skills,
          asAny.employmentType,
          asAny.industry,
          typeof asAny.hiringOrganization === "object"
            ? (asAny.hiringOrganization as Record<string, unknown>).name
            : null,
          typeof asAny.jobLocation === "object"
            ? JSON.stringify(asAny.jobLocation)
            : null,
        ];

        const text = cleanText(fields.filter(Boolean).map((x) => String(x)).join("\n\n"));
        if (text) chunks.push(text);
      }
    } catch {
      // ignore bad json-ld blocks
    }
  });

  return chunks.join("\n\n").trim();
}

function extractReadableText(html: string) {
  const $ = cheerio.load(html);
  const jsonLdText = parseJsonLdJobText($);

  $("script, style, noscript, svg, iframe").remove();
  $("nav, footer, aside").remove();

  const candidates = [
    "main",
    "article",
    "[role='main']",
    "[class*='job']",
    "[id*='job']",
    "[class*='description']",
    "[id*='description']",
    "[class*='posting']",
    "[id*='posting']",
    ".content",
    "#content",
    "body",
  ];

  let bestText = "";
  for (const sel of candidates) {
    const t = cleanText($(sel).text() || "");
    if (t.length > bestText.length) bestText = t;
  }

  const metaDescription = cleanText(
    $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || ""
  );

  const combined = cleanText([jsonLdText, bestText, metaDescription].filter(Boolean).join("\n\n"));
  const MAX_CHARS = 12000;
  if (combined.length > MAX_CHARS) return `${combined.slice(0, MAX_CHARS)}\n…[truncated]`;
  return combined;
}

async function fetchJobPageText(url: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.google.com/",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Could not read that page (HTTP ${res.status}). Some sites block automated access.`);
  }

  const html = await res.text();
  return extractReadableText(html);
}

async function fetchReadableMirrorText(url: string) {
  const mirrorUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
  const res = await fetch(mirrorUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/plain,text/html;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!res.ok) return "";

  const text = cleanText(await res.text());
  const body = text.replace(/^Title:.*?\n\n/s, "").trim();
  if (body.length > 12000) return `${body.slice(0, 12000)}\n…[truncated]`;
  return body;
}


async function extractResumeTextFromFile(file: File) {
  const fileName = file.name.toLowerCase();
  const contentType = (file.type || "").toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (contentType.includes("pdf") || fileName.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
    });
    const pdf = await loadingTask.promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it: { str?: unknown }) => (typeof it.str === "string" ? it.str : ""))
        .join(" ");
      fullText += `${pageText}
`;
    }

    return cleanText(fullText);
  }

  if (
    contentType.includes("wordprocessingml") ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc")
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return cleanText(value);
  }

  return cleanText(buffer.toString("utf-8"));
}

async function parseRequestPayload(req: Request): Promise<RequestPayload> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const url = String(form.get("url") ?? "").trim();
    const tone = pickTone(form.get("tone"));
    const resumeTextField = String(form.get("resumeText") ?? "").trim();

    let parsedResumeText = resumeTextField;
    const resumeFile = form.get("resumeFile");
    if (resumeFile instanceof File && resumeFile.size > 0) {
      parsedResumeText = await extractResumeTextFromFile(resumeFile);
    }

    return {
      url,
      tone,
      resumeText: parsedResumeText || null,
    };
  }

  const body = await req.json();
  return {
    url: String(body?.url ?? "").trim(),
    tone: pickTone(body?.tone),
    resumeText: body?.resumeText ? String(body.resumeText) : null,
  };
}

export async function POST(req: Request) {
  try {
    const { url, resumeText, tone } = await parseRequestPayload(req);

    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    let jobText = "";
    try {
      jobText = await fetchJobPageText(url);
    } catch (e: unknown) {
      const mirrorText = await fetchReadableMirrorText(url);
      if (!mirrorText || mirrorText.length < 200) {
        const message = e instanceof Error ? e.message : "Could not read that page.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      jobText = mirrorText;
    }

    if (!jobText || jobText.length < 200) {
      const mirrorText = await fetchReadableMirrorText(url);
      if (!mirrorText || mirrorText.length < 200) {
        return NextResponse.json(
          { error: "Could not extract enough text from that page. Try a different link or add a paste-text fallback." },
          { status: 400 }
        );
      }
      jobText = mirrorText;
    }

    const system = `
You are an expert career coach + recruiter. Produce concise, high-quality, ATS-friendly writing.
Return ONLY valid JSON matching the schema I give you. No markdown.
Tone: ${tone}.
If candidate resume text is provided, tailor the revised resume and both emails to that exact experience.
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
      revisedResume: "string",
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
JOB POSTING TEXT (extracted from URL):
${jobText}

CANDIDATE RESUME (if provided):
${resumeText ?? "[not provided]"}

TASK:
1) Infer job title/company/location if possible.
2) Generate a tailored cover letter (1 page max).
3) Generate a full revised resume text. If no resume is provided, produce a realistic best-effort resume draft based on likely candidate profile and explicitly include placeholders.
4) Propose resume updates:
   - optional new summary
   - skills to add
   - 4-8 bullet edits: show "before" (make a reasonable guess if resume not provided) and "after" (targeted to role)
   - ATS keyword list
5) Write two emails that align with the revised resume:
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
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: "Model did not return valid JSON. Try again, or I can add a server-side JSON-repair step.",
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
