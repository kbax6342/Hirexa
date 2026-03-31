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
import { sendApplicationActivityEmailForStatusChange } from "@/app/lib/email/lifecycle";
import {
  buildProfileFieldMap,
  computeMissingFromFields,
} from "@/app/lib/jobApplicationAudit";
import { runApplyMode } from "@/app/lib/playwright/applyRunner";
import { detectApplyProviderFromJob } from "@/app/lib/apply/providerDetection";

export const runtime = "nodejs";

type ApplyBody = {
  answers?: AnswersMap;
};

function toHostedAnswersMap(values: Record<string, unknown>): AnswersMap {
  const entries = Object.entries(values)
    .filter(([key]) => key !== "resumeUploaded")
    .map(([key, value]) => [key, String(value ?? "").trim()] as const);

  return Object.fromEntries(entries);
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

    const applyProvider = detectApplyProviderFromJob({
      source: application.source,
      jobUrl: application.jobUrl,
    });

    if (applyProvider === "ashby") {
      const resume = await prisma.resumeFile.findFirst({
        where: { profileId: application.userProfileId },
        orderBy: { createdAt: "desc" },
      });

      const fields = buildProfileFieldMap(application.userProfile, resume);
      const computed = computeMissingFromFields(
        fields,
        (body.answers as Record<string, unknown> | undefined) ?? {}
      );
      const answers = toHostedAnswersMap(computed.merged);

      if (computed.missing.length > 0) {
        await prisma.jobApplication.update({
          where: { id: application.id },
          data: {
            status: "IN_PREPARATION",
            answersJson: answers,
            auditJson: {
              provider: applyProvider,
              finalValuesToSubmit: answers,
              missing: computed.missing,
            },
          },
        });

        return NextResponse.json(
          {
            ok: false,
            error: "Missing required profile fields.",
            missingRequired: computed.missing,
          },
          { status: 409 }
        );
      }

      const tempResume = await writeResumeToTemp(application.userProfileId);

      try {
        const result = await runApplyMode({
          jobUrl: application.jobUrl,
          values: answers,
          resumePath: tempResume?.path ?? null,
        });

        if (result.ok) {
          const updatedApplication = await prisma.jobApplication.update({
            where: { id: application.id },
            data: {
              status: "SENT",
              submittedAt: new Date(),
              answersJson: answers,
              auditJson: {
                provider: applyProvider,
                finalValuesToSubmit: answers,
                submissionProof: result.submissionProof,
              },
            },
            select: {
              id: true,
              status: true,
            },
          });
          await sendApplicationActivityEmailForStatusChange({
            applicationId: updatedApplication.id,
            previousStatus: application.status,
            nextStatus: updatedApplication.status,
          }).catch((error) => {
            console.warn("[applications/apply] status email failed", {
              applicationId: application.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });

          return NextResponse.json({
            ok: true,
            status: "SENT",
            finalUrl: result.submissionProof.url,
          });
        }

        if (result.verificationRequired) {
          const updatedApplication = await prisma.jobApplication.update({
            where: { id: application.id },
            data: {
              status: "READY_TO_SEND",
              answersJson: answers,
              auditJson: {
                provider: applyProvider,
                finalValuesToSubmit: answers,
                verificationRequired: true,
                reason: result.reason,
              },
            },
            select: {
              id: true,
              status: true,
            },
          });
          await sendApplicationActivityEmailForStatusChange({
            applicationId: updatedApplication.id,
            previousStatus: application.status,
            nextStatus: updatedApplication.status,
          }).catch((error) => {
            console.warn("[applications/apply] status email failed", {
              applicationId: application.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });

          return NextResponse.json(
            {
              ok: false,
              needsHuman: true,
              openUrl: application.jobUrl,
              message:
                "Ashby requires manual verification in the hosted form. Open the application, complete verification, and finish submit there.",
            },
            { status: 409 }
          );
        }

        const updatedApplication = await prisma.jobApplication.update({
          where: { id: application.id },
          data: {
            status: "READY_TO_SEND",
            answersJson: answers,
            auditJson: {
              provider: applyProvider,
              finalValuesToSubmit: answers,
              reason: result.reason,
            },
          },
          select: {
            id: true,
            status: true,
          },
        });
        await sendApplicationActivityEmailForStatusChange({
          applicationId: updatedApplication.id,
          previousStatus: application.status,
          nextStatus: updatedApplication.status,
        }).catch((error) => {
          console.warn("[applications/apply] status email failed", {
            applicationId: application.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });

        return NextResponse.json(
          {
            ok: false,
            error: result.reason ?? "Submission could not be confirmed.",
          },
          { status: 502 }
        );
      } finally {
        if (tempResume?.path) {
          await unlink(tempResume.path).catch(() => undefined);
        }
      }
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
      const updatedApplication = await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "SENT",
          submittedAt: new Date(),
          answersJson: answers,
          auditJson: playwrightAudit,
        },
        select: {
          id: true,
          status: true,
        },
      });
      await sendApplicationActivityEmailForStatusChange({
        applicationId: updatedApplication.id,
        previousStatus: application.status,
        nextStatus: updatedApplication.status,
      }).catch((error) => {
        console.warn("[applications/apply] status email failed", {
          applicationId: application.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      return NextResponse.json({
        ok: true,
        status: "SENT",
        finalUrl: result.finalUrl,
      });
    }

    if (result.needsHuman) {
      const updatedApplication = await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "READY_TO_SEND",
          answersJson: answers,
          auditJson: playwrightAudit,
        },
        select: {
          id: true,
          status: true,
        },
      });
      await sendApplicationActivityEmailForStatusChange({
        applicationId: updatedApplication.id,
        previousStatus: application.status,
        nextStatus: updatedApplication.status,
      }).catch((error) => {
        console.warn("[applications/apply] status email failed", {
          applicationId: application.id,
          error: error instanceof Error ? error.message : String(error),
        });
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

    const updatedApplication = await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status: "READY_TO_SEND",
        answersJson: answers,
        auditJson: playwrightAudit,
      },
      select: {
        id: true,
        status: true,
      },
    });
    await sendApplicationActivityEmailForStatusChange({
      applicationId: updatedApplication.id,
      previousStatus: application.status,
      nextStatus: updatedApplication.status,
    }).catch((error) => {
      console.warn("[applications/apply] status email failed", {
        applicationId: application.id,
        error: error instanceof Error ? error.message : String(error),
      });
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
