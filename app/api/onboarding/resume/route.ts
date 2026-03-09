// /app/api/onboarding/resume/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { cookies } from "next/headers";
import { auth } from "@/app/lib/auth";

import OpenAI from "openai";
import crypto from "crypto";
import { z } from "zod";
import { extractPdfText } from "@/app/lib/pdf/serverPdfParser";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { mergeGuestProfileIntoUserProfile } from "@/app/lib/profile/mergeGuestProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ OpenAI client (set OPENAI_API_KEY)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ----------------------------- Retry utilities ---------------------------- */

type RetryableError = {
  status?: number;
  requestID?: string;
  message?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status?: number) {
  // OpenAI transient patterns
  return status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function extractStatusAndRequestId(err: unknown): RetryableError {
  const anyErr = err as any;

  // OpenAI SDK errors commonly include: status, request_id, message
  return {
    status: anyErr?.status ?? anyErr?.response?.status,
    requestID:
      anyErr?.request_id ??
      anyErr?.requestID ??
      anyErr?.response?.headers?.get?.("x-request-id") ??
      anyErr?.response?.headers?.get?.("request-id"),
    message: anyErr?.message ?? String(err),
  };
}

/**
 * Retries a function on transient provider overload/rate-limit errors.
 */
async function withRetries<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string }
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  const maxDelayMs = opts?.maxDelayMs ?? 4000;
  const label = opts?.label ?? "provider-call";

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const info = extractStatusAndRequestId(err);

      if (!isRetryableStatus(info.status) || attempt === maxAttempts) {
        throw err;
      }

      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 200);
      const delay = exp + jitter;

      console.warn(`[${label}] retrying after ${delay}ms (attempt ${attempt}/${maxAttempts})`, {
        status: info.status,
        requestID: info.requestID,
      });

      await sleep(delay);
    }
  }

  throw lastErr;
}

/* --------------------------------- Types -------------------------------- */

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

/* ------------------------------ PDF extraction --------------------------- */

/* ------------------------- OpenAI resume parsing ------------------------- */

async function openaiExtractExperiences(fullText: string): Promise<Experience[]> {
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
`.trim();

  // Keep your 14k limit (good idea)
  const user = `Resume text:\n"""${fullText.slice(0, 14000)}"""`;

  // ✅ Structured Outputs JSON schema (strict)
  // Note: casting as any keeps TS happy across SDK versions.
  const response = await withRetries(
    async () =>
      openai.chat.completions.create({
        model: "gpt-4o-mini-2024-07-18",
        temperature: 0,
        // keep tokens reasonable; your output is small JSON
        max_tokens: 1800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "experiences_schema",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["experiences"],
              properties: {
                experiences: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "company", "location", "dateRange", "bullets"],
                    properties: {
                      title: { type: "string" },
                      company: { type: "string" },
                      location: { type: ["string", "null"] },
                      dateRange: { type: ["string", "null"] },
                      bullets: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        } as any,
      }),
    { label: "openai.chat.completions.create", maxAttempts: 5 }
  );

  const raw = response.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenAI returned empty response");

  // With json_schema strict, this should already be valid JSON
  const parsedJson = JSON.parse(raw);
  const parsed = ExperiencesSchema.parse(parsedJson);

  return parsed.experiences.map((e) => ({
    id: crypto.randomUUID(),
    title: e.title,
    company: e.company,
    location: e.location ?? undefined,
    dateRange: e.dateRange ?? undefined,
    bullets: e.bullets ?? [],
  }));
}

async function parseResumeWithLLM(args: { mimeType: string; buffer: Buffer }): Promise<Experience[]> {
  const { mimeType, buffer } = args;

  if (!mimeType.includes("pdf")) {
    throw new Error("Only PDF is supported right now. Please export your resume as PDF and upload again.");
  }

  const { fullText } = await extractPdfText(buffer);
  return await openaiExtractExperiences(fullText);
}

/* --------------------------------- Route -------------------------------- */

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    const c = await cookies();
    let guestId = c.get("guest_user_id")?.value ?? null;
    const shouldSetGuestCookie = !guestId;
    const originalGuestId = guestId;

    if (userId && guestId) {
      const existingGuestId = guestId;
      await prisma.$transaction((tx) =>
        mergeGuestProfileIntoUserProfile(tx, {
          userId,
          guestId: existingGuestId,
          email: session?.user?.email ?? null,
        })
      );
      guestId = null;
    }

    if (!userId && !guestId) {
      guestId = `guest_${crypto.randomUUID()}`;
    }

    // ✅ ALWAYS ensure profile exists
    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId ? { userId } : { guestId: guestId! },
      update: {},
      select: { id: true, guestId: true },
    });

    const formData = await req.formData();
    const file = formData.get("resume");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing resume file (field name must be 'resume')." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/pdf";

    const resume = await prisma.resume.upsert({
      where: { userProfileId: profile.id },
      update: { filename: file.name, mimeType },
      create: { userProfileId: profile.id, filename: file.name, mimeType },
      select: { id: true, userProfileId: true, filename: true, mimeType: true },
    });

    const parsedExperiences = await parseResumeWithLLM({ mimeType, buffer });

    await prisma.$transaction(async (tx) => {
      const existingExperiences = await tx.experience.findMany({
        where: { resumeId: resume.id },
        select: { id: true },
      });

      if (existingExperiences.length > 0) {
        await tx.bullet.deleteMany({
          where: { experienceId: { in: existingExperiences.map((exp) => exp.id) } },
        });
      }

      await tx.experience.deleteMany({ where: { resumeId: resume.id } });

      for (const [index, exp] of parsedExperiences.entries()) {
        const createdExperience = await tx.experience.create({
          data: {
            resumeId: resume.id,
            order: index,
            title: exp.title,
            company: exp.company,
            location: exp.location ?? null,
            dateRange: exp.dateRange ?? null,
          },
          select: { id: true },
        });

        if (exp.bullets.length > 0) {
          await tx.bullet.createMany({
            data: exp.bullets.map((text, bulletIndex) => ({
              experienceId: createdExperience.id,
              order: bulletIndex,
              text,
            })),
          });
        }
      }

      await tx.resumeExperience.upsert({
        where: { resumeId: resume.id },
        update: { experiences: parsedExperiences },
        create: { resumeId: resume.id, experiences: parsedExperiences },
      });
    });

    invalidateCachedProfile({ userId, guestId: originalGuestId ?? guestId });

    const response = NextResponse.json({
      ok: true,
      success: true,
      savedTo: { sessionUserId: userId, guestId: profile.guestId, profileId: profile.id },
      resume: {
        id: resume.id,
        profileId: resume.userProfileId,
        userProfileId: resume.userProfileId,
        fileName: resume.filename,
        filename: resume.filename,
        mimeType: resume.mimeType,
      },
      parsed: { experienceCount: parsedExperiences.length },
    });

    if (userId && originalGuestId) {
      response.cookies.set("guest_user_id", "", {
        path: "/",
        maxAge: 0,
      });
    } else if (shouldSetGuestCookie && guestId) {
      response.cookies.set("guest_user_id", guestId!, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (e: any) {
    const info = extractStatusAndRequestId(e);

    if (isRetryableStatus(info.status)) {
      return NextResponse.json(
        {
          error: "The resume parser is temporarily busy. Please try again in a few seconds.",
          provider: "openai",
          requestId: info.requestID ?? null,
        },
        { status: 503 }
      );
    }

    console.error("POST /api/onboarding/resume error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
