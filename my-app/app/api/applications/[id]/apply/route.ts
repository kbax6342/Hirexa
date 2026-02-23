// my-app/app/api/applications/[id]/apply/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm, type GhField } from "@/app/lib/greenhouse/parseGreenhouseForm";
import { applyWithPlaywright } from "@/app/lib/apply/playwrightApply";

export const runtime = "nodejs";

type AnswerValue = string | string[];
type AnswersMap = Record<string, AnswerValue>;

type ApplyBody = {
  answers?: AnswersMap;
};

function isGreenhouseBoardUrl(jobUrl: string) {
  try {
    const host = new URL(jobUrl).hostname.toLowerCase();
    return host === "job-boards.greenhouse.io" || host === "boards.greenhouse.io";
  } catch {
    return false;
  }
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeAnswer(value: unknown, field: GhField): AnswerValue {
  if (field.type === "checkbox") {
    if (Array.isArray(value)) {
      return value.map((item) => toText(item)).filter(Boolean);
    }
    const txt = toText(value);
    if (!txt) return [];
    return txt
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return toText(value[0]);
  }

  return toText(value);
}

function mergeValue(field: GhField, answer: AnswerValue, hasAnswer: boolean, prefill: AnswerValue): AnswerValue {
  if (hasAnswer) return answer;
  if (field.type === "checkbox") return Array.isArray(prefill) ? prefill : [];
  return Array.isArray(prefill) ? prefill[0] ?? "" : prefill;
}

function pickResumeFieldName(fields: GhField[]) {
  const fileFields = fields.filter((field) => field.type === "file");
  if (!fileFields.length) return null;

  const namedResume = fileFields.find((field) => {
    const text = `${field.name} ${field.label}`.toLowerCase();
    return text.includes("resume") || text.includes("cv");
  });

  return namedResume?.name ?? fileFields[0].name;
}

function sanitizeSnippet(text: string, maxLen = 300) {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLen);
}

