import { unlink } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { applyWithOpenClaw } from "@/app/lib/apply/openclawApply";
import { writeResumeToTemp } from "@/app/lib/apply/tempResume";
import {
  createSession,
  updateSession,
} from "@/app/lib/apply/applySessionStore";
import {
  prepareApplyPayload,
  type AnswersMap,
} from "@/app/lib/apply/prepareApplyPayload";
import {
  buildAutomationAudit,
  readAutomationAudit,
} from "@/app/lib/apply/automationAudit";
import { sendApplicationActivityEmailForStatusChange } from "@/app/lib/email/lifecycle";
import {
  buildProfileFieldMap,
  computeMissingFromFields,
} from "@/app/lib/jobApplicationAudit";
import { detectApplyProviderFromJob } from "@/app/lib/apply/providerDetection";
import { requireRemoteBrowserConfig } from "@/app/lib/apply/remoteBrowser";

export const runtime = "nodejs";

type ApplyBody = {
  answers?: AnswersMap;
  background?: boolean;
};

async function findApplicationForUser(id: string, userId: string) {
  return prisma.jobApplication.findFirst({
    where: { id, userProfile: { userId } },
    include: { userProfile: true },
  });
}

type LoadedApplication = NonNullable<
  Awaited<ReturnType<typeof findApplicationForUser>>
>;

function toHostedAnswersMap(values: Record<string, unknown>): AnswersMap {
  const entries = Object.entries(values)
    .filter(([key]) => key !== "resumeUploaded")
    .map(([key, value]) => [key, String(value ?? "").trim()] as const);

  return Object.fromEntries(entries);
}

async function sendStatusChangeEmail(args: {
  applicationId: string;
  previousStatus: string;
  nextStatus: string;
  logPrefix: string;
}) {
  await sendApplicationActivityEmailForStatusChange({
    applicationId: args.applicationId,
    previousStatus: args.previousStatus,
    nextStatus: args.nextStatus,
  }).catch((error) => {
    console.warn(`${args.logPrefix} status email failed`, {
      applicationId: args.applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function prepareAutomationInput(args: {
  application: LoadedApplication;
  requestAnswers?: AnswersMap;
}) {
  const application = args.application;
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
      (args.requestAnswers as Record<string, unknown> | undefined) ?? {},
    );
    const answers = toHostedAnswersMap(computed.merged);

    return {
      applyProvider,
      answers,
      finalValuesToSubmit: answers,
      targetUrl: application.jobUrl ?? undefined,
      missingRequired: computed.missing,
    };
  }

  const { answers, finalValuesToSubmit, greenhouseEmbedUrl } =
    await prepareApplyPayload({
      jobUrl: application.jobUrl ?? "",
      profile: application.userProfile,
      savedAnswers: (application.answersJson as AnswersMap | null) ?? {},
      requestAnswers: args.requestAnswers ?? {},
    });

  return {
    applyProvider,
    answers,
    finalValuesToSubmit,
    targetUrl: greenhouseEmbedUrl ?? application.jobUrl ?? undefined,
    missingRequired: [] as string[],
  };
}

function buildMissingAudit(args: {
  application: { auditJson: Prisma.JsonValue | null; source: string | null };
  applyProvider: string | null;
  finalValuesToSubmit: AnswersMap;
  missingRequired: string[];
}) {
  return buildAutomationAudit({
    existingAudit: args.application.auditJson,
    provider: args.applyProvider ?? args.application.source ?? "openclaw",
    finalValuesToSubmit: args.finalValuesToSubmit,
    missing: args.missingRequired,
    automation: {
      provider: "openclaw",
      status: "FAILED",
      message: "Missing required profile fields.",
      finalReason: "missing_required_fields",
    },
  });
}

async function persistAutomationOutcome(args: {
  application: LoadedApplication;
  previousStatus: string;
  applyProvider: string | null;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  result: Awaited<ReturnType<typeof applyWithOpenClaw>>;
}) {
  const nextAudit = buildAutomationAudit({
    existingAudit: args.application.auditJson,
    provider: args.applyProvider ?? args.application.source ?? "openclaw",
    finalValuesToSubmit: args.finalValuesToSubmit,
    automation: {
      provider: "openclaw",
      status: args.result.status,
      finalUrl: args.result.finalUrl ?? null,
      message: args.result.message ?? null,
      finalReason: args.result.debug.finalReason ?? null,
      formDetected: args.result.debug.formDetected,
      confirmationDetected: args.result.debug.confirmationDetected,
      verificationDetected: args.result.debug.verificationDetected,
      debug: args.result.debug,
    },
  });

  if (args.result.ok) {
    const updatedApplication = await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        status: "SENT",
        submittedAt: new Date(),
        answersJson: args.answers,
        auditJson: nextAudit as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        status: true,
      },
    });

    await sendStatusChangeEmail({
      applicationId: updatedApplication.id,
      previousStatus: args.previousStatus,
      nextStatus: updatedApplication.status,
      logPrefix: "[OPENCLAW_APPLY]",
    });

    return updatedApplication;
  }

  const updatedApplication = await prisma.jobApplication.update({
    where: { id: args.application.id },
    data: {
      status: "READY_TO_SEND",
      answersJson: args.answers,
      auditJson: nextAudit as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      status: true,
    },
  });

  await sendStatusChangeEmail({
    applicationId: updatedApplication.id,
    previousStatus: args.previousStatus,
    nextStatus: updatedApplication.status,
    logPrefix: "[OPENCLAW_APPLY]",
  });

  return updatedApplication;
}

