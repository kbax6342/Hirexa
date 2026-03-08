import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { z } from "zod";

import { extractPdfText } from "@/app/lib/pdf/serverPdfParser";

export const runtime = "nodejs";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});



export type WorkExperience = {
  id: string;
  title: string;
  company: string;
  location?: string;
  dateRange?: string;
  bullets: string[];
};

export type Experience = {
  id: string;
  title: string;
  company: string;
  location?: string;
  dateRange?: string;
  bullets: string[];
};

const ExperienceSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.union([z.string(), z.null()]).optional(),
  dateRange: z.union([z.string(), z.null()]).optional(),
  bullets: z.array(z.string()).default([]),
});

const ExperiencesSchema = z.object({
  experiences: z.array(ExperienceSchema),
});



function parseWorkExperienceFromText(text: string): WorkExperience[] {
  const startMatch = text.match(/professional\s+experience/i);


  if (!startMatch || startMatch.index == null) return [];

  const afterStart = text.slice(startMatch.index);

  const endMarkers = ["education", "additional experience", "certifications", "links", "core skills"];
  let endIdx = afterStart.length;
  for (const m of endMarkers) {
    const i = afterStart.toLowerCase().indexOf(m);
    if (i !== -1 && i < endIdx && i > 0) endIdx = i;
  }

  const section = afterStart.slice(0, endIdx);

  const normalized = section
    .replace(/●/g, "\n● ")
    .replace(/\s–\s/g, " – ")
    .replace(/\s\|\s/g, " | ")
    .replace(/\n{3,}/g, "\n\n")
    // add newlines before title lines ("Something | Something")
    .replace(/([A-Za-z][A-Za-z0-9 /&().,-]{2,})\s\|\s([A-Za-z][A-Za-z0-9 /&().,-]{2,})/g, "\n$1 | $2")
    // add newline before date ranges
    .replace(
      /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*–\s*(Present|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}))/g,
      "\n$1"
    ).replace(/professional\s+experience/gi, "PROFESSIONAL EXPERIENCE\n")
    .trim();

  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const jobs: WorkExperience[] = [];
  let current: WorkExperience | null = null;

  const isDateRange = (s: string) =>
    /^((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4})\s*–\s*(Present|((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}))$/i.test(
      s
    );

  const isJobTitleLine = (s: string) =>
    s.includes(" | ") && !/professional\s+experience/i.test(s);

  const parseTitleLine = (s: string) => {
    const [titlePart, locationPart] = s.split(" | ").map((x) => x.trim());
    return { titlePart, locationPart };
  };

  const parseDateRange = (s: string) => {
    const m = s.match(/^(.+?)\s*–\s*(.+)$/);
    return m ? { start: m[1].trim(), end: m[2].trim() } : null;
  };

  // NEW: detect a likely company line (not bullet, not header, not date, not title)
  const isLikelyCompanyLine = (s: string) => {
    if (!s) return false;
    if (s.startsWith("●")) return false;
    if (isDateRange(s)) return false;
    if (isJobTitleLine(s)) return false;
    if (/professional\s+experience/i.test(s)) return false;
    // avoid grabbing long sentences as company
    if (s.length > 60) return false;
    return true;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/professional\s+experience/i.test(line)) continue;

    if (isJobTitleLine(line)) {
      // close previous
      if (current) jobs.push(current);

      const { titlePart, locationPart } = parseTitleLine(line);

      current = {
        id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
        title: titlePart,
        location: locationPart || undefined, // NOTE: "Remote" will land here
        company: "",
        dateRange: undefined,
        bullets: [],
      };

      // Immediately try to read next lines for company + date
      // company is often next line in your resume
      const next = lines[i + 1];
      const next2 = lines[i + 2];

      if (next && isLikelyCompanyLine(next)) {
        current.company = next;
        i += 1; // consumed company line
      }

      if (next2 && isDateRange(next2)) {
        current.dateRange = next2;
        i += 1; // we already moved once, this moves again to consume date
      } else if (lines[i + 1] && isDateRange(lines[i + 1])) {
        // if date is directly next
        current.dateRange = lines[i + 1];
        i += 1;
      }

      continue;
    }

    if (!current) continue;

    if (isDateRange(line) && !current.dateRange) {
      current.dateRange = line;
      continue;
    }

    if (isLikelyCompanyLine(line) && !current.company) {
      current.company = line;
      continue;
    }

    if (line.startsWith("●")) {
      current.bullets.push(line.replace(/^●\s*/, "").trim());
      continue;
    }
  }

  if (current) jobs.push(current);

  // ✅ no longer drop entries just because company line format differed
  return jobs.filter((j) => j.title && (j.company || j.bullets.length > 0));
}

// ---------- HEURISTIC FALLBACK (optional) ----------
// function heuristicParse(text: string): Experience[] {
//   // Very light heuristic: find "Work Experience" or "Professional Experience"
//   const m = text.match(/\b(work|professional)\s+experience\b/i);
//   if (!m || m.index == null) return [];

//   const after = text.slice(m.index);
//   const endMarkers = ["education", "skills", "languages", "certifications"];
//   let endIdx = after.length;
//   for (const mk of endMarkers) {
//     const i = after.toLowerCase().indexOf(mk);
//     if (i !== -1 && i > 0 && i < endIdx) endIdx = i;
//   }
//   const section = after.slice(0, endIdx);

//   // Normalize bullets to separate lines
//   const normalized = section
//     .replace(/[•●]/g, "\n• ")
//     .replace(/\n{3,}/g, "\n\n")
//     .trim();

//   const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);

