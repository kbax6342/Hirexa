// app/api/jobs/pretty/route.ts
import "server-only";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { JobPretty } from "@/app/lib/jobs/types";

export const runtime = "nodejs";

function stripDangerousHtml(input: string) {
  return (input ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .trim();
}

// ✅ cap the size so you don’t hit payload/token limits
function cap(input: string, maxChars = 35_000) {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars) + "\n\n[TRUNCATED]";
}


const JOB_PRETTY_SCHEMA = {
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
          kind: { type: "string", enum: ["paragraphs", "bullets", "callout", "smallprint"] },

          // ✅ MUST be required (can be empty when not used)
          paragraphs: { type: "array", items: { type: "string" } },
          bullets: { type: "array", items: { type: "string" } },

          // ✅ MUST be required (label/value can be "" when not used)
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

        // ✅ REQUIRED must include every key in properties
        required: ["title", "kind", "paragraphs", "bullets", "callout"],
      },
    },
  },
  required: ["highlights", "sections"],
} as const;


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getResponseText(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }
  const chunks: string[] = [];
  for (const item of Array.isArray(resp?.output) ? resp.output : []) {
    for (const c of Array.isArray(item?.content) ? item.content : []) {
      if (typeof c?.text === "string" && c.text.trim()) chunks.push(c.text.trim());
    }
  }
  return chunks.join("\n").trim();
}

function normalizeJobPretty(input: any): JobPretty {
  const out: JobPretty = { highlights: [], sections: [] };

  if (Array.isArray(input?.highlights)) {
    out.highlights = input.highlights
      .filter((h: any) => typeof h?.label === "string" && typeof h?.value === "string")
      .map((h: any) => ({ label: h.label.trim(), value: h.value.trim() }))
      .filter((h: any) => h.label && h.value);
  }

  if (Array.isArray(input?.sections)) {
    out.sections = input.sections
      .filter((s: any) => typeof s?.title === "string" && typeof s?.kind === "string")
      .map((s: any) => {
        const title = String(s.title).trim();
        const kind = String(s.kind).trim();

        const paragraphs = Array.isArray(s.paragraphs)
          ? s.paragraphs.map((x: any) => String(x).trim()).filter(Boolean)
          : [];

        const bullets = Array.isArray(s.bullets)
          ? s.bullets.map((x: any) => String(x).trim()).filter(Boolean)
          : [];

        const calloutLabel = String(s?.callout?.label ?? "").trim();
        const calloutValue = String(s?.callout?.value ?? "").trim();

        if (kind === "bullets") {
          return { title, kind: "bullets", bullets } as const;
        }

        if (kind === "callout") {
          const label = calloutLabel.length ? calloutLabel : undefined;
          return {
            title,
            kind: "callout",
            callout: label ? { label, value: calloutValue } : { value: calloutValue },
          } as const;
        }

        if (kind === "smallprint") {
          return { title, kind: "smallprint", paragraphs } as const;
        }

        return { title, kind: "paragraphs", paragraphs } as const;
      })
      .filter(Boolean as any);
  }

  return out;
}


export async function POST(req: Request) {
  console.log("HIT /api/jobs/pretty", new Date().toISOString());
 let parsed: JobPretty;
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
   
    const body = await req.json().catch(() => null);
    const raw = String(body?.htmlOrText ?? "");
    if (!raw.trim()) {
      const empty: JobPretty = { highlights: [], sections: [] };
      return NextResponse.json(empty);
    }

    const cleaned = cap(stripDangerousHtml(raw));

    // ✅ Use a model that’s extremely likely to exist
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

    const system = `
    Return ONLY valid JSON that matches the schema.
    
    For EACH section object you MUST include:
    - title (string)
    - kind ("paragraphs"|"bullets"|"callout"|"smallprint")
    - paragraphs (string[])  -> use [] if not used
    - bullets (string[])     -> use [] if not used
    - callout ({label,value})-> use {"label":"","value":""} if not used
    
    Rules:
    - If kind="paragraphs" or "smallprint": put content into paragraphs; bullets must be []; callout empty.
    - If kind="bullets": put content into bullets; paragraphs []; callout empty.
    - If kind="callout": put content into callout.value (and optional callout.label); paragraphs []; bullets [].
    - Keep content faithful; do not invent details.
    `.trim();
    

    const resp = await openai.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: cleaned },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "JobPretty",
          schema: JOB_PRETTY_SCHEMA,
          strict: true,
        },
      },
      store: false,
    });

    const jsonText = getResponseText(resp);

    if (!jsonText) {
      return NextResponse.json(
        { error: "Pretty formatting failed", detail: "Empty model response text", model },
        { status: 500 }
      );
    }
    let parsed: JobPretty;
try {
  const normalized = normalizeJobPretty(JSON.parse(jsonText));
  return NextResponse.json(normalized, { headers: { "Cache-Control": "no-store" } });
} catch {
  return NextResponse.json(
    {
      error: "Pretty formatting failed",
      detail: "Model returned non-JSON (or JSON with extra text).",
      model,
      rawModelText: jsonText.slice(0, 4000),
    },
    { status: 500 }
  );
}
  } catch (err: any) {
    // ✅ this is the important part: return the real OpenAI error payload
    const status = err?.status ?? err?.response?.status ?? 500;
    console.error("Pretty route error:", err);

    return NextResponse.json(
      {
        error: "Pretty formatting failed",
        status,
        message: err?.message ?? "Unknown error",
        // common OpenAI error shapes:
        openai: err?.error ?? err?.response?.data ?? null,
      },
      { status: 500 }
    );
  }
}
