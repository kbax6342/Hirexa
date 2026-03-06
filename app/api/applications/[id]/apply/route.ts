import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import {
  applyWithPlaywright,
  type PlaywrightApplyResult,
} from "@/app/lib/apply/playwrightApply";
import { writeResumeToTemp } from "@/app/lib/apply/tempResume";
import {
  prepareApplyPayload,
  type AnswersMap,
} from "@/app/lib/apply/prepareApplyPayload";

export const runtime = "nodejs";

type ApplyBody = {
  answers?: AnswersMap;
};

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
        mode: "AUTO",
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

      return NextResponse.json({
        ok: true,
        status: "SENT",
        finalUrl: result.finalUrl,
      });
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
          openUrl:
            result.openUrl ??
            result.debug?.targetUrl ??
            greenhouseEmbedUrl ??
            application.jobUrl,
          message:
            "Almost done — please complete verification and click Submit in the live window.",
          sessionId: result.debug?.sessionId,
        },
        { status: 409 },
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
      { status: 502 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