//   const isDate = (s: string) =>
//     // supports: "Jan 2024 – Sep 2024" OR "July 2025 to September 2025"
//     /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*(–|-|to)\s*(Present|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}))/i.test(
//       s
//     );

//   const looksLikeCompanyLocation = (s: string) =>
//     /.+[-–].+,\s*[A-Z]{2}\b/.test(s) || /.+,\s*[A-Z]{2}\b/.test(s);

//   const out: Experience[] = [];
//   let cur: Experience | null = null;

//   for (let i = 0; i < lines.length; i++) {
//     const line = lines[i];

//     // Start new job if next line resembles company/location and current line isn’t a bullet
//     const next = lines[i + 1];
//     if (!line.startsWith("•") && next && looksLikeCompanyLocation(next)) {
//       if (cur) out.push(cur);
//       cur = {
//         id: crypto.randomUUID(),
//         title: line,
//         company: next.split(/[-–]/)[0].trim(),
//         location: next.includes("-") || next.includes("–") ? next.split(/[-–]/).slice(1).join("-").trim() : undefined,
//         dateRange: undefined,
//         bullets: [],
//       };
//       i += 1;
//       continue;
//     }

//     if (!cur) continue;

//     if (isDate(line) && !cur.dateRange) {
//       cur.dateRange = line;
//       continue;
//     }

//     if (line.startsWith("•")) {
//       cur.bullets.push(line.replace(/^•\s*/, "").trim());
//       continue;
//     }
//   }

//   if (cur) out.push(cur);
//   return out;
// }



// ---------- CLAUDE EXTRACTION ----------
async function claudeExtractExperiences(fullText: string): Promise<Experience[]> {
  console.log("---- CLAUDE EXTRACTION START ----");

  console.log("Full text length:", fullText.length);
  console.log("Full text preview:", fullText.slice(0, 500));
  const system = `
You are an expert resume parser.

Return ONLY valid JSON (no markdown, no commentary) with this exact shape:
{
  "experiences": [
    {
      "title": "string",
      "company": "string",
      "location": "string | null",
      "dateRange": "string | null",
      "bullets": ["string", ...]
    }
  ]
}

Rules:
- Extract all real work experience roles (jobs, internships, contracts).
- Do NOT include education, skills lists, summary paragraphs unless they are clearly a role.
- If location/dateRange missing, use null.
- bullets are responsibilities/accomplishments (can be empty).
`;

  const user = `Resume text:\n"""${fullText.slice(0, 14000)}"""`;
  console.log("Sending request to Claude...");
  // const response = await anthropic.messages.create({
  //   model: "claude-3-haiku-20240307",
  //   messages: [{ role: "user", content: prompt }],
  //   temperature: 0.0,
  //   max_tokens: 50, // Adjust as needed
  // });
  const msg = await anthropic.messages.create({
    model: "claude-3-haiku-20240307", // or whatever you use
    max_tokens: 3500,
    temperature: 0.0,
    system,
    messages: [{ role: "user", content: user }],
  });

  // Claude responses can be multi-block; we want concatenated text blocks
  const raw = msg.content
    .filter((b) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
    console.log("Raw Claude output:");
    console.log(raw.slice(0, 2000));

    if (!raw) {
      console.error("Claude returned empty text.");
      throw new Error("Claude returned empty response");
    }

    // ---- Extract JSON safely ----
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
      console.error("No JSON braces found in Claude output.");
      throw new Error("Claude output missing JSON");
    }

  // Defensive: extract JSON if extra text slips in
  // const jsonStr = raw.startsWith("{")
  //   ? raw
  //   : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const jsonStr = raw.slice(firstBrace, lastBrace + 1);

  console.log("Extracted JSON string:");
  console.log(jsonStr.slice(0, 2000));

  let parsedJson: any;
  //const parsed = ExperiencesSchema.parse(JSON.parse(jsonStr));

  try {
    parsedJson = JSON.parse(jsonStr);
    console.log("JSON parsed successfully.");
  } catch (err) {
    console.error("JSON parse error:");
    console.error(err);
    throw err;
  }

  // ---- Zod validation ----
  let parsed;

  try {
    parsed = ExperiencesSchema.parse(parsedJson);
    console.log("Schema validation passed.");
  } catch (err) {
    console.error("Schema validation failed:");
    console.error(err);
    throw err;
  }

  console.log(
    "Experiences count from Claude:",
    parsed.experiences.length
  );

  const mapped = parsed.experiences.map((e) => ({
    id: crypto.randomUUID(),
    title: e.title,
    company: e.company,
    location: e.location ?? undefined,
    dateRange: e.dateRange ?? undefined,
    bullets: e.bullets ?? [],
  }));

  console.log("Mapped experiences:", mapped.length);
  console.log(mapped.slice(0, 2));

  console.log("---- CLAUDE EXTRACTION END ----");

  return mapped;

  // return parsed.experiences.map((e) => ({
  //   id: crypto.randomUUID(),
  //   title: e.title,
  //   company: e.company,
  //   location: e.location ?? undefined,
  //   dateRange: e.dateRange ?? undefined,
  //   bullets: e.bullets ?? [],
  // }));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file (field name must be 'file')." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fullText } = await extractPdfText(buffer);

    let experiences: Experience[] = [];
    let used: "claude" | "heuristic" = "claude";

    try {
      //console.log(fullText)
      //console.log("Made it here")
      experiences = await claudeExtractExperiences(fullText);
    } catch (e) {
      used = "heuristic";
      //experiences = heuristicParse(fullText);
    }

    return NextResponse.json({
      experiences,
      meta: { used, count: experiences.length },
      // debugPreview: fullText.slice(0, 2000),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Parse failed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