function detectGreenhouseOutcome(html: string, finalUrl?: string | null) {
  const normalizedText = sanitizeSnippet(html, 5000);
  const successByConfirmationUrl = finalUrl ? /\/(confirmation|thank|submitted)/i.test(finalUrl) : false;

  const successPatterns = [
    /\/confirmation/i,
    /thank you/i,
    /application submitted/i,
    /we (?:have|['’]ve) received/i,
    /your application has been received/i,
    /thanks for applying/i,
  ];
  const successByHtml = /\/confirmation/i.test(html) || successPatterns.some((re) => re.test(normalizedText));

  const hasCaptchaIndicators = /captcha|turnstile|cloudflare/i.test(normalizedText);

  return {
    ok: successByConfirmationUrl || successByHtml,
    hasCaptchaIndicators,
    reason: hasCaptchaIndicators ? "Captcha detected" : sanitizeSnippet(html, 200),
    errorSnippet: sanitizeSnippet(html, 220),
  };
}

async function tryGreenhouseFastPath(args: {
  jobUrl: string;
  answers: AnswersMap;
  userProfile: unknown;
  resume?: { fileName: string; blob: Uint8Array<ArrayBufferLike> | Buffer } | null;
}) {
  const form = await parseGreenhouseForm(args.jobUrl);
  if (!Array.isArray(form.fields) || form.fields.length === 0) {
    return { ok: false as const, reason: "No fields parsed; cannot submit." };
  }

  const { prefillValues } = mapProfileToForm(form.fields, args.userProfile as never);

  const finalValuesToSubmit: AnswersMap = {};
  const missingRequired: string[] = [];

  for (const field of form.fields) {
    const hasAnswer = Object.prototype.hasOwnProperty.call(args.answers, field.name);
    const answerValue = normalizeAnswer(args.answers[field.name], field);
    const prefillValue = normalizeAnswer(prefillValues[field.name], field);
    const finalValue = mergeValue(field, answerValue, hasAnswer, prefillValue);

    finalValuesToSubmit[field.name] = finalValue;

    if (field.required) {
      if (field.type === "file") {
        if (!args.resume) missingRequired.push(field.name);
      } else if (Array.isArray(finalValue)) {
        if (finalValue.length === 0) missingRequired.push(field.name);
      } else if (!finalValue) {
        missingRequired.push(field.name);
      }
    }
  }

  if (missingRequired.length > 0) {
    return {
      ok: false as const,
      reason: "Please complete all required fields before applying.",
      missingRequired,
    };
  }

  const method = String(form.method || "").trim().toUpperCase();
  if (method !== "POST") {
    return { ok: false as const, reason: "Submit endpoint not resolved" };
  }

  const fd = new FormData();
  Object.entries(form.hidden).forEach(([key, value]) => fd.append(key, String(value)));

  for (const field of form.fields) {
    if (field.type === "file") continue;
    const value = finalValuesToSubmit[field.name];
    if (Array.isArray(value)) {
      value.forEach((item) => fd.append(field.name, item));
    } else {
      fd.set(field.name, value ?? "");
    }
  }

  const resumeFieldName = pickResumeFieldName(form.fields);
  if (args.resume && resumeFieldName) {
    fd.set(resumeFieldName, new Blob([args.resume.blob], { type: "application/pdf" }), args.resume.fileName || "resume.pdf");
  }

  const submitRes = await fetch(form.action, { method: "POST", body: fd, redirect: "follow" });
  const responseHtml = await submitRes.text();
  const outcome = detectGreenhouseOutcome(responseHtml, submitRes.url);

  console.info("[apply] greenhouse fast path", {
    statusCode: submitRes.status,
    finalUrl: submitRes.url,
    ok: outcome.ok,
    hasCaptchaIndicators: outcome.hasCaptchaIndicators,
  });

  if (!submitRes.ok || !outcome.ok) {
    return {
      ok: false as const,
      reason: outcome.reason,
      finalUrl: submitRes.url,
      errorSnippet: outcome.errorSnippet,
    };
  }

  return { ok: true as const, finalUrl: submitRes.url };
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await req.json()) as ApplyBody;
    const requestAnswers = body.answers ?? {};

    const application = await prisma.jobApplication.findFirst({
      where: { id, userProfile: { userId } },
      include: { userProfile: true },
    });

    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    }

    if (!application.jobUrl) {
      return NextResponse.json({ ok: false, error: "Application missing jobUrl" }, { status: 400 });
    }

    const savedAnswers = (application.answersJson as AnswersMap | null) ?? {};
    const answers: AnswersMap = { ...savedAnswers, ...requestAnswers };
    const resume = await prisma.resumeFile.findFirst({
      where: {
        profileId: application.userProfileId,
        mimeType: "application/pdf",
      },
      orderBy: { createdAt: "desc" },
    });

    const resumePayload = resume
      ? {
          fileName: resume.fileName || "resume.pdf",
          mimeType: resume.mimeType,
          buffer: Buffer.from(resume.blob as Uint8Array<ArrayBufferLike>),
        }
      : undefined;

    let result:
      | { ok: true; finalUrl?: string }
      | { ok: false; reason?: string; finalUrl?: string; screenshotPath?: string; htmlSnippet?: string };

    if (isGreenhouseBoardUrl(application.jobUrl)) {
      const greenhouse = await tryGreenhouseFastPath({
        jobUrl: application.jobUrl,
        answers,
        userProfile: application.userProfile,
        resume: resume ? { fileName: resume.fileName || "resume.pdf", blob: resume.blob } : null,
      });

      if (greenhouse.ok) {
        result = { ok: true, finalUrl: greenhouse.finalUrl };
      } else {
        console.info("[apply] greenhouse fast path failed, falling back to playwright", {
          reason: greenhouse.reason,
          finalUrl: greenhouse.finalUrl,
        });
        const pwResult = await applyWithPlaywright({
          jobUrl: application.jobUrl,
          answers,
          resume: resumePayload,
          timeoutMs: 90_000,
        });
        result = pwResult;
      }
    } else {
      result = await applyWithPlaywright({
        jobUrl: application.jobUrl,
        answers,
        resume: resumePayload,
        timeoutMs: 90_000,
      });
    }

    if (result.ok) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "SENT",
          submittedAt: new Date(),
          answersJson: answers,
        },
      });

      return NextResponse.json({ ok: true, status: "SENT", finalUrl: result.finalUrl });
    }

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status: "READY_TO_SEND",
        answersJson: answers,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Auto-apply failed",
        reason: result.reason,
        finalUrl: result.finalUrl,
        screenshotPath: result.screenshotPath,
        htmlSnippet: result.htmlSnippet,
      },
      { status: 502 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
