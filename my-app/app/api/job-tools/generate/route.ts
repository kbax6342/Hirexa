import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

// If you're using OpenAI SDK already in your project, plug it in here.
// Otherwise, keep this as a placeholder and I’ll match whatever OpenAI route you already use.
import OpenAI from "openai";

export const runtime = "nodejs"; // important: cheerio + fetch parsing on node

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cleanText(s: string) {
  return s
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractReadableText(html: string) {
  const $ = cheerio.load(html);

  // remove noisy elements
  $("script, style, noscript, svg, iframe").remove();

  // remove likely nav/footer/sidebar
  $("nav, footer, header, aside").remove();

  // Prefer semantic containers if present
  const candidates = [
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

  let bestText = "";
  for (const sel of candidates) {
    const t = cleanText($(sel).text() || "");
    if (t.length > bestText.length) bestText = t;
  }

  // last resort: whole document text
  if (bestText.length < 400) {
    bestText = cleanText($.text());
  }

  // Hard cap to keep prompts sane
  const MAX_CHARS = 12000;
  if (bestText.length > MAX_CHARS) bestText = bestText.slice(0, MAX_CHARS) + "\n…[truncated]";
  return bestText;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = String(body?.url ?? "").trim();
    const resumeText: string | null = body?.resumeText ? String(body.resumeText) : null;
    const tone = (String(body?.tone ?? "professional") as "professional" | "friendly" | "bold") ?? "professional";

    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // fetch the job page
    const res = await fetch(u.toString(), {
      method: "GET",
      headers: {
        // Some sites block default fetch user agents
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      // Avoid caching stale postings
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not read that page (HTTP ${res.status}). Some sites block automated access.` },
        { status: 400 }
      );
    }

    const html = await res.text();
    const jobText = extractReadableText(html);

    if (!jobText || jobText.length < 200) {
      return NextResponse.json(
        { error: "Could not extract enough text from that page. Try a different link or add a paste-text fallback." },
        { status: 400 }
      );
    }

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
JOB POSTING TEXT (extracted from URL):
${jobText}

CANDIDATE RESUME (if provided):
${resumeText ?? "[not provided]"}

TASK:
1) Infer job title/company/location if possible.
2) Generate a tailored cover letter (1 page max).
3) Propose resume updates:
   - optional new summary
   - skills to add
   - 4-8 bullet edits: show "before" (make a reasonable guess if resume not provided) and "after" (targeted to role)
   - ATS keyword list
4) Write two emails:
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
      // you can also add max_tokens if you want
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error:
            "Model did not return valid JSON. Try again, or I can add a server-side JSON-repair step.",
          raw,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
