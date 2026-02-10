// import { NextResponse } from "next/server";
// import { cookies } from "next/headers";
// import { prisma } from "@/app/lib/prisma";
// import { auth } from "@/app/lib/auth";

// const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// export const dynamic = "force-dynamic";

// export async function POST(req: Request) {
//   try {
//     const session = await auth();
//     const userId = session?.user?.id ?? null;

//     const c = await cookies();
//     const guestId = c.get("guest_user_id")?.value ?? null;

//     if (!userId && !guestId) {
//       return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
//     }

//     const profile = await prisma.userProfile.findUnique({
//       where: userId ? { userId } : { guestId: guestId! },
//       select: { id: true },
//     });

//     if (!profile) {
//       return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
//     }

//     const formData = await req.formData();
//     const file = formData.get("resume");

//     if (!(file instanceof File)) {
//       return NextResponse.json({ ok: false, error: "Missing resume file" }, { status: 400 });
//     }

//     const arrayBuffer = await file.arrayBuffer();
//     const buffer = Buffer.from(arrayBuffer);

//     // 1) Save resume record (adapt to your schema/storage)
//     const resume = await prisma.resume.create({
//       data: {
//         profileId: profile.id,
//         fileName: file.name,
//         mimeType: file.type || "application/octet-stream",
//         sizeBytes: file.size,
//         // If you store bytes in DB:
//         // data: buffer,
//         //
//         // If you store to disk/S3, store the path/key instead:
//         // storageKey: `resumes/${crypto.randomUUID()}`
//       },
//     });

//     // 2) Parse it with your LLM (THIS is the missing piece)
//     // ✅ Replace this with your existing parsing logic from /api/resume/parse
//     const experiences = await parseResumeWithLLM({
//       fileName: file.name,
//       mimeType: file.type,
//       buffer,
//     });

//     // 3) Save parsed experiences so step2 can fetch them
//     await prisma.resumeExperience.upsert({
//       where: { resumeId: resume.id },
//       update: { experiences },
//       create: { resumeId: resume.id, experiences },
//     });

//     return NextResponse.json({
//       ok: true,
//       savedTo: { sessionUserId: userId, guestId, profileId: profile.id },
//       resume: {
//         id: resume.id,
//         profileId: resume.profileId,
//         fileName: resume.fileName,
//         mimeType: resume.mimeType,
//         sizeBytes: resume.sizeBytes,
//         createdAt: resume.createdAt,
//       },
//     });
//   } catch (e: any) {
//     console.error("POST /api/onboarding/resume error:", e);
//     return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
//   }
// }

// // export async function GET() {
// //   // status endpoint: tells you whether the resume is saved for this user/guest
// //   const session = await auth();
// //   const userId = session?.user?.id ?? null;

// //   const c = await cookies();
// //   const guestId = c.get("guest_user_id")?.value ?? null;

// //   if (!userId && !guestId) {
// //     return NextResponse.json({ ok: true, hasProfile: false, hasResume: false });
// //   }

// //   const profile = await prisma.userProfile.findUnique({
// //     where: userId ? { userId } : { guestId: guestId! },
// //     select: { id: true },
// //   });

// //   if (!profile) {
// //     return NextResponse.json({
// //       ok: true,
// //       hasProfile: false,
// //       hasResume: false,
// //       userId,
// //       guestId,
// //     });
// //   }

// //   const latest = await prisma.resumeFile.findFirst({
// //     where: { profileId: profile.id },
// //     orderBy: { createdAt: "desc" },
// //     select: {
// //       id: true,
// //       fileName: true,
// //       sizeBytes: true,
// //       createdAt: true,
// //       profileId: true,
// //     },
// //   });

// //   return NextResponse.json({
// //     ok: true,
// //     userId,
// //     guestId,
// //     profileId: profile.id,
// //     cookie: {
// //       resume_uploaded: c.get("resume_uploaded")?.value ?? null,
// //       resume_id: c.get("resume_id")?.value ?? null,
// //     },
// //     hasProfile: true,
// //     hasResume: !!latest,
// //     latestResume: latest ?? null,
// //   });
// // }

