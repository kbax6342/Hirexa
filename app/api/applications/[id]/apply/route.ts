import { unlink } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import {
  createSession,
  getApplySessionStorageBackend,
  type ApplyEmailStatus,
  type ApplySessionDebug,
  type ApplySubmissionStatus,
  updateSession,
} from "@/app/lib/apply/applySessionStore";
import {
  buildAutomationAudit,
  readAutomationAudit,
} from "@/app/lib/apply/automationAudit";
import {
  applyWithPlaywright,
  toApplySessionDebug,
} from "@/app/lib/apply/playwrightApply";
import {
  prepareApplyPayload,
  type AnswersMap,
} from "@/app/lib/apply/prepareApplyPayload";
import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";
import { writeResumeToTemp } from "@/app/lib/apply/tempResume";
import { detectApplyProviderFromJob } from "@/app/lib/apply/providerDetection";
import { normalizeEmailError } from "@/app/lib/email/errorDiagnostics";
import { sendApplicationActivityEmailForStatusChange } from "@/app/lib/email/lifecycle";
import {
  buildProfileFieldMap,
  computeMissingFromFields,
} from "@/app/lib/jobApplicationAudit";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type ApplyBody = {
  answers?: AnswersMap;
  background?: boolean;
};

type ApplyExecutionResult = {
  ok: boolean;
  status: ApplySessionStatus;
  finalUrl?: string;
  message?: string;
  unavailable?: boolean;
  needsHuman?: boolean;
  debug: ApplySessionDebug;
  rawStatus: ApplySessionStatus;
  rawSubmissionConfirmed: boolean;
};

type StatusChangeEmailResult = {
  emailStatus: ApplyEmailStatus;
  failureMessage?: string | null;
};

type PersistAutomationOutcomeResult = {
  submissionStatus: ApplySubmissionStatus;
  emailStatus: ApplyEmailStatus;
  message?: string;
  result: ApplyExecutionResult;
};

type RawPlaywrightResult = Awaited<ReturnType<typeof applyWithPlaywright>>;

