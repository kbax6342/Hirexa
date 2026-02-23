import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm, type GhField } from "@/app/lib/greenhouse/parseGreenhouseForm";
import { applyWithPlaywright, type PlaywrightApplyResult } from "@/app/lib/apply/playwrightApply";
import { writeResumeToTemp } from "@/app/lib/apply/tempResume";

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

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (process.env.PLAYWRIGHT_ENABLED !== "true") {
      return NextResponse.json(
        {
          ok: false,
          error: 'Playwright apply is disabled. Set PLAYWRIGHT_ENABLED="true".',
        },
        { status: 501 }
      );
    }

    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await req.json()) as ApplyBody;

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
    const requestAnswers = body.answers ?? {};
    const answers: AnswersMap = { ...savedAnswers, ...requestAnswers };

    let finalValuesToSubmit: AnswersMap = { ...answers };
    let greenhouseEmbedUrl: string | undefined;

    if (isGreenhouseBoardUrl(application.jobUrl)) {
      try {
        const form = await parseGreenhouseForm(application.jobUrl);
        greenhouseEmbedUrl = form.embedUrl;
        const { prefillValues } = mapProfileToForm(form.fields, application.userProfile);
        finalValuesToSubmit = {};

        for (const field of form.fields) {
          const hasAnswer = Object.prototype.hasOwnProperty.call(answers, field.name);
          const answerValue = normalizeAnswer(answers[field.name], field);
          const prefillValue = normalizeAnswer(prefillValues[field.name], field);
          finalValuesToSubmit[field.name] = mergeValue(field, answerValue, hasAnswer, prefillValue);
        }
      } catch (error) {
        console.log("[REMOTE_APPLY] greenhouse parse failed, using merged answers", {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const tempResume = await writeResumeToTemp(application.userProfileId);

    console.log("[REMOTE_APPLY] start", {
      jobUrl: application.jobUrl,
      valuesCount: Object.keys(finalValuesToSubmit).length,
      hasResume: Boolean(tempResume?.path),
    });

    let result: PlaywrightApplyResult;
    try {
      result = await applyWithPlaywright({
        jobUrl: application.jobUrl,
        form: { embedUrl: greenhouseEmbedUrl },
        values: finalValuesToSubmit,
        resumePath: tempResume?.path ?? null,
      });
    } finally {
      if (tempResume?.path) {
        await unlink(tempResume.path).catch(() => undefined);
      }
    }

    const playwrightAudit = {
      finalValuesToSubmit,
      playwright: result.debug ?? null,
    };

    if (result.ok) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "SENT",
          submittedAt: new Date(),
          answersJson: answers,
          auditJson: playwrightAudit,
        },
      });

      return NextResponse.json({ ok: true, status: "SENT", finalUrl: result.finalUrl });
    }

    if (result.needsHuman) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "READY_TO_SEND",
          answersJson: answers,
          auditJson: playwrightAudit,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          needsHuman: true,
          viewerUrl: result.viewerUrl ?? result.debug?.viewerUrl,
          openUrl: result.openUrl ?? result.debug?.targetUrl ?? greenhouseEmbedUrl ?? application.jobUrl,
          message: "Almost done — please complete verification and click Submit in the live window.",
          sessionId: result.debug?.sessionId,
        },
        { status: 409 }
      );
    }

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status: "READY_TO_SEND",
        answersJson: answers,
        auditJson: playwrightAudit,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        error: result.message ?? "Submission could not be confirmed.",
        debug: result.debug,
      },
      { status: 502 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