// export async function GET() {
//     const session = await auth();
//     const userId = session?.user?.id ?? null;
  
//     const c = await cookies();
//     const guestId = c.get("guest_user_id")?.value ?? null;
  
//     if (!userId && !guestId) {
//       return NextResponse.json({ ok: true, hasProfile: false, hasResume: false });
//     }
  
//     // ✅ AUTO-CREATE PROFILE if missing (for user OR guest)
//     const profile = await prisma.userProfile.upsert({
//       where: userId ? { userId } : { guestId: guestId! },
//       create: userId ? { userId } : { guestId: guestId! },
//       update: {},
//       select: { id: true },
//     });
  
//     const latest = await prisma.resumeFile.findFirst({
//       where: { profileId: profile.id },
//       orderBy: { createdAt: "desc" },
//       select: { id: true, fileName: true, sizeBytes: true, createdAt: true, profileId: true },
//     });
  
//     return NextResponse.json({
//       ok: true,
//       userId,
//       guestId,
//       profileId: profile.id,
//       hasProfile: true,
//       hasResume: !!latest,
//       latestResume: latest ?? null,
//       cookie: {
//         resume_uploaded: c.get("resume_uploaded")?.value ?? null,
//         resume_id: c.get("resume_id")?.value ?? null,
//       },
//     });
//   }



import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";

import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

type PdfTextResult = {
  pages: { page: number; text: string }[];
  fullText: string;
};

async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  });

  const pdf = await loadingTask.promise;

  const pages: { page: number; text: string }[] = [];
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const pageText = content.items
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();

    pages.push({ page: pageNum, text: pageText });
    fullText += pageText + "\n";
  }

  fullText = fullText.replace(/\n{3,}/g, "\n\n").trim();
  return { pages, fullText };
}

async function claudeExtractExperiences(fullText: string): Promise<Experience[]> {
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

  // Keep your 14k limit (good idea)
  const user = `Resume text:\n"""${fullText.slice(0, 14000)}"""`;

  const msg = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 3500,
    temperature: 0.0,
    system,
    messages: [{ role: "user", content: user }],
  });

  const raw = msg.content
    .filter((b) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();

  if (!raw) throw new Error("Claude returned empty response");

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Claude output missing JSON");
  }

  const jsonStr = raw.slice(firstBrace, lastBrace + 1);

  const parsedJson = JSON.parse(jsonStr);
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

  // ✅ For now: parse PDFs reliably (your code uses pdfjs)
  // If you want DOCX too, we can add mammoth/docx parsing next.
  if (!mimeType.includes("pdf")) {
    throw new Error("Only PDF is supported right now. Please export your resume as PDF and upload again.");
  }

  const { fullText } = await extractPdfText(buffer);

  // You had heuristic fallback before; if you want it back, you can add it here.
  const experiences = await claudeExtractExperiences(fullText);

  return experiences;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ✅ ALWAYS ensure profile exists (prevents "Profile not found")
    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId ? { userId } : { guestId: guestId! },
      update: {},
      select: { id: true },
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

    // ✅ Upsert resume tied to profile (still 1 resume per profile)
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
          where: {
            experienceId: {
              in: existingExperiences.map((exp) => exp.id),
            },
          },
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

    return NextResponse.json({
      ok: true,
      savedTo: { sessionUserId: userId, guestId, profileId: profile.id },
      resume: {
        id: resume.id,
        profileId: resume.userProfileId,
        userProfileId: resume.userProfileId,
        fileName: resume.filename,
        filename: resume.filename,
        mimeType: resume.mimeType,
      },
      parsed: {
        experienceCount: parsedExperiences.length,
      },
    });
  } catch (e: any) {
    console.error("POST /api/onboarding/resume error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}