type RoutePlaywrightEvidence = {
  applyCtaClicked: boolean;
  hopCount: number;
  currentUrl: string | null;
  targetUrl: string | null;
  submitButtonClicked: boolean;
  confirmationTextFound: boolean;
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

function normalizePlaywrightResult(
  result: Awaited<ReturnType<typeof applyWithPlaywright>>,
): ApplyExecutionResult {
  const debug =
    toApplySessionDebug(result.debug) ??
    ({
      finalReason:
        result.message ??
        result.status.toLowerCase(),
    } satisfies ApplySessionDebug);

  return {
    ok: result.ok,
    status: result.status,
    finalUrl: result.finalUrl ?? result.openUrl,
    message: result.message,
    unavailable: result.unavailable,
    needsHuman: result.needsHuman,
    debug,
    rawStatus: result.status,
    rawSubmissionConfirmed: result.debug?.submissionConfirmed ?? result.ok,
  };
}

function readRoutePlaywrightEvidence(result: RawPlaywrightResult): RoutePlaywrightEvidence {
  return {
    applyCtaClicked: result.debug?.applyCtaClicked === true,
    hopCount:
      typeof result.debug?.hopCount === "number" ? result.debug.hopCount : 0,
    currentUrl:
      result.debug?.currentUrl ?? result.finalUrl ?? result.openUrl ?? null,
    targetUrl: result.debug?.targetUrl ?? null,
    submitButtonClicked: result.debug?.submitButtonClicked === true,
    confirmationTextFound: result.debug?.confirmationTextFound === true,
  };
}

function shouldForceApplyNotStarted(evidence: RoutePlaywrightEvidence) {
  return (
    !evidence.applyCtaClicked &&
    evidence.hopCount === 0 &&
    evidence.currentUrl !== null &&
    evidence.targetUrl !== null &&
    evidence.currentUrl === evidence.targetUrl &&
    evidence.submitButtonClicked !== true &&
    evidence.confirmationTextFound !== true
  );
}

function applyRouteLevelSubmissionGuard(args: {
  rawResult: RawPlaywrightResult;
  applicationId: string;
  phase: "background" | "foreground";
  applySessionId?: string;
}) {
  const evidence = readRoutePlaywrightEvidence(args.rawResult);
  const rawStatus = args.rawResult.status;
  const rawSubmissionConfirmed =
    args.rawResult.debug?.submissionConfirmed ?? args.rawResult.ok;

  console.log("[AUTO_APPLY_ROUTE] playwright raw result", {
    applicationId: args.applicationId,
    phase: args.phase,
    applySessionId: args.applySessionId ?? null,
    rawStatus,
    rawSubmissionConfirmed,
    finalUrl: args.rawResult.finalUrl ?? args.rawResult.openUrl ?? null,
    applyCtaClicked: evidence.applyCtaClicked,
    hopCount: evidence.hopCount,
    currentUrl: evidence.currentUrl,
    targetUrl: evidence.targetUrl,
    submitButtonClicked: evidence.submitButtonClicked,
    confirmationTextFound: evidence.confirmationTextFound,
  });

  let guardedResult = args.rawResult;
  if (shouldForceApplyNotStarted(evidence)) {
    guardedResult = {
      ...args.rawResult,
      ok: false,
      status: "APPLY_NOT_STARTED",
      unavailable: true,
      message:
        args.rawResult.message ??
        "Opened job page but could not start application.",
      debug: args.rawResult.debug
        ? {
            ...args.rawResult.debug,
            submissionConfirmed: false,
            finalStatus: "APPLY_NOT_STARTED",
            finalReason:
              args.rawResult.debug.finalReason ??
              "Route guard forced APPLY_NOT_STARTED for a no-interaction run.",
          }
        : args.rawResult.debug,
    };
  }

  const normalized = normalizePlaywrightResult(guardedResult);
  console.log("[AUTO_APPLY_ROUTE] playwright final promotion", {
    applicationId: args.applicationId,
    phase: args.phase,
    applySessionId: args.applySessionId ?? null,
    rawStatus,
    rawSubmissionConfirmed,
    finalStatus: normalized.status,
    finalSubmissionConfirmed: normalized.ok,
  });

  return {
    ...normalized,
    rawStatus,
    rawSubmissionConfirmed,
  };
}

function readExecutionEvidence(
  result: ApplyExecutionResult,
): RoutePlaywrightEvidence {
  return {
    applyCtaClicked: result.debug.applyCtaClicked === true,
    hopCount:
      typeof result.debug.hopCount === "number" ? result.debug.hopCount : 0,
    currentUrl: result.debug.currentUrl ?? result.finalUrl ?? null,
    targetUrl: result.debug.targetUrl ?? null,
    submitButtonClicked: result.debug.submitButtonClicked === true,
    confirmationTextFound: result.debug.confirmationTextFound === true,
  };
}

function applyFinalWriteGuard(args: {
  result: ApplyExecutionResult;
  applicationId: string;
  applySessionId?: string;
  storageTarget: "jobApplication" | "applySession";
}): ApplyExecutionResult {
  const evidence = readExecutionEvidence(args.result);
  if (!shouldForceApplyNotStarted(evidence)) {
    return args.result;
  }

  console.warn("[AUTO_APPLY_ROUTE] final write guard forced APPLY_NOT_STARTED", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    storageTarget: args.storageTarget,
    rawStatus: args.result.rawStatus,
    rawSubmissionConfirmed: args.result.rawSubmissionConfirmed,
    applyCtaClicked: evidence.applyCtaClicked,
    hopCount: evidence.hopCount,
    currentUrl: evidence.currentUrl,
    targetUrl: evidence.targetUrl,
    submitButtonClicked: evidence.submitButtonClicked,
    confirmationTextFound: evidence.confirmationTextFound,
  });

  return {
    ...args.result,
    ok: false,
    status: "APPLY_NOT_STARTED",
    unavailable: true,
    message:
      args.result.message ?? "Opened job page but could not start application.",
    debug: {
      ...args.result.debug,
      submissionConfirmed: false,
      finalReason:
        args.result.debug.finalReason ??
        "Final write guard forced APPLY_NOT_STARTED for a no-interaction run.",
    },
    rawStatus: args.result.rawStatus,
    rawSubmissionConfirmed: args.result.rawSubmissionConfirmed,
  };
}

