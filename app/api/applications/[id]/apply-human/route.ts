import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { applyWithPlaywright } from "@/app/lib/apply/playwrightApply";
import { writeResumeToTemp } from "@/app/lib/apply/tempResume";
import {
  createSession,
  setSessionRuntime,
  updateSession,
  closeSessionRuntime,
} from "@/app/lib/apply/applySessionStore";
import {
  prepareApplyPayload,
  type AnswersMap,
} from "@/app/lib/apply/prepareApplyPayload";
import { sendApplicationActivityEmailForStatusChange } from "@/app/lib/email/lifecycle";

export const runtime = "nodejs";

type ApplyBody = {
  answers?: AnswersMap;
};

async function runHumanApply(args: {
  applicationId: string;
  sessionId: string;
  jobUrl: string;
  embedUrl?: string;
  values: AnswersMap;
  answers: AnswersMap;
  userProfileId: string;
  previousStatus: string;
}) {
  const tempResume = await writeResumeToTemp(args.userProfileId);

  try {
    const result = await applyWithPlaywright({
      jobUrl: args.jobUrl,
      form: { embedUrl: args.embedUrl },
      values: args.values,
      resumePath: tempResume?.path ?? null,
      mode: "HUMAN_ASSIST",
      onPageReady: (page, context) => {
        setSessionRuntime(args.sessionId, { page, context });
      },
      onStatus: ({ status, lastUrl, error }) => {
        updateSession(args.sessionId, {
          status,
          lastUrl,
          error,
        });
      },
    });

    const playwrightAudit = {
      finalValuesToSubmit: args.values,
      playwright: result.debug ?? {
        finalUrl: result.finalUrl,
        success: result.ok,
        needsHuman: Boolean(result.needsHuman),
      },
    };

    if (result.ok) {
      const updatedApplication = await prisma.jobApplication.update({
        where: { id: args.applicationId },
        data: {
          status: "SENT",
          submittedAt: new Date(),
          answersJson: args.answers,
          auditJson: playwrightAudit,
        },
        select: {
          id: true,
          status: true,
        },
      });
      await sendApplicationActivityEmailForStatusChange({
        applicationId: updatedApplication.id,
        previousStatus: args.previousStatus,
        nextStatus: updatedApplication.status,
      }).catch((error) => {
        console.warn("[applications/apply-human] status email failed", {
          applicationId: args.applicationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      updateSession(args.sessionId, {
        status: "DONE",
        lastUrl: result.finalUrl ?? undefined,
      });
      await closeSessionRuntime(args.sessionId);
      return;
    }

    if (result.needsHuman) {
      const updatedApplication = await prisma.jobApplication.update({
        where: { id: args.applicationId },
        data: {
          status: "READY_TO_SEND",
          answersJson: args.answers,
          auditJson: playwrightAudit,
        },
        select: {
          id: true,
          status: true,
        },
      });
      await sendApplicationActivityEmailForStatusChange({
        applicationId: updatedApplication.id,
        previousStatus: args.previousStatus,
        nextStatus: updatedApplication.status,
      }).catch((error) => {
        console.warn("[applications/apply-human] status email failed", {
          applicationId: args.applicationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      updateSession(args.sessionId, {
        status: "WAITING_HUMAN",
        lastUrl: result.finalUrl ?? undefined,
      });
      return;
    }

    const updatedApplication = await prisma.jobApplication.update({
      where: { id: args.applicationId },
      data: {
        status: "READY_TO_SEND",
        answersJson: args.answers,
        auditJson: playwrightAudit,
      },
      select: {
        id: true,
        status: true,
      },
    });
    await sendApplicationActivityEmailForStatusChange({
      applicationId: updatedApplication.id,
      previousStatus: args.previousStatus,
      nextStatus: updatedApplication.status,
    }).catch((error) => {
      console.warn("[applications/apply-human] status email failed", {
        applicationId: args.applicationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    updateSession(args.sessionId, {
      status: "FAILED",
      error: result.message ?? "Submission could not be confirmed.",
    });
    await closeSessionRuntime(args.sessionId);
  } catch (error: unknown) {
    updateSession(args.sessionId, {
      status: "FAILED",
      error:
        error instanceof Error ? error.message : "Human assist apply failed.",
    });
    await closeSessionRuntime(args.sessionId);
  } finally {
    if (tempResume?.path) {
      await unlink(tempResume.path).catch(() => undefined);
    }
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (process.env.PLAYWRIGHT_ENABLED !== "true") {
      return NextResponse.json(
        {
          ok: false,
          error: 'Playwright apply is disabled. Set PLAYWRIGHT_ENABLED="true".',
        },
        { status: 501 },
      );
    }

    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const body = (await req.json()) as ApplyBody;

    const application = await prisma.jobApplication.findFirst({
      where: { id, userProfile: { userId } },
      include: { userProfile: true },
    });

    if (!application) {
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 },
      );
    }

    if (!application.jobUrl) {
      return NextResponse.json(
        { ok: false, error: "Application missing jobUrl" },
        { status: 400 },
      );
    }

    const { answers, finalValuesToSubmit, greenhouseEmbedUrl } =
      await prepareApplyPayload({
        jobUrl: application.jobUrl,
        profile: application.userProfile,
        savedAnswers: (application.answersJson as AnswersMap | null) ?? {},
        requestAnswers: body.answers ?? {},
      });

    const applySession = createSession(application.id);

    void runHumanApply({
      applicationId: application.id,
      sessionId: applySession.id,
      jobUrl: application.jobUrl,
      embedUrl: greenhouseEmbedUrl,
      values: finalValuesToSubmit,
      answers,
      userProfileId: application.userProfileId,
      previousStatus: application.status,
    });

    return NextResponse.json({
      ok: true,
      applySessionId: applySession.id,
      status: "WAITING_HUMAN",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
