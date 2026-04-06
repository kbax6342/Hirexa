// src/app/api/onboarding/skills/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import OpenAI from "openai";
import { getToken } from "next-auth/jwt";

import { auth } from "@/auth";
import {
  getActiveOnboardingDraftForCookies,
  pickDraftGuestId,
  readDraftSection,
  readOnboardingDraftPayload,
  updateOnboardingDraftPayload,
  type DraftJobInterestsPayload,
} from "@/app/lib/onboarding/draft-session";
import { prisma } from "@/app/lib/prisma";


export const runtime = "nodejs";
const cache = new Map<string, { skills: string[]; expiresAt: number }>();
const CACHE_MS = 1000 * 60 * 30; // 30 minutes

/** ---------- shared utils ---------- **/
function normalizeSkill(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function dedupe(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = normalizeSkill(item);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function readKeyQuestions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function trimText(value: unknown, maxLength = 120) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function extractJson(text: string) {
  const t = text.trim();

  // ```json ... ``` or ``` ... ```
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  // If no fences, try to extract the first JSON array/object substring
  const firstArray = t.indexOf("[");
  const lastArray = t.lastIndexOf("]");
  if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
    return t.slice(firstArray, lastArray + 1);
  }

  const firstObj = t.indexOf("{");
  const lastObj = t.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return t.slice(firstObj, lastObj + 1);
  }

  return t;
}

/** ---------- GET: LLM skill suggestions ---------- **/
export async function GET(req: Request) {

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 12), 25);

  const key = `q=${q.toLowerCase()}|limit=${limit}`;
  const now = Date.now();
const hit = cache.get(key);
if (hit && hit.expiresAt > now) {
  console.log("CACHE HIT", key, hit.skills.length);
  return NextResponse.json({ skills: hit.skills.slice(0, limit) });
}

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ skills: [] }, { status: 200 });
  }

  const openai = new OpenAI({ apiKey });

  const prompt = q
    ? `
        Return a JSON array of up to ${limit} professional resume skills relevant to: "${q}".

        Rules:
        - Skills should be short (1-4 words).
        - Only skills (no job titles).
        - No duplicates.
        - No explanations.
        - Output ONLY valid JSON array of strings.
        `
            : `
        Return a JSON array of up to ${limit} popular resume skills across many industries.

        Rules:
        - Skills should be short (1-4 words).
        - Mix hard + soft skills.
        - No duplicates.
        - No explanations.
        - Output ONLY valid JSON array of strings.
        `;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.choices?.[0]?.message?.content ?? "[]";
//console.log("LLM TEXT:", text);

let skills: string[] = [];

try {
  const cleaned = extractJson(text);
  //console.log("LLM CLEANED:", cleaned);

  const parsed = JSON.parse(cleaned);

  const arr = Array.isArray(parsed) ? parsed : parsed?.skills;
  if (Array.isArray(arr)) {
    skills = arr.map((x) => String(x));
  }
} catch (e) {
  //console.log("JSON PARSE ERROR:", e);
  skills = [];
}

const final = dedupe(skills).slice(0, limit);
console.log("LLM FINAL", key, final.length, final);

return NextResponse.json({ skills: final });
    
    
  } catch {
    return NextResponse.json({ skills: [] }, { status: 200 });
  }
}



/** ---------- POST: Save selected skills to DB + cookie ---------- **/