function logFinalWrite(args: {
  applicationId: string;
  applySessionId?: string;
  rawStatus: string;
  rawSubmissionConfirmed: boolean;
  finalStatus: string;
  finalSubmissionConfirmed: boolean;
  emailStatus: ApplyEmailStatus;
  storageTarget: "jobApplication" | "applySession";
}) {
  console.info("[AUTO_APPLY_ROUTE] final write", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    rawStatus: args.rawStatus,
    rawSubmissionConfirmed: args.rawSubmissionConfirmed,
    finalStatus: args.finalStatus,
    finalSubmissionConfirmed: args.finalSubmissionConfirmed,
    emailStatus: args.emailStatus,
    storageTarget: args.storageTarget,
  });
}

async function sendStatusChangeEmail(args: {
  applicationId: string;
  previousStatus: string;
  nextStatus: string;
}): Promise<StatusChangeEmailResult> {
  try {
    const result = await sendApplicationActivityEmailForStatusChange({
      applicationId: args.applicationId,
      previousStatus: args.previousStatus,
      nextStatus: args.nextStatus,
    });

    return {
      emailStatus: result.sent ? "SENT" : "SKIPPED",
    };
  } catch (error) {
    const diagnostic = await normalizeEmailError(error);

    console.error("[AUTO_APPLY_EMAIL] confirmation email failed", {
      applicationId: args.applicationId,
      previousStatus: args.previousStatus,
      nextStatus: args.nextStatus,
      diagnostic,
    });

    return {
      emailStatus: "FAILED",
      failureMessage:
        args.nextStatus === "SENT"
          ? "Application submitted successfully, but the confirmation email could not be sent."
          : null,
    };
  }
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

function buildPreparationFailureAudit(args: {
  application: { auditJson: Prisma.JsonValue | null; source: string | null };
  applyProvider: string | null;
  finalValuesToSubmit: AnswersMap;
  missingRequired: string[];
  message: string;
  finalReason: string;
}) {
  return buildAutomationAudit({
    existingAudit: args.application.auditJson,
    provider: args.applyProvider ?? args.application.source ?? "playwright",
    finalValuesToSubmit: args.finalValuesToSubmit,
    missing: args.missingRequired,
    automation: {
      provider: "playwright",
      status: "FAILED",
      message: args.message,
      finalReason: args.finalReason,
    },
  });
}

function describeResumeFailure(tempResume: Awaited<ReturnType<typeof writeResumeToTemp>>) {
  const resumeIssue = tempResume.debug.resumeIssue;

  if (resumeIssue === "invalid_resume_non_pdf") {
    return {
      httpStatus: 422,
      finalReason: "invalid_resume_non_pdf",
      errorCode: "RESUME_INVALID_NON_PDF",
      missingRequired: ["resume"] as string[],
      message:
        "Auto Apply requires a PDF resume. Please upload a PDF resume to continue.",
    };
  }

  if (resumeIssue === "resume_staging_failed") {
    return {
      httpStatus: 500,
      finalReason: "resume_staging_failed",
      errorCode: "RESUME_STAGING_FAILED",
      missingRequired: [] as string[],
      message:
        "We found a resume on your profile but could not prepare it for Auto Apply. Please re-upload a PDF resume and try again.",
    };
  }

  return {
    httpStatus: 409,
    finalReason: "missing_resume",
    errorCode: "RESUME_REQUIRED",
    missingRequired: ["resume"] as string[],
    message: "Resume required for Auto Apply. Please upload a resume to continue.",
  };
}

async function persistPreparationFailure(args: {
  application: LoadedApplication;
  applyProvider: string | null;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  missingRequired: string[];
  message: string;
  finalReason: string;
}) {
  await prisma.jobApplication.update({
    where: { id: args.application.id },
    data: {
      status: "IN_PREPARATION",
      answersJson: args.answers,
      failureReason: args.message,
      verificationRequired: false,
      auditJson: buildPreparationFailureAudit({
        application: args.application,
        applyProvider: args.applyProvider,
        finalValuesToSubmit: args.finalValuesToSubmit,
        missingRequired: args.missingRequired,
        message: args.message,
        finalReason: args.finalReason,
      }) as Prisma.InputJsonValue,
    },
  });
}

async function persistAutomationOutcome(args: {
  application: LoadedApplication;
  previousStatus: string;
  applyProvider: string | null;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  result: ApplyExecutionResult;
  phase: "background" | "foreground";
  applySessionId?: string;
}): Promise<PersistAutomationOutcomeResult> {
  const finalResult = applyFinalWriteGuard({
    result: args.result,
    applicationId: args.application.id,
    applySessionId: args.applySessionId,
    storageTarget: "jobApplication",
  });
  const nextAudit = buildAutomationAudit({
    existingAudit: args.application.auditJson,
    provider: args.applyProvider ?? args.application.source ?? "playwright",
    finalValuesToSubmit: args.finalValuesToSubmit,
    automation: {
      provider: "playwright",
      status: finalResult.status,
      finalUrl: finalResult.finalUrl ?? null,
      message: finalResult.message ?? null,
      finalReason: finalResult.debug.finalReason ?? null,
      formDetected: finalResult.debug.formDetected,
      confirmationDetected: finalResult.debug.confirmationDetected,
      verificationDetected:
        finalResult.needsHuman ?? finalResult.debug.verificationDetected,
      debug: finalResult.debug,
    },
  });

  if (finalResult.ok) {
    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: finalResult.rawStatus,
      rawSubmissionConfirmed: finalResult.rawSubmissionConfirmed,
      finalStatus: "SENT",
      finalSubmissionConfirmed: true,
      emailStatus: "PENDING",
      storageTarget: "jobApplication",
    });

    const updatedApplication = await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        status: "SENT",
        submittedAt: new Date(),
        answersJson: args.answers,
        auditJson: nextAudit as Prisma.InputJsonValue,
        submissionProof: {
          provider: "playwright",
          finalUrl: finalResult.finalUrl ?? null,
          confirmedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        failureReason: null,
        verificationRequired: false,
      },
      select: {
        id: true,
        status: true,
      },
    });

    const emailResult = await sendStatusChangeEmail({
      applicationId: updatedApplication.id,
      previousStatus: args.previousStatus,
      nextStatus: updatedApplication.status,
    });

    return {
      submissionStatus: "SUBMITTED",
      emailStatus: emailResult.emailStatus,
      message:
        emailResult.failureMessage ??
        finalResult.message ??
        "Application submitted successfully.",
      result: finalResult,
    };
  }

  logFinalWrite({
    applicationId: args.application.id,
    applySessionId: args.applySessionId,
    rawStatus: finalResult.rawStatus,
    rawSubmissionConfirmed: finalResult.rawSubmissionConfirmed,
    finalStatus: "READY_TO_SEND",
    finalSubmissionConfirmed: false,
    emailStatus: "PENDING",
    storageTarget: "jobApplication",
  });

  const updatedApplication = await prisma.jobApplication.update({
    where: { id: args.application.id },
    data: {
      status: "READY_TO_SEND",
      answersJson: args.answers,
      auditJson: nextAudit as Prisma.InputJsonValue,
      failureReason:
        finalResult.message ?? finalResult.debug.finalReason ?? null,
      verificationRequired: Boolean(finalResult.needsHuman),
    },
    select: {
      id: true,
      status: true,
    },
  });

  const emailResult = await sendStatusChangeEmail({
    applicationId: updatedApplication.id,
    previousStatus: args.previousStatus,
    nextStatus: updatedApplication.status,
  });

  return {
    submissionStatus: "NOT_SUBMITTED",
    emailStatus: emailResult.emailStatus,
    message: finalResult.message,
    result: finalResult,
  };
}