async function runBackgroundApply(args: {
  application: LoadedApplication;
  applySessionId: string;
  applyProvider: string | null;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  targetUrl?: string;
}) {
  const tempResume = await writeResumeToTemp(args.application.userProfileId);

  try {
    const result = await applyWithOpenClaw({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      jobUrl: args.application.jobUrl ?? "",
      embedUrl: args.targetUrl,
      values: args.finalValuesToSubmit,
      resumePath: tempResume?.path ?? null,
      onStatus: ({ status, lastUrl, error, message, debug }) => {
        updateSession(args.applySessionId, {
          status,
          lastUrl,
          error,
          message,
          debug,
        });
      },
    });

    await persistAutomationOutcome({
      application: args.application,
      previousStatus: args.application.status,
      applyProvider: args.applyProvider,
      answers: args.answers,
      finalValuesToSubmit: args.finalValuesToSubmit,
      result,
    });

    updateSession(args.applySessionId, {
      status: result.status,
      lastUrl: result.finalUrl,
      error: result.status === "FAILED" ? result.message : undefined,
      message: result.message,
      debug: result.debug,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "OpenClaw automation failed.";

    console.error("[OPENCLAW_APPLY] background apply failed", {
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      error: message,
    });

    const existingAudit = readAutomationAudit(args.application.auditJson).audit;
    const nextAudit = buildAutomationAudit({
      existingAudit,
      provider: args.applyProvider ?? args.application.source ?? "openclaw",
      finalValuesToSubmit: args.finalValuesToSubmit,
      automation: {
        provider: "openclaw",
        status: "FAILED",
        message,
        finalReason: "openclaw_error",
      },
    });

    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        status: "READY_TO_SEND",
        answersJson: args.answers,
        auditJson: nextAudit as Prisma.InputJsonValue,
      },
    });

    updateSession(args.applySessionId, {
      status: "FAILED",
      error: message,
      message,
    });
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
    requireRemoteBrowserConfig();

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

    const application = await findApplicationForUser(id, userId);

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

    const prepared = await prepareAutomationInput({
      application,
      requestAnswers: body.answers,
    });

    if (prepared.missingRequired.length > 0) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "IN_PREPARATION",
          answersJson: prepared.answers,
          auditJson: buildMissingAudit({
            application,
            applyProvider: prepared.applyProvider,
            finalValuesToSubmit: prepared.finalValuesToSubmit,
            missingRequired: prepared.missingRequired,
          }) as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Missing required profile fields.",
          missingRequired: prepared.missingRequired,
        },
        { status: 409 },
      );
    }

    if (body.background) {
      const applySession = createSession(application.id);

      updateSession(applySession.id, {
        status: "STARTING",
        lastUrl: prepared.targetUrl,
        message: "Starting OpenClaw automation.",
      });

      void runBackgroundApply({
        application,
        applySessionId: applySession.id,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        targetUrl: prepared.targetUrl,
      });

      return NextResponse.json({
        ok: true,
        applySessionId: applySession.id,
        status: "STARTING",
      });
    }

    const tempResume = await writeResumeToTemp(application.userProfileId);

    try {
      const result = await applyWithOpenClaw({
        applicationId: application.id,
        jobUrl: application.jobUrl,
        embedUrl: prepared.targetUrl,
        values: prepared.finalValuesToSubmit,
        resumePath: tempResume?.path ?? null,
      });

      await persistAutomationOutcome({
        application,
        previousStatus: application.status,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        result,
      });

      if (result.ok) {
        return NextResponse.json({
          ok: true,
          status: "SENT",
          finalUrl: result.finalUrl,
        });
      }

      if (result.unavailable) {
        return NextResponse.json(
          {
            ok: false,
            status: "AUTO_APPLY_UNAVAILABLE",
            error:
              result.message ??
              "Auto apply is not available for this job application.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          ok: false,
          status: "FAILED",
          error: result.message ?? "OpenClaw automation failed.",
        },
        { status: 502 },
      );
    } finally {
      if (tempResume?.path) {
        await unlink(tempResume.path).catch(() => undefined);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";

    console.error("[OPENCLAW_APPLY] request failed", {
      error: message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
