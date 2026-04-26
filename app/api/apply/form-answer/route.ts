import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { generateFormAnswers } from "@/app/lib/apply/formIntelligence/aiFormAnswerGenerator";
import type { FormFieldDescriptor } from "@/app/lib/apply/formIntelligence/types";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type FormAnswerRequest = {
  applicationId?: string;
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  source?: string;
  pageUrl?: string;
  pageTitle?: string;
  pageText?: string;
  fields: FormFieldDescriptor[];
  mode: "preview" | "autofill";
  existingApplicationAnswers?: Record<string, string>;
};

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
    if (text.trim()) result[key] = text.trim();
  }
  return result;
}

function summarizeProfileResume(profile: Awaited<ReturnType<typeof loadProfile>>) {
  if (!profile?.resume) return "";

  return profile.resume.experiences
    .map((experience) =>
      [
        [experience.title, experience.company].filter(Boolean).join(" at "),
        experience.bullets.map((bullet) => bullet.text).join(" "),
      ]
        .filter(Boolean)
        .join(": "),
    )
    .join("\n")
    .slice(0, 8000);
}

async function loadProfile(userId: string) {
  return prisma.userProfile.findFirst({
    where: { userId },
    include: {
      resume: {
        include: {
          experiences: {
            orderBy: { order: "asc" },
            include: { bullets: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as FormAnswerRequest;
  const fields = Array.isArray(body.fields) ? body.fields : [];
  if (body.mode !== "preview" && body.mode !== "autofill") {
    return NextResponse.json(
      { ok: false, error: "mode must be preview or autofill" },
      { status: 400 },
    );
  }

  const profile = await loadProfile(userId);
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "User profile not found" },
      { status: 404 },
    );
  }

  const application = body.applicationId
    ? await prisma.jobApplication.findFirst({
        where: { id: body.applicationId, userProfileId: profile.id },
      })
    : null;
  const existingApplicationAnswers = {
    ...asStringMap(application?.answersJson),
    ...asStringMap(body.existingApplicationAnswers),
  };

  const result = await generateFormAnswers({
    userProfile: profile,
    resumeText: summarizeProfileResume(profile),
    jobTitle: body.jobTitle ?? application?.title ?? application?.jobTitle ?? undefined,
    companyName: body.companyName ?? application?.company ?? undefined,
    jobDescription: body.jobDescription,
    pageText: body.pageText,
    source: body.source ?? application?.source ?? undefined,
    existingApplicationAnswers,
    fields,
  });

  const summary = {
    totalFields: fields.length,
    answeredCount: result.answers.length,
    blockedCount: result.blockedFields.length,
    safeAutofillCount: result.answers.filter(
      (answer) => answer.safeToAutofill && !answer.requiresUserReview,
    ).length,
    reviewRequired: result.blockedFields.length > 0,
  };

  return NextResponse.json({
    ok: true,
    answers: result.answers,
    blockedFields: result.blockedFields,
    summary,
  });
}