async function runBackgroundApply(args: {
  application: LoadedApplication;
  applySessionId: string;
  applyProvider: string | null;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  targetUrl?: string;
  resumePath: string;
}) {
  try {
    const result = applyRouteLevelSubmissionGuard({
      rawResult: await applyWithPlaywright({
        jobUrl: args.application.jobUrl ?? "",
        form: args.targetUrl ? { embedUrl: args.targetUrl } : undefined,
        values: args.finalValuesToSubmit,
        resumePath: args.resumePath,
        onStatus: ({ status, lastUrl, error, message, openUrl, remoteSessionId }) => {
          const sessionStatus = status === "SUBMITTED" ? "WAITING_CONFIRMATION" : status;
          const sessionMessage =
            status === "SUBMITTED"
              ? "Verifying application submission."
              : message;
          updateSession(args.applySessionId, {
            status: sessionStatus,
            lastUrl: lastUrl ?? openUrl,
            error,
            message: sessionMessage,
            remoteSessionId,
          }, {
            caller: "runBackgroundApply.onStatus",
            sourcePath: "app/api/applications/[id]/apply/route.ts",
            phase: "background",
          });
        },
      }),
      applicationId: args.application.id,
      phase: "background",
      applySessionId: args.applySessionId,
    });

    console.log("[AUTO_APPLY_ROUTE] background apply completed", {
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      status: result.status,
      finalUrl: result.finalUrl ?? null,
      submissionConfirmed: result.ok,
    });

    const persistedOutcome = await persistAutomationOutcome({
      application: args.application,
      previousStatus: args.application.status,
      applyProvider: args.applyProvider,
      answers: args.answers,
      finalValuesToSubmit: args.finalValuesToSubmit,
      result,
      phase: "background",
      applySessionId: args.applySessionId,
    });

    const finalResult = persistedOutcome.result;
    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: finalResult.rawStatus,
      rawSubmissionConfirmed: finalResult.rawSubmissionConfirmed,
      finalStatus: finalResult.status,
      finalSubmissionConfirmed: finalResult.ok,
      emailStatus: persistedOutcome.emailStatus,
      storageTarget: "applySession",
    });

    updateSession(args.applySessionId, {
      status: finalResult.status,
      lastUrl: finalResult.finalUrl,
      error: finalResult.ok ? undefined : finalResult.message,
      message: persistedOutcome.message ?? finalResult.message,
      submissionStatus: persistedOutcome.submissionStatus,
      emailStatus: persistedOutcome.emailStatus,
      debug: finalResult.debug,
    }, {
      caller: "runBackgroundApply.finalizeSession",
      sourcePath: "app/api/applications/[id]/apply/route.ts",
      phase: "background",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Playwright automation failed.";

    console.error("[AUTO_APPLY_PLAYWRIGHT] background apply failed", {
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      error: message,
    });

    const existingAudit = readAutomationAudit(args.application.auditJson).audit;
    const nextAudit = buildAutomationAudit({
      existingAudit,
      provider: args.applyProvider ?? args.application.source ?? "playwright",
      finalValuesToSubmit: args.finalValuesToSubmit,
      automation: {
        provider: "playwright",
        status: "FAILED",
        message,
        finalReason: "playwright_error",
      },
    });

    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: "FAILED",
      rawSubmissionConfirmed: false,
      finalStatus: "READY_TO_SEND",
      finalSubmissionConfirmed: false,
      emailStatus: "SKIPPED",
      storageTarget: "jobApplication",
    });

    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        status: "READY_TO_SEND",
        answersJson: args.answers,
        auditJson: nextAudit as Prisma.InputJsonValue,
        failureReason: message,
        verificationRequired: false,
      },
    });

    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: "FAILED",
      rawSubmissionConfirmed: false,
      finalStatus: "FAILED",
      finalSubmissionConfirmed: false,
      emailStatus: "SKIPPED",
      storageTarget: "applySession",
    });

    updateSession(args.applySessionId, {
      status: "FAILED",
      error: message,
      message,
      submissionStatus: "NOT_SUBMITTED",
      emailStatus: "SKIPPED",
      debug: { finalReason: message },
    }, {
      caller: "runBackgroundApply.catch",
      sourcePath: "app/api/applications/[id]/apply/route.ts",
      phase: "background",
    });
  } finally {
    await unlink(args.resumePath).catch(() => undefined);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const sessionEmail = session?.user?.email ?? null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const body = (await req.json()) as ApplyBody;

    console.log("[AUTO_APPLY_ROUTE] POST /api/applications/[id]/apply", {
      applicationId: id,
      route: `/api/applications/${id}/apply`,
      sessionUserId: userId,
      sessionEmail,
      background: Boolean(body.background),
      answerCount: Object.keys(body.answers ?? {}).length,
    });

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

    console.log("[AUTO_APPLY_ROUTE] prepared apply payload", {
      applicationId: application.id,
      targetUrl: prepared.targetUrl ?? application.jobUrl,
      applyProvider: prepared.applyProvider ?? null,
      missingRequired: prepared.missingRequired,
      answerCount: Object.keys(prepared.finalValuesToSubmit).length,
    });

    if (prepared.missingRequired.length > 0) {
      const message = "Missing required profile fields.";

      await persistPreparationFailure({
        application,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        missingRequired: prepared.missingRequired,
        message,
        finalReason: "missing_required_fields",
      });

      return NextResponse.json(
        {
          ok: false,
          error: message,
          missingRequired: prepared.missingRequired,
        },
        { status: 409 },
      );
    }

    const tempResume = await writeResumeToTemp(application.userProfileId);

    console.log("[AUTO_APPLY_ROUTE] temp resume lookup", {
      applicationId: application.id,
      userProfileId: application.userProfileId,
      sessionUserId: userId,
      sessionEmail,
      hasResumePath: Boolean(tempResume.path),
      resumeFileName: tempResume.filename ?? null,
      resumeSource: tempResume.source,
      resumeRecordFound: tempResume.debug.resumeRecordFound,
      resumeFilesRecordExists: tempResume.debug.resumeFileFound,
      sourceResumeFile: tempResume.debug.sourceResumeFile,
      sourceResumeRecord: tempResume.debug.sourceResumeRecord,
      resolvedPath: tempResume.debug.resolvedPath,
      fileExistsOnDisk: tempResume.debug.fileExistsOnDisk,
      generationSucceeded: tempResume.debug.generationSucceeded,
      generationReason: tempResume.debug.generationReason,
      resumeIssue: tempResume.debug.resumeIssue,
      resumeIssueDetail: tempResume.debug.resumeIssueDetail,
    });

    if (!tempResume.path) {
      const resumeFailure = describeResumeFailure(tempResume);

      await persistPreparationFailure({
        application,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        missingRequired: resumeFailure.missingRequired,
        message: resumeFailure.message,
        finalReason: resumeFailure.finalReason,
      });

      return NextResponse.json(
        {
          ok: false,
          status: "FAILED",
          error: resumeFailure.message,
          errorCode: resumeFailure.errorCode,
          resumeIssue: tempResume.debug.resumeIssue,
          resumeIssueDetail: tempResume.debug.resumeIssueDetail,
          missingRequired: resumeFailure.missingRequired,
        },
        { status: resumeFailure.httpStatus },
      );
    }

    if (body.background) {
      const applySession = createSession(application.id, {
        status: "STARTING",
        lastUrl: prepared.targetUrl,
        message: "Starting Playwright automation.",
      }, {
        caller: "POST /api/applications/[id]/apply",
        sourcePath: "app/api/applications/[id]/apply/route.ts",
        phase: "background",
      });

      console.info("[AUTO_APPLY_ROUTE] returned session id", {
        sessionId: applySession.id,
        applicationId: application.id,
        status: applySession.status,
        found: true,
        storageBackendUsed: getApplySessionStorageBackend(),
        caller: "POST /api/applications/[id]/apply",
        sourcePath: "app/api/applications/[id]/apply/route.ts",
        phase: "background",
      });

      void runBackgroundApply({
        application,
        applySessionId: applySession.id,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        targetUrl: prepared.targetUrl,
        resumePath: tempResume.path,
      });

      return NextResponse.json({
        ok: true,
        applySessionId: applySession.id,
        status: "STARTING",
        submissionStatus: "PENDING",
        emailStatus: "PENDING",
        message: "Starting Playwright automation.",
      });
    }

    try {
      const result = applyRouteLevelSubmissionGuard({
        rawResult: await applyWithPlaywright({
          jobUrl: application.jobUrl,
          form: prepared.targetUrl ? { embedUrl: prepared.targetUrl } : undefined,
          values: prepared.finalValuesToSubmit,
          resumePath: tempResume.path,
        }),
        applicationId: application.id,
        phase: "foreground",
      });

      console.log("[AUTO_APPLY_ROUTE] foreground apply completed", {
        applicationId: application.id,
        status: result.status,
        finalUrl: result.finalUrl ?? null,
        submissionConfirmed: result.ok,
      });

      const persistedOutcome = await persistAutomationOutcome({
        application,
        previousStatus: application.status,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        result,
        phase: "foreground",
      });
      const finalResult = persistedOutcome.result;

      if (finalResult.ok) {
        return NextResponse.json({
          ok: true,
          status: "SENT",
          finalUrl: finalResult.finalUrl,
          submissionStatus: persistedOutcome.submissionStatus,
          emailStatus: persistedOutcome.emailStatus,
          message: persistedOutcome.message,
        });
      }

      if (finalResult.needsHuman) {
        return NextResponse.json(
          {
            ok: false,
            status: "WAITING_HUMAN",
            error: finalResult.message ?? "Human verification required.",
            finalUrl: finalResult.finalUrl,
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      if (finalResult.status === "APPLY_NOT_STARTED") {
        return NextResponse.json(
          {
            ok: false,
            status: finalResult.status,
            error:
              finalResult.message ??
              "Opened job page but could not start application.",
            finalUrl: finalResult.finalUrl,
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      if (finalResult.status === "UNCONFIRMED") {
        return NextResponse.json(
          {
            ok: false,
            status: finalResult.status,
            error:
              finalResult.message ?? "Application submission not confirmed.",
            finalUrl: finalResult.finalUrl,
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      if (finalResult.unavailable) {
        return NextResponse.json(
          {
            ok: false,
            status: "AUTO_APPLY_UNAVAILABLE",
            error:
              finalResult.message ??
              "Auto apply is not available for this job application.",
            finalUrl: finalResult.finalUrl,
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          ok: false,
          status: finalResult.status,
          error: finalResult.message ?? "Playwright automation failed.",
          finalUrl: finalResult.finalUrl,
          submissionStatus: persistedOutcome.submissionStatus,
          emailStatus: persistedOutcome.emailStatus,
        },
        { status: 502 },
      );
    } finally {
      await unlink(tempResume.path).catch(() => undefined);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";

    console.error("[AUTO_APPLY_PLAYWRIGHT] request failed", {
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