export async function POST(req: NextRequest) {
  try {
    // 1) Try session (auth())
    const session = await auth();
    let userId = (session?.user as any)?.id as string | undefined;

    // 2) Fallback: decode JWT directly
    if (!userId) {
      const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
      const token = await getToken({ req, secret });
      userId = ((token as any)?.id as string | undefined) ?? token?.sub ?? undefined;
    }

    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value;
    const draft = !userId
      ? await getActiveOnboardingDraftForCookies(cookieStore)
      : null;

    if (!userId && !guestId && !draft) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized (no session/token or guest id)" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const incoming = Array.isArray(body?.skills) ? body.skills.map(String) : [];
    const allowShortlist = Boolean(body?.allowShortlist);
    const highlightSkillsConfidence = trimText(
      body?.highlightSkillsConfidence,
      120
    );
    const skills = incoming
      .map((s: string) => s.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    // dedupe case-insensitive
    const seen = new Set<string>();
    const finalSkills: string[] = [];
    for (const s of skills) {
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      finalSkills.push(s);
      if (finalSkills.length >= 50) break;
    }

    const minRequired = allowShortlist ? 1 : 3;

    if (finalSkills.length < minRequired) {
      return NextResponse.json(
        {
          ok: false,
          error:
            minRequired === 1
              ? "Select at least 1 skill."
              : "Select at least 3 skills.",
        },
        { status: 400 }
      );
    }

    if (!userId && draft) {
      const draftPayload = readOnboardingDraftPayload(draft.payload);
      const existingDraftJobInterests = readDraftSection<DraftJobInterestsPayload>(
        draftPayload.jobInterests
      );
      const nextJobInterests: DraftJobInterestsPayload = {
        ...existingDraftJobInterests,
        skills: finalSkills,
        ...(highlightSkillsConfidence
          ? { highlightSkillsConfidence }
          : {}),
      };

      await updateOnboardingDraftPayload({
        draftToken: draft.draftToken,
        payloadPatch: {
          jobInterests: nextJobInterests,
        },
        guestId: pickDraftGuestId({ cookieStore, draft }),
      });

      return NextResponse.json({
        ok: true,
        session: {
          userId: null,
          guestId: pickDraftGuestId({ cookieStore, draft }),
        },
        savedSkillsCount: finalSkills.length,
        profile: null,
        cookieProof: {
          guest_user_id: pickDraftGuestId({ cookieStore, draft }),
          onboarding_highlight_skills_confidence: highlightSkillsConfidence,
        },
      });
    }

    const existingProfile = await prisma.userProfile.findUnique({
      where: userId ? { userId } : { guestId: guestId! },
      select: { keyQuestions: true },
    });

    const existingKeyQuestions = readKeyQuestions(existingProfile?.keyQuestions);
    const nextKeyQuestions = highlightSkillsConfidence
      ? {
          ...existingKeyQuestions,
          highlightSkillsConfidence,
        }
      : existingKeyQuestions;

    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId
        ? {
            userId,
            skills: finalSkills,
            keyQuestions: nextKeyQuestions as Prisma.InputJsonValue,
          }
        : {
            guestId: guestId!,
            skills: finalSkills,
            keyQuestions: nextKeyQuestions as Prisma.InputJsonValue,
          },
      update: {
        skills: finalSkills,
        keyQuestions: nextKeyQuestions as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        userId: true,
        guestId: true,
        skills: true,
        minCompensation: true,
        compensationType: true,
      },
    });

    // ✅ persist skills cookie (httpOnly)
    cookieStore.set("user_skills", JSON.stringify(finalSkills), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    // ✅ cookie flag for quick “proof”
    cookieStore.set("skills_saved", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    if (highlightSkillsConfidence) {
      cookieStore.set(
        "onboarding_highlight_skills_confidence",
        highlightSkillsConfidence,
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        }
      );
    }

    // ✅ return proof payload (what server can confirm immediately)
    const cookieProof = {
      guest_user_id: cookieStore.get("guest_user_id")?.value ?? null,
      onboarding_resume_skipped:
        cookieStore.get("onboarding_resume_skipped")?.value ?? null,
      job_interest_ids: cookieStore.get("job_interest_ids")?.value ?? null,
      job_interest_titles: cookieStore.get("job_interest_titles")?.value ?? null,
      min_comp_type: cookieStore.get("min_comp_type")?.value ?? null,
      min_comp_value: cookieStore.get("min_comp_value")?.value ?? null,
      skills_saved: cookieStore.get("skills_saved")?.value ?? null,
      onboarding_highlight_skills_confidence:
        cookieStore.get("onboarding_highlight_skills_confidence")?.value ?? null,
    };

    return NextResponse.json({
      ok: true,
      session: { userId: userId ?? null, guestId: guestId ?? null },
      savedSkillsCount: finalSkills.length,
      profile,
      cookieProof,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
