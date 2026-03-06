// src/app/api/skills/search/route.ts
import { NextResponse } from "next/server";
import { POPULAR_SKILLS, SKILL_DICTIONARY } from "@/app/lib/skills/skill-taxonomy";
import OpenAI from "openai";

export const runtime = "nodejs";

function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function dedupe(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = normalize(item);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 12), 25);

  // If empty input, return popular skills immediately (no LLM needed)
  if (!q) {
    return NextResponse.json({ skills: POPULAR_SKILLS.slice(0, limit) });
  }

  // Fast local filter first
  const local = SKILL_DICTIONARY
    .filter((s) => s.toLowerCase().includes(q.toLowerCase()))
    .slice(0, limit);

  // If we already have enough, skip LLM for speed
  if (local.length >= Math.min(limit, 8)) {
    return NextResponse.json({ skills: local });
  }

  // LLM expand (optional, but you asked for it)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // no key: fallback to local
    return NextResponse.json({ skills: local.length ? local : POPULAR_SKILLS.slice(0, limit) });
  }

  try {
    const openai = new OpenAI({ apiKey });

    // Keep this cheap + fast; ask for short list
    const prompt = `
Return a JSON array of up to ${limit} professional skills relevant to: "${q}".
Rules:
- Skills should be short (1-4 words).
- No duplicates.
- No explanations. ONLY valid JSON array.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const text = resp.choices?.[0]?.message?.content ?? "[]";

    let llmSkills: string[] = [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) llmSkills = parsed.map(String);
    } catch {
      // ignore parse errors; fallback
    }

    const merged = dedupe([...local, ...llmSkills]).slice(0, limit);
    return NextResponse.json({ skills: merged.length ? merged : POPULAR_SKILLS.slice(0, limit) });
  } catch {
    return NextResponse.json({ skills: local.length ? local : POPULAR_SKILLS.slice(0, limit) });
  }
}
