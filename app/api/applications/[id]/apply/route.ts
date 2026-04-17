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
import { isAdzunaUnresolvedHandoffUrl } from "@/app/lib/apply/adzunaHandoff";
import {
  resolveDirectJobUrl,
  type DirectJobResolution,
} from "@/app/lib/apply/directJobResolver";
import {
  prepareApplyPayload,
  type AnswersMap,
} from "@/app/lib/apply/prepareApplyPayload";
import {
  isApplySessionTerminalStatus,
  type ApplySessionStatus,
} from "@/app/lib/apply/sessionStatus";
import { writeResumeToTemp } from "@/app/lib/apply/tempResume";
import { detectApplyProviderFromJob } from "@/app/lib/apply/providerDetection";
import { normalizeEmailError } from "@/app/lib/email/errorDiagnostics";
import { sendApplicationActivityEmailForStatusChange } from "@/app/lib/email/lifecycle";
import {
  buildProfileFieldMap,
  computeMissingFromFields,
} from "@/app/lib/jobApplicationAudit";
import { prisma } from "@/app/lib/prisma";
import {
  deriveStopClassification,
  type ApplyStopClassification,
} from "@/app/lib/apply/stopClassification";
import {
  classifyJobUrlKind,
  isAggregatorHandoffUrl,
  isAdzunaUrl,
  isAppcastUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

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
  applyCtaFound: boolean;
  applyCtaClicked: boolean;
  hopCount: number;
  currentUrl: string | null;
  targetUrl: string | null;
  submitButtonFound: boolean;
  submitButtonClicked: boolean;
  confirmationTextFound: boolean;
};

type AutoApplyLastAction =
  | "no_apply_cta"
  | "login_required"
  | "verification_required";

type AutoApplyStopDebug = {
  stopReason: "HUMAN_INTERVENTION_REQUIRED";
  finalUrl: string | null;
  currentUrl: string | null;
  lastAction: AutoApplyLastAction;
  stopClassification: ApplyStopClassification;
  stoppedAtUrl: string | null;
  stoppedAtTitle: string | null;
  lastActionText: string | null;
  lastActionSelector: string | null;
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

type DirectResolutionDebug = Pick<
  ApplySessionDebug,
  | "originalJobUrl"
  | "resolvedDirectUrl"
  | "applySource"
  | "googleFirstResolutionTriggered"
  | "usedResolvedDirectUrl"
  | "directJobResolutionAttempted"
  | "directJobResolutionQueries"
  | "directJobResolutionNormalizedLocation"
  | "directJobResolutionSearchProvider"
  | "directJobResolutionConfidence"
  | "directJobResolutionProvider"
  | "directJobResolutionMatchReason"
  | "directJobResolutionError"
  | "directJobResolutionCandidates"
  | "adzunaStrategyReplaySkipped"
  | "startingUrlKind"
  | "finalChosenUrlKind"
>;

type DirectResolutionContext = {
  application: LoadedApplication;
  originalUrl: string;
  resolvedDirectUrl?: string;
  debug: DirectResolutionDebug;
  resolution?: DirectJobResolution;
  usedResolvedDirectUrl: boolean;
};

const ADZUNA_UNRESOLVED_TARGET_MESSAGE =
  "Adzuna handoff unresolved: no confirmed employer-hosted application URL found after search fallback";
const ADZUNA_GOOGLE_FIRST_FAILURE_MESSAGE =
  "No confirmed employer-hosted application URL found from Google-first resolution for Adzuna job";

function normalizeSourceLabel(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function shouldAttemptDirectResolution(application: LoadedApplication) {
  const jobUrl = normalizeJobUrl(application.jobUrl ?? "");
  const source = normalizeSourceLabel(application.source);

  if (!jobUrl) return false;

  return (
    source.includes("adzuna") ||
    source.includes("external") ||
    isAggregatorHandoffUrl(jobUrl)
  );
}

function isAdzunaApplySource(args: {
  source?: string | null;
  jobUrl?: string | null;
}) {
  const source = normalizeSourceLabel(args.source);
  const jobUrl = normalizeJobUrl(args.jobUrl ?? "");

  return source.includes("adzuna") || isAdzunaUrl(jobUrl);
}

function shouldContinueWithOriginalUrl(url: string) {
  const normalizedUrl = normalizeJobUrl(url);
  if (!normalizedUrl) return false;

  if (isAdzunaUnresolvedHandoffUrl(normalizedUrl)) {
    return false;
  }

  if (isAppcastUrl(normalizedUrl)) {
    return true;
  }

  return !isAggregatorHandoffUrl(normalizedUrl);
}

function buildDirectResolutionDebug(args: {
  originalUrl: string;
  source?: string | null;
  resolution?: DirectJobResolution;
  resolvedDirectUrl?: string;
  attempted: boolean;
}): DirectResolutionDebug {
  return {
    originalJobUrl: args.originalUrl || undefined,
    resolvedDirectUrl: args.resolvedDirectUrl,
    applySource: args.source ?? undefined,
    googleFirstResolutionTriggered:
      args.resolution?.googleFirstTriggered === true,
    usedResolvedDirectUrl:
      Boolean(args.resolvedDirectUrl) &&
      args.resolvedDirectUrl !== args.originalUrl,
    directJobResolutionAttempted: args.attempted,
    directJobResolutionQueries: args.resolution?.queries ?? [],
    directJobResolutionNormalizedLocation:
      args.resolution?.normalizedLocation,
    directJobResolutionSearchProvider: args.resolution?.searchProvider,
    directJobResolutionConfidence: args.resolution?.confidence,
    directJobResolutionProvider: args.resolution?.provider,
    directJobResolutionMatchReason: args.resolution?.matchReason,
    directJobResolutionError: args.resolution?.error,
    directJobResolutionCandidates: args.resolution?.candidates ?? [],
    adzunaStrategyReplaySkipped:
      args.resolution?.adzunaStrategyReplaySkipped === true,
    startingUrlKind: classifyJobUrlKind(args.originalUrl),
    finalChosenUrlKind: classifyJobUrlKind(
      args.resolvedDirectUrl ?? args.originalUrl,
    ),
  };
}

function mergeDirectResolutionAudit(args: {
  application: LoadedApplication;
  debug: DirectResolutionDebug;
}): Prisma.JsonValue {
  const previousDebug = readAutomationAudit(args.application.auditJson).state.debug ?? {};

  return buildAutomationAudit({
    existingAudit: args.application.auditJson,
    provider: args.application.source ?? "playwright",
    automation: {
      provider: "playwright",
      debug: {
        ...previousDebug,
        ...args.debug,
      },
    },
  }) as Prisma.JsonValue;
}

function buildUrlDecisionFields(
  debug:
    | Pick<
        ApplySessionDebug,
        | "originalJobUrl"
        | "resolvedDirectUrl"
        | "usedResolvedDirectUrl"
        | "applySource"
        | "startingUrlKind"
        | "finalChosenUrlKind"
        | "targetUrl"
      >
    | null
    | undefined,
) {
  const applySource = normalizeSourceLabel(debug?.applySource);
  const isBlockedAdzunaTarget = (url: string | null | undefined) =>
    Boolean(url) &&
    applySource.includes("adzuna") &&
    isAdzunaUrl(String(url));
  const chosenApplyUrl =
    (debug?.targetUrl && !isBlockedAdzunaTarget(debug.targetUrl)
      ? debug.targetUrl
      : null) ??
    (debug?.resolvedDirectUrl && !isBlockedAdzunaTarget(debug.resolvedDirectUrl)
      ? debug.resolvedDirectUrl
      : null) ??
    (debug?.originalJobUrl &&
    !isAdzunaUnresolvedHandoffUrl(debug.originalJobUrl) &&
    !isBlockedAdzunaTarget(debug.originalJobUrl)
      ? debug.originalJobUrl
      : null);

  return {
    originalUrl: debug?.originalJobUrl ?? null,
    resolvedDirectUrl: debug?.resolvedDirectUrl ?? null,
    usedResolvedDirectUrl: debug?.usedResolvedDirectUrl === true,
    applySource: debug?.applySource ?? null,
    startingUrlKind: debug?.startingUrlKind ?? null,
    finalChosenUrlKind: debug?.finalChosenUrlKind ?? null,
    chosenApplyUrl,
  };
}

async function resolveApplicationDirectJobUrl(args: {
  application: LoadedApplication;
}) {
  const originalUrl = normalizeJobUrl(args.application.jobUrl ?? "");
  const source = args.application.source ?? null;
  const adzunaSourceDetected = isAdzunaApplySource({
    source,
    jobUrl: originalUrl,
  });
  const shouldAttempt = shouldAttemptDirectResolution(args.application);

  if (!shouldAttempt) {
    return {
      context: {
        application: args.application,
        originalUrl,
        debug: buildDirectResolutionDebug({
          originalUrl,
          source,
          attempted: false,
        }),
        usedResolvedDirectUrl: false,
      } satisfies DirectResolutionContext,
    };
  }

  const resolution = await resolveDirectJobUrl({
    title: args.application.title ?? args.application.jobTitle,
    company: args.application.company,
    location: args.application.location,
    currentUrl: originalUrl,
    source,
  });

  const resolvedDirectUrl =
    resolution.ok ? normalizeJobUrl(resolution.resolvedUrl ?? "") || null : null;
  const debug = buildDirectResolutionDebug({
    originalUrl,
    source,
    resolution,
    resolvedDirectUrl: resolvedDirectUrl ?? undefined,
    attempted: true,
  });
  const nextAudit = mergeDirectResolutionAudit({
    application: args.application,
    debug,
  });
  const usedResolvedDirectUrl =
    Boolean(resolvedDirectUrl) && resolvedDirectUrl !== originalUrl;

  console.log("[AUTO_APPLY_ROUTE] direct resolution evaluated", {
    applicationId: args.application.id,
    source,
    originalUrl,
    googleFirstResolutionTriggered:
      resolution.googleFirstTriggered === true,
    adzunaHandoffDetected: isAdzunaUnresolvedHandoffUrl(originalUrl),
    acceptanceRule: resolution.acceptanceRule ?? null,
    normalizedLocation: resolution.normalizedLocation ?? null,
    searchProvider: resolution.searchProvider ?? null,
    queries: resolution.queries ?? [],
    resolvedDirectUrl: resolvedDirectUrl ?? null,
    usedResolvedDirectUrl,
    adzunaStrategyReplaySkipped:
      resolution.adzunaStrategyReplaySkipped === true,
    confidence: resolution.confidence ?? null,
    provider: resolution.provider ?? null,
    matchReason: resolution.matchReason ?? null,
    error: resolution.error ?? null,
    startingUrlKind: debug.startingUrlKind ?? null,
    finalChosenUrlKind: debug.finalChosenUrlKind ?? null,
  });

  if (usedResolvedDirectUrl) {
    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        jobUrl: resolvedDirectUrl,
        auditJson: nextAudit as Prisma.InputJsonValue,
        failureReason: null,
      },
    });

    return {
      context: {
        application: {
          ...args.application,
          jobUrl: resolvedDirectUrl,
          auditJson: nextAudit,
          failureReason: null,
        } as LoadedApplication,
        originalUrl,
        resolvedDirectUrl: resolvedDirectUrl ?? undefined,
        debug,
        resolution,
        usedResolvedDirectUrl,
      },
    };
  }

  if (!resolution.ok && !shouldContinueWithOriginalUrl(originalUrl)) {
    const message = adzunaSourceDetected
      ? resolution.error ?? ADZUNA_GOOGLE_FIRST_FAILURE_MESSAGE
      : isAdzunaUnresolvedHandoffUrl(originalUrl)
        ? resolution.error ?? ADZUNA_UNRESOLVED_TARGET_MESSAGE
      : resolution.error ??
        "Could not resolve a confident direct employer/ATS application URL";

    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        auditJson: nextAudit as Prisma.InputJsonValue,
        failureReason: message,
        verificationRequired: false,
      },
    });

    return {
      context: {
        application: {
          ...args.application,
          auditJson: nextAudit,
          failureReason: message,
        } as LoadedApplication,
        originalUrl,
        debug,
        resolution,
        usedResolvedDirectUrl: false,
      },
      blocked: true,
      message,
    };
  }

  return {
    context: {
      application: {
        ...args.application,
        auditJson: nextAudit,
      } as LoadedApplication,
      originalUrl,
      resolvedDirectUrl: resolvedDirectUrl ?? undefined,
      debug,
      resolution,
      usedResolvedDirectUrl,
    },
  };
}

function toHostedAnswersMap(values: Record<string, unknown>): AnswersMap {
  const entries = Object.entries(values)
    .filter(([key]) => key !== "resumeUploaded")
    .map(([key, value]) => [key, String(value ?? "").trim()] as const);

  return Object.fromEntries(entries);
}

function normalizePlaywrightResult(
  result: Awaited<ReturnType<typeof applyWithPlaywright>>,
): ApplyExecutionResult {
  const stopDebug = buildStopDebugFromRawResult(result);
  const debug = {
    ...(toApplySessionDebug(result.debug) ??
      ({
        finalReason:
          result.message ??
          result.status.toLowerCase(),
      } satisfies ApplySessionDebug)),
    finalUrl:
      result.finalUrl ?? result.openUrl ?? result.debug?.finalUrl ?? undefined,
    stopReason: stopDebug?.stopReason,
    lastAction: stopDebug?.lastAction,
    stopClassification:
      stopDebug?.stopClassification ?? result.debug?.stopClassification,
  } satisfies ApplySessionDebug;

  return {
    ok: result.ok,
    status: result.status,
    finalUrl: stopDebug?.finalUrl ?? result.finalUrl ?? result.openUrl,
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
    applyCtaFound: result.debug?.applyCtaFound === true,
    applyCtaClicked: result.debug?.applyCtaClicked === true,
    hopCount:
      typeof result.debug?.hopCount === "number" ? result.debug.hopCount : 0,
    currentUrl:
      result.debug?.currentUrl ?? result.finalUrl ?? result.openUrl ?? null,
    targetUrl: result.debug?.targetUrl ?? null,
    submitButtonFound: result.debug?.submitButtonFound === true,
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

function looksLikeLoginRequired(value: string | null | undefined) {
  if (!value) return false;

  const normalized = value.toLowerCase();
  return [
    "log in",
    "login",
    "sign in",
    "signin",
    "create account",
    "sign up",
    "register",
    "set your password",
    "password",
    "confirm your email",
    "verify your email",
    "email verification",
  ].some((signal) => normalized.includes(signal));
}

function deriveLastActionFromRawResult(
  result: RawPlaywrightResult,
): AutoApplyLastAction {
  const applyCtaClicked = result.debug?.applyCtaClicked === true;
  const hopCount =
    typeof result.debug?.hopCount === "number" ? result.debug.hopCount : 0;

  if (!applyCtaClicked && hopCount === 0) {
    return "no_apply_cta";
  }

  const verificationText = [
    ...(result.debug?.verificationSignals ?? []),
    result.debug?.finalReason,
    result.message,
    result.finalUrl,
    result.debug?.currentUrl,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");

  return looksLikeLoginRequired(verificationText)
    ? "login_required"
    : "verification_required";
}

function deriveLastActionFromExecutionResult(
  result: ApplyExecutionResult,
): AutoApplyLastAction {
  const applyCtaClicked = result.debug.applyCtaClicked === true;
  const hopCount =
    typeof result.debug.hopCount === "number" ? result.debug.hopCount : 0;

  if (!applyCtaClicked && hopCount === 0) {
    return "no_apply_cta";
  }

  const verificationText = [
    result.debug.finalReason,
    result.message,
    result.finalUrl,
    result.debug.currentUrl,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");

  return looksLikeLoginRequired(verificationText)
    ? "login_required"
    : "verification_required";
}

function buildStopDebugFromRawResult(
  result: RawPlaywrightResult,
): AutoApplyStopDebug | null {
  if (
    result.needsHuman !== true &&
    result.status !== "APPLY_NOT_STARTED" &&
    result.status !== "AUTO_APPLY_UNAVAILABLE" &&
    result.status !== "FAILED"
  ) {
    return null;
  }

  const finalUrl =
    result.finalUrl ?? result.openUrl ?? result.debug?.finalUrl ?? null;
  const currentUrl = result.debug?.currentUrl ?? finalUrl;
  const lastAction = deriveLastActionFromRawResult(result);

  return {
    stopReason: "HUMAN_INTERVENTION_REQUIRED",
    finalUrl,
    currentUrl,
    lastAction,
    stoppedAtUrl:
      result.debug?.stoppedAtUrl ?? currentUrl ?? finalUrl,
    stoppedAtTitle: result.debug?.stoppedAtTitle ?? null,
    lastActionText:
      result.debug?.lastActionText ??
      result.debug?.applyCtaClickedText ??
      result.debug?.cookiePromptClickedText ??
      result.debug?.handoffCtaClickedText ??
      result.debug?.entryCtaClickedText ??
      null,
    lastActionSelector:
      result.debug?.lastActionSelector ??
      result.debug?.applyCtaClickedSelector ??
      result.debug?.cookiePromptSelector ??
      result.debug?.handoffCtaClickedSelector ??
      result.debug?.entryCtaClickedSelector ??
      null,
    stopClassification: deriveStopClassification({
      targetUrl: result.debug?.targetUrl ?? null,
      finalUrl,
      currentUrl,
      applyCtaFound: result.debug?.applyCtaFound === true,
      applyCtaClicked: result.debug?.applyCtaClicked === true,
      hopCount:
        typeof result.debug?.hopCount === "number" ? result.debug.hopCount : 0,
      submitButtonFound: result.debug?.submitButtonFound === true,
      submitButtonClicked: result.debug?.submitButtonClicked === true,
      confirmationTextFound: result.debug?.confirmationTextFound === true,
      verificationSignals: result.debug?.verificationSignals ?? [],
      pageText: result.debug?.pageText,
      finalReason: result.debug?.finalReason ?? result.message ?? null,
      message: result.message,
      lastAction,
      formDetected: result.debug?.formDetected === true,
    }),
  };
}

function buildStopDebugFromExecutionResult(
  result: ApplyExecutionResult,
): AutoApplyStopDebug | null {
  if (
    result.needsHuman !== true &&
    result.status !== "APPLY_NOT_STARTED" &&
    result.status !== "AUTO_APPLY_UNAVAILABLE" &&
    result.status !== "FAILED"
  ) {
    return null;
  }

  const finalUrl = result.finalUrl ?? result.debug.finalUrl ?? null;
  const currentUrl = result.debug.currentUrl ?? finalUrl;
  const lastAction =
    result.debug.lastAction ?? deriveLastActionFromExecutionResult(result);

  return {
    stopReason: "HUMAN_INTERVENTION_REQUIRED",
    finalUrl,
    currentUrl,
    lastAction,
    stoppedAtUrl:
      result.debug.stoppedAtUrl ?? currentUrl ?? finalUrl,
    stoppedAtTitle: result.debug.stoppedAtTitle ?? null,
    lastActionText:
      result.debug.lastActionText ??
      result.debug.applyCtaClickedText ??
      result.debug.cookiePromptClickedText ??
      result.debug.handoffCtaClickedText ??
      result.debug.entryCtaClickedText ??
      null,
    lastActionSelector:
      result.debug.lastActionSelector ??
      result.debug.applyCtaClickedSelector ??
      result.debug.cookiePromptSelector ??
      result.debug.handoffCtaClickedSelector ??
      result.debug.entryCtaClickedSelector ??
      null,
    stopClassification:
      result.debug.stopClassification ??
      deriveStopClassification({
        targetUrl: result.debug.targetUrl ?? null,
        finalUrl,
        currentUrl,
        applyCtaFound: result.debug.applyCtaFound === true,
        applyCtaClicked: result.debug.applyCtaClicked === true,
        hopCount:
          typeof result.debug.hopCount === "number" ? result.debug.hopCount : 0,
        submitButtonFound: result.debug.submitButtonFound === true,
        submitButtonClicked: result.debug.submitButtonClicked === true,
        confirmationTextFound: result.debug.confirmationTextFound === true,
        finalReason: result.debug.finalReason ?? result.message ?? null,
        message: result.message,
        lastAction,
        formDetected: result.debug.formDetected === true,
      }),
  };
}

function withStopDebug(
  result: ApplyExecutionResult,
  stopDebug: AutoApplyStopDebug | null,
): ApplyExecutionResult {
  if (!stopDebug) {
    return result;
  }

  return {
    ...result,
    finalUrl: stopDebug.finalUrl ?? result.finalUrl,
    debug: {
      ...result.debug,
      finalUrl: stopDebug.finalUrl ?? undefined,
      currentUrl: stopDebug.currentUrl ?? undefined,
      stoppedAtUrl: stopDebug.stoppedAtUrl ?? undefined,
      stoppedAtTitle: stopDebug.stoppedAtTitle ?? undefined,
      lastActionText: stopDebug.lastActionText ?? undefined,
      lastActionSelector: stopDebug.lastActionSelector ?? undefined,
      stopReason: stopDebug.stopReason,
      lastAction: stopDebug.lastAction,
      stopClassification: stopDebug.stopClassification,
    },
  };
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
    originalJobUrl: args.rawResult.debug?.originalJobUrl ?? null,
    resolvedDirectUrl: args.rawResult.debug?.resolvedDirectUrl ?? null,
    usedResolvedDirectUrl:
      args.rawResult.debug?.usedResolvedDirectUrl === true,
    applySource: args.rawResult.debug?.applySource ?? null,
    directJobResolutionAttempted:
      args.rawResult.debug?.directJobResolutionAttempted === true,
    directJobResolutionConfidence:
      args.rawResult.debug?.directJobResolutionConfidence ?? null,
    directJobResolutionProvider:
      args.rawResult.debug?.directJobResolutionProvider ?? null,
    directJobResolutionMatchReason:
      args.rawResult.debug?.directJobResolutionMatchReason ?? null,
    directJobResolutionError:
      args.rawResult.debug?.directJobResolutionError ?? null,
    directJobResolutionCandidates:
      args.rawResult.debug?.directJobResolutionCandidates ?? [],
    searchFallbackTriggered:
      args.rawResult.debug?.searchFallbackTriggered === true,
    searchFallbackQueries:
      args.rawResult.debug?.searchFallbackQueries ?? [],
    searchFallbackCandidates:
      args.rawResult.debug?.searchFallbackCandidates ?? [],
    searchFallbackChosenCandidate:
      args.rawResult.debug?.searchFallbackChosenCandidate ?? null,
    searchFallbackAttemptCount:
      args.rawResult.debug?.searchFallbackAttemptCount ?? 0,
    searchFallbackSuccess:
      args.rawResult.debug?.searchFallbackSuccess === true,
    searchFallbackFailureReason:
      args.rawResult.debug?.searchFallbackFailureReason ?? null,
    startingUrlKind: args.rawResult.debug?.startingUrlKind ?? null,
    finalChosenUrlKind: args.rawResult.debug?.finalChosenUrlKind ?? null,
    entryUrl: args.rawResult.debug?.entryUrl ?? null,
    initialLoadedUrl: args.rawResult.debug?.initialLoadedUrl ?? null,
    finalUrl: args.rawResult.finalUrl ?? args.rawResult.openUrl ?? null,
    domain: args.rawResult.debug?.domain ?? null,
    stoppedAtUrl: args.rawResult.debug?.stoppedAtUrl ?? null,
    stoppedAtTitle: args.rawResult.debug?.stoppedAtTitle ?? null,
    lastActionText: args.rawResult.debug?.lastActionText ?? null,
    lastActionSelector: args.rawResult.debug?.lastActionSelector ?? null,
    ctaAttempts: args.rawResult.debug?.ctaAttempts ?? [],
    entryCtaFound: args.rawResult.debug?.entryCtaFound === true,
    entryCtaClicked: args.rawResult.debug?.entryCtaClicked === true,
    entryCtaClickedText: args.rawResult.debug?.entryCtaClickedText ?? null,
    entryCtaClickedSelector:
      args.rawResult.debug?.entryCtaClickedSelector ?? null,
    entryDismissedBlocker:
      args.rawResult.debug?.entryDismissedBlocker === true,
    handoffPageDetected: args.rawResult.debug?.handoffPageDetected === true,
    handoffUrl: args.rawResult.debug?.handoffUrl ?? null,
    handoffContinuationAttempted:
      args.rawResult.debug?.handoffContinuationAttempted === true,
    handoffContinuationSucceeded:
      args.rawResult.debug?.handoffContinuationSucceeded === true,
    handoffCtaFound: args.rawResult.debug?.handoffCtaFound === true,
    handoffCtaClicked: args.rawResult.debug?.handoffCtaClicked === true,
    handoffCtaClickedText:
      args.rawResult.debug?.handoffCtaClickedText ?? null,
    handoffCtaClickedSelector:
      args.rawResult.debug?.handoffCtaClickedSelector ?? null,
    handoffAttempts: args.rawResult.debug?.handoffAttempts ?? [],
    cookiePromptDetected: args.rawResult.debug?.cookiePromptDetected === true,
    cookiePromptClicked: args.rawResult.debug?.cookiePromptClicked === true,
    cookiePromptClickedText:
      args.rawResult.debug?.cookiePromptClickedText ?? null,
    cookiePromptSelector: args.rawResult.debug?.cookiePromptSelector ?? null,
    cookiePromptAttempts: args.rawResult.debug?.cookiePromptAttempts ?? [],
    postCookieWaitAttempted:
      args.rawResult.debug?.postCookieWaitAttempted === true,
    postCookieUrlBefore: args.rawResult.debug?.postCookieUrlBefore ?? null,
    postCookieUrlAfter: args.rawResult.debug?.postCookieUrlAfter ?? null,
    postCookieUrlChanged:
      args.rawResult.debug?.postCookieUrlChanged === true,
    postCookieProgressDetected:
      args.rawResult.debug?.postCookieProgressDetected === true,
    postCookieTitleAfter:
      args.rawResult.debug?.postCookieTitleAfter ?? null,
    applyCtaClickedText: args.rawResult.debug?.applyCtaClickedText ?? null,
    applyCtaClickedSelector:
      args.rawResult.debug?.applyCtaClickedSelector ?? null,
    ctaClickedText: args.rawResult.debug?.ctaClickedText ?? null,
    ctaClickedSelector: args.rawResult.debug?.ctaClickedSelector ?? null,
    dismissedBlocker: args.rawResult.debug?.dismissedBlocker === true,
    resolverCandidates: args.rawResult.debug?.resolverCandidates ?? [],
    resolverRejectedCandidates:
      args.rawResult.debug?.resolverRejectedCandidates ?? [],
    resolverSelectedLink: args.rawResult.debug?.resolverSelectedLink ?? null,
    adzunaHandoffFailureReasons:
      args.rawResult.debug?.adzunaHandoffFailureReasons ?? [],
    adzunaExternalLinkCandidates:
      args.rawResult.debug?.adzunaExternalLinkCandidates ?? [],
    adzunaBodyTextPreview:
      args.rawResult.debug?.adzunaBodyTextPreview ?? null,
    adzunaTokenizedInterstitialDetected:
      args.rawResult.debug?.adzunaTokenizedInterstitialDetected === true,
    adzunaTokenizedParamsPresent:
      args.rawResult.debug?.adzunaTokenizedParamsPresent ?? [],
    adzunaDownstreamCandidates:
      args.rawResult.debug?.adzunaDownstreamCandidates ?? [],
    adzunaScriptRedirectCandidates:
      args.rawResult.debug?.adzunaScriptRedirectCandidates ?? [],
    adzunaNetworkRedirectCandidates:
      args.rawResult.debug?.adzunaNetworkRedirectCandidates ?? [],
    adzunaFinalFailureReason:
      args.rawResult.debug?.adzunaFinalFailureReason ?? null,
    adzunaHandoffPageTitle:
      args.rawResult.debug?.adzunaHandoffPageTitle ?? null,
    adzunaHandoffVisibleCtas:
      args.rawResult.debug?.adzunaHandoffVisibleCtas ?? [],
    adzunaOverlayDetected:
      args.rawResult.debug?.adzunaOverlayDetected === true,
    adzunaOverlayDismissed:
      args.rawResult.debug?.adzunaOverlayDismissed === true,
    adzunaOverlayType:
      args.rawResult.debug?.adzunaOverlayType ?? null,
    adzunaOverlaySelectorsTried:
      args.rawResult.debug?.adzunaOverlaySelectorsTried ?? [],
    adzunaHandoffPopupOccurred:
      args.rawResult.debug?.adzunaHandoffPopupOccurred === true,
    adzunaHandoffUsedPopup:
      args.rawResult.debug?.adzunaHandoffUsedPopup === true,
    adzunaDownstreamConfirmed:
      args.rawResult.debug?.adzunaDownstreamConfirmed === true,
    adzunaAuthPageDetected:
      args.rawResult.debug?.adzunaAuthPageDetected === true,
    adzunaForgotPasswordDetected:
      args.rawResult.debug?.adzunaForgotPasswordDetected === true,
    adzunaLoginAttempted:
      args.rawResult.debug?.adzunaLoginAttempted === true,
    adzunaLoginSucceeded:
      args.rawResult.debug?.adzunaLoginSucceeded === true,
    adzunaLoginFailedReason:
      args.rawResult.debug?.adzunaLoginFailedReason ?? null,
    blockedResolvedHandoffCandidates:
      args.rawResult.debug?.blockedResolvedHandoffCandidates ?? [],
    selectedResolvedHandoffCandidate:
      args.rawResult.debug?.selectedResolvedHandoffCandidate ?? null,
    resolvedHandoffClickAttempted:
      args.rawResult.debug?.resolvedHandoffClickAttempted === true,
    resolvedHandoffClickSucceeded:
      args.rawResult.debug?.resolvedHandoffClickSucceeded === true,
    resolvedHandoffClickedHref:
      args.rawResult.debug?.resolvedHandoffClickedHref ?? null,
    resolvedHandoffClickedText:
      args.rawResult.debug?.resolvedHandoffClickedText ?? null,
    resolvedHandoffUrlBefore:
      args.rawResult.debug?.resolvedHandoffUrlBefore ?? null,
    resolvedHandoffUrlAfter:
      args.rawResult.debug?.resolvedHandoffUrlAfter ?? null,
    playwrightLaunchStrategy:
      args.rawResult.debug?.playwrightLaunchStrategy ?? null,
    playwrightPersistentContext:
      args.rawResult.debug?.playwrightPersistentContext === true,
    playwrightUserDataDir:
      args.rawResult.debug?.playwrightUserDataDir ?? null,
    applyCtaFound: evidence.applyCtaFound,
    applyCtaClicked: evidence.applyCtaClicked,
    hopCount: evidence.hopCount,
    currentUrl: evidence.currentUrl,
    targetUrl: evidence.targetUrl,
    submitButtonFound: evidence.submitButtonFound,
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

  const normalized = withStopDebug(
    normalizePlaywrightResult(guardedResult),
    buildStopDebugFromRawResult(guardedResult),
  );
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
    applyCtaFound: result.debug.applyCtaFound === true,
    applyCtaClicked: result.debug.applyCtaClicked === true,
    hopCount:
      typeof result.debug.hopCount === "number" ? result.debug.hopCount : 0,
    currentUrl: result.debug.currentUrl ?? result.finalUrl ?? null,
    targetUrl: result.debug.targetUrl ?? null,
    submitButtonFound: result.debug.submitButtonFound === true,
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
    applyCtaFound: evidence.applyCtaFound,
    applyCtaClicked: evidence.applyCtaClicked,
    hopCount: evidence.hopCount,
    currentUrl: evidence.currentUrl,
    targetUrl: evidence.targetUrl,
    submitButtonFound: evidence.submitButtonFound,
    submitButtonClicked: evidence.submitButtonClicked,
    confirmationTextFound: evidence.confirmationTextFound,
  });

  const finalReason =
    args.result.debug.finalReason ??
    "Final write guard forced APPLY_NOT_STARTED for a no-interaction run.";
  const stopClassification = deriveStopClassification({
    targetUrl: args.result.debug.targetUrl ?? null,
    finalUrl: args.result.finalUrl ?? evidence.currentUrl ?? null,
    currentUrl: evidence.currentUrl,
    applyCtaFound: evidence.applyCtaFound,
    applyCtaClicked: evidence.applyCtaClicked,
    hopCount: evidence.hopCount,
    submitButtonFound: evidence.submitButtonFound,
    submitButtonClicked: evidence.submitButtonClicked,
    confirmationTextFound: evidence.confirmationTextFound,
    finalReason,
    message: args.result.message,
    lastAction: "no_apply_cta",
    formDetected: args.result.debug.formDetected === true,
  });

  return {
    ...withStopDebug(args.result, {
      stopReason: "HUMAN_INTERVENTION_REQUIRED",
      finalUrl: args.result.finalUrl ?? evidence.currentUrl ?? null,
      currentUrl: evidence.currentUrl,
      lastAction: "no_apply_cta",
      stopClassification,
      stoppedAtUrl:
        args.result.debug.stoppedAtUrl ??
        evidence.currentUrl ??
        args.result.finalUrl ??
        null,
      stoppedAtTitle: args.result.debug.stoppedAtTitle ?? null,
      lastActionText: args.result.debug.lastActionText ?? null,
      lastActionSelector: args.result.debug.lastActionSelector ?? null,
    }),
    ok: false,
    status: "APPLY_NOT_STARTED",
    unavailable: true,
    message:
      args.result.message ?? "Opened job page but could not start application.",
    debug: {
      ...args.result.debug,
      finalUrl: args.result.finalUrl ?? evidence.currentUrl ?? undefined,
      currentUrl: evidence.currentUrl ?? undefined,
      stopReason: "HUMAN_INTERVENTION_REQUIRED",
      lastAction: "no_apply_cta",
      stopClassification,
      submissionConfirmed: false,
      finalReason,
    },
    rawStatus: args.result.rawStatus,
    rawSubmissionConfirmed: args.result.rawSubmissionConfirmed,
  };
}

function ensureTerminalApplySessionResult(args: {
  result: ApplyExecutionResult;
  applicationId: string;
  applySessionId?: string;
}) {
  if (
    args.result.needsHuman === true ||
    isApplySessionTerminalStatus(args.result.status)
  ) {
    return args.result;
  }

  const evidence = readExecutionEvidence(args.result);
  const finalUrl =
    args.result.finalUrl ?? args.result.debug.finalUrl ?? evidence.currentUrl;
  const currentUrl = evidence.currentUrl ?? finalUrl;
  const finalReason =
    args.result.debug.finalReason ??
    args.result.message ??
    "Background apply finished without reaching a terminal session state.";
  const lastAction =
    args.result.debug.lastAction ??
    (evidence.applyCtaClicked ? "verification_required" : "no_apply_cta");
  const coercedStatus =
    args.result.unavailable === true
      ? "AUTO_APPLY_UNAVAILABLE"
      : "FAILED";
  const stopClassification =
    args.result.debug.stopClassification ??
    deriveStopClassification({
      targetUrl: args.result.debug.targetUrl ?? null,
      finalUrl,
      currentUrl,
      applyCtaFound: evidence.applyCtaFound,
      applyCtaClicked: evidence.applyCtaClicked,
      hopCount: evidence.hopCount,
      submitButtonFound: evidence.submitButtonFound,
      submitButtonClicked: evidence.submitButtonClicked,
      confirmationTextFound: evidence.confirmationTextFound,
      finalReason,
      message: args.result.message,
      lastAction,
      formDetected: args.result.debug.formDetected === true,
    });

  console.error("[AUTO_APPLY_ROUTE] coerced non-terminal session result", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    rawStatus: args.result.rawStatus,
    sessionStatus: args.result.status,
    coercedStatus,
    currentUrl,
    finalUrl,
    finalReason,
  });

  return {
    ...withStopDebug(
      {
        ...args.result,
        ok: false,
        status: coercedStatus,
        message: finalReason,
        debug: {
          ...args.result.debug,
          finalUrl: finalUrl ?? undefined,
          currentUrl: currentUrl ?? undefined,
          stopReason: "HUMAN_INTERVENTION_REQUIRED",
          lastAction,
          stopClassification,
          submissionConfirmed: false,
          finalReason,
        },
      },
      {
        stopReason: "HUMAN_INTERVENTION_REQUIRED",
        finalUrl,
        currentUrl,
        lastAction,
        stopClassification,
        stoppedAtUrl:
          args.result.debug.stoppedAtUrl ??
          currentUrl ??
          finalUrl ??
          null,
        stoppedAtTitle: args.result.debug.stoppedAtTitle ?? null,
        lastActionText: args.result.debug.lastActionText ?? null,
        lastActionSelector: args.result.debug.lastActionSelector ?? null,
      },
    ),
    rawStatus: args.result.rawStatus,
    rawSubmissionConfirmed: args.result.rawSubmissionConfirmed,
  } satisfies ApplyExecutionResult;
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

function logAutoApplyDebug(args: {
  applicationId: string;
  applySessionId?: string;
  phase: "background" | "foreground";
  result: ApplyExecutionResult;
}) {
  const stopDebug = buildStopDebugFromExecutionResult(args.result);
  if (!stopDebug) {
    return;
  }

  console.info("[AUTO_APPLY_DEBUG]", {
    applicationId: args.applicationId,
    originalJobUrl: args.result.debug.originalJobUrl ?? null,
    resolvedDirectUrl: args.result.debug.resolvedDirectUrl ?? null,
    usedResolvedDirectUrl:
      args.result.debug.usedResolvedDirectUrl === true,
    applySource: args.result.debug.applySource ?? null,
    directJobResolutionAttempted:
      args.result.debug.directJobResolutionAttempted === true,
    directJobResolutionConfidence:
      args.result.debug.directJobResolutionConfidence ?? null,
    directJobResolutionProvider:
      args.result.debug.directJobResolutionProvider ?? null,
    directJobResolutionMatchReason:
      args.result.debug.directJobResolutionMatchReason ?? null,
    directJobResolutionError:
      args.result.debug.directJobResolutionError ?? null,
    directJobResolutionCandidates:
      args.result.debug.directJobResolutionCandidates ?? [],
    searchFallbackTriggered:
      args.result.debug.searchFallbackTriggered === true,
    searchFallbackQueries:
      args.result.debug.searchFallbackQueries ?? [],
    searchFallbackCandidates:
      args.result.debug.searchFallbackCandidates ?? [],
    searchFallbackChosenCandidate:
      args.result.debug.searchFallbackChosenCandidate ?? null,
    searchFallbackAttemptCount:
      args.result.debug.searchFallbackAttemptCount ?? 0,
    searchFallbackSuccess:
      args.result.debug.searchFallbackSuccess === true,
    searchFallbackFailureReason:
      args.result.debug.searchFallbackFailureReason ?? null,
    startingUrlKind: args.result.debug.startingUrlKind ?? null,
    finalChosenUrlKind: args.result.debug.finalChosenUrlKind ?? null,
    entryUrl: args.result.debug.entryUrl ?? null,
    initialLoadedUrl: args.result.debug.initialLoadedUrl ?? null,
    finalUrl: stopDebug.finalUrl,
    domain: args.result.debug.domain ?? null,
    stoppedAtUrl: stopDebug.stoppedAtUrl,
    stoppedAtTitle: stopDebug.stoppedAtTitle,
    lastActionText: stopDebug.lastActionText,
    lastActionSelector: stopDebug.lastActionSelector,
    ctaAttempts: args.result.debug.ctaAttempts ?? [],
    entryCtaFound: args.result.debug.entryCtaFound === true,
    entryCtaClicked: args.result.debug.entryCtaClicked === true,
    entryCtaClickedText: args.result.debug.entryCtaClickedText ?? null,
    entryCtaClickedSelector:
      args.result.debug.entryCtaClickedSelector ?? null,
    entryDismissedBlocker:
      args.result.debug.entryDismissedBlocker === true,
    handoffPageDetected: args.result.debug.handoffPageDetected === true,
    handoffUrl: args.result.debug.handoffUrl ?? null,
    handoffContinuationAttempted:
      args.result.debug.handoffContinuationAttempted === true,
    handoffContinuationSucceeded:
      args.result.debug.handoffContinuationSucceeded === true,
    handoffCtaFound: args.result.debug.handoffCtaFound === true,
    handoffCtaClicked: args.result.debug.handoffCtaClicked === true,
    handoffCtaClickedText:
      args.result.debug.handoffCtaClickedText ?? null,
    handoffCtaClickedSelector:
      args.result.debug.handoffCtaClickedSelector ?? null,
    handoffAttempts: args.result.debug.handoffAttempts ?? [],
    cookiePromptDetected: args.result.debug.cookiePromptDetected === true,
    cookiePromptClicked: args.result.debug.cookiePromptClicked === true,
    cookiePromptClickedText:
      args.result.debug.cookiePromptClickedText ?? null,
    cookiePromptSelector: args.result.debug.cookiePromptSelector ?? null,
    cookiePromptAttempts: args.result.debug.cookiePromptAttempts ?? [],
    postCookieWaitAttempted:
      args.result.debug.postCookieWaitAttempted === true,
    postCookieUrlBefore: args.result.debug.postCookieUrlBefore ?? null,
    postCookieUrlAfter: args.result.debug.postCookieUrlAfter ?? null,
    postCookieUrlChanged:
      args.result.debug.postCookieUrlChanged === true,
    postCookieProgressDetected:
      args.result.debug.postCookieProgressDetected === true,
    postCookieTitleAfter:
      args.result.debug.postCookieTitleAfter ?? null,
    applyCtaClickedText: args.result.debug.applyCtaClickedText ?? null,
    applyCtaClickedSelector:
      args.result.debug.applyCtaClickedSelector ?? null,
    ctaClickedText: args.result.debug.ctaClickedText ?? null,
    ctaClickedSelector: args.result.debug.ctaClickedSelector ?? null,
    dismissedBlocker: args.result.debug.dismissedBlocker === true,
    resolverCandidates: args.result.debug.resolverCandidates ?? [],
    resolverRejectedCandidates:
      args.result.debug.resolverRejectedCandidates ?? [],
    resolverSelectedLink: args.result.debug.resolverSelectedLink ?? null,
    adzunaHandoffFailureReasons:
      args.result.debug.adzunaHandoffFailureReasons ?? [],
    adzunaExternalLinkCandidates:
      args.result.debug.adzunaExternalLinkCandidates ?? [],
    adzunaBodyTextPreview:
      args.result.debug.adzunaBodyTextPreview ?? null,
    adzunaTokenizedInterstitialDetected:
      args.result.debug.adzunaTokenizedInterstitialDetected === true,
    adzunaTokenizedParamsPresent:
      args.result.debug.adzunaTokenizedParamsPresent ?? [],
    adzunaDownstreamCandidates:
      args.result.debug.adzunaDownstreamCandidates ?? [],
    adzunaScriptRedirectCandidates:
      args.result.debug.adzunaScriptRedirectCandidates ?? [],
    adzunaNetworkRedirectCandidates:
      args.result.debug.adzunaNetworkRedirectCandidates ?? [],
    adzunaFinalFailureReason:
      args.result.debug.adzunaFinalFailureReason ?? null,
    adzunaHandoffPageTitle:
      args.result.debug.adzunaHandoffPageTitle ?? null,
    adzunaHandoffVisibleCtas:
      args.result.debug.adzunaHandoffVisibleCtas ?? [],
    adzunaOverlayDetected:
      args.result.debug.adzunaOverlayDetected === true,
    adzunaOverlayDismissed:
      args.result.debug.adzunaOverlayDismissed === true,
    adzunaOverlayType: args.result.debug.adzunaOverlayType ?? null,
    adzunaOverlaySelectorsTried:
      args.result.debug.adzunaOverlaySelectorsTried ?? [],
    adzunaHandoffPopupOccurred:
      args.result.debug.adzunaHandoffPopupOccurred === true,
    adzunaHandoffUsedPopup:
      args.result.debug.adzunaHandoffUsedPopup === true,
    adzunaDownstreamConfirmed:
      args.result.debug.adzunaDownstreamConfirmed === true,
    adzunaAuthPageDetected:
      args.result.debug.adzunaAuthPageDetected === true,
    adzunaForgotPasswordDetected:
      args.result.debug.adzunaForgotPasswordDetected === true,
    adzunaLoginAttempted:
      args.result.debug.adzunaLoginAttempted === true,
    adzunaLoginSucceeded:
      args.result.debug.adzunaLoginSucceeded === true,
    adzunaLoginFailedReason:
      args.result.debug.adzunaLoginFailedReason ?? null,
    blockedResolvedHandoffCandidates:
      args.result.debug.blockedResolvedHandoffCandidates ?? [],
    selectedResolvedHandoffCandidate:
      args.result.debug.selectedResolvedHandoffCandidate ?? null,
    resolvedHandoffClickAttempted:
      args.result.debug.resolvedHandoffClickAttempted === true,
    resolvedHandoffClickSucceeded:
      args.result.debug.resolvedHandoffClickSucceeded === true,
    resolvedHandoffClickedHref:
      args.result.debug.resolvedHandoffClickedHref ?? null,
    resolvedHandoffClickedText:
      args.result.debug.resolvedHandoffClickedText ?? null,
    resolvedHandoffUrlBefore:
      args.result.debug.resolvedHandoffUrlBefore ?? null,
    resolvedHandoffUrlAfter:
      args.result.debug.resolvedHandoffUrlAfter ?? null,
    playwrightLaunchStrategy:
      args.result.debug.playwrightLaunchStrategy ?? null,
    playwrightPersistentContext:
      args.result.debug.playwrightPersistentContext === true,
    playwrightUserDataDir:
      args.result.debug.playwrightUserDataDir ?? null,
    currentUrl: stopDebug.currentUrl,
    applyCtaClicked: args.result.debug.applyCtaClicked === true,
    hopCount:
      typeof args.result.debug.hopCount === "number"
        ? args.result.debug.hopCount
        : 0,
    submitButtonClicked: args.result.debug.submitButtonClicked === true,
    confirmationTextFound: args.result.debug.confirmationTextFound === true,
    stopReason: stopDebug.stopReason,
    stopClassification: stopDebug.stopClassification,
  });
}

function logAutoApplyStopPoint(args: {
  applicationId: string;
  applySessionId?: string;
  phase: "background" | "foreground";
  result: ApplyExecutionResult;
}) {
  const stopDebug = buildStopDebugFromExecutionResult(args.result);
  if (!stopDebug) {
    return;
  }

  console.info("[AUTO_APPLY_STOP_POINT]", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    phase: args.phase,
    stoppedAtUrl: stopDebug.stoppedAtUrl,
    stoppedAtTitle: stopDebug.stoppedAtTitle,
    lastActionText: stopDebug.lastActionText,
    lastActionSelector: stopDebug.lastActionSelector,
    finalStatus: args.result.status,
  });
}

function buildStopResponseFields(result: ApplyExecutionResult) {
  const stopDebug = buildStopDebugFromExecutionResult(result);
  const finalUrl = stopDebug?.finalUrl ?? result.finalUrl ?? result.debug.finalUrl ?? null;

  if (!stopDebug) {
    return {
      finalUrl,
    };
  }

  return {
    stopReason: stopDebug.stopReason,
    finalUrl,
    currentUrl: stopDebug.currentUrl,
    stoppedAtUrl: stopDebug.stoppedAtUrl,
    stoppedAtTitle: stopDebug.stoppedAtTitle,
    lastAction: stopDebug.lastAction,
    lastActionText: stopDebug.lastActionText,
    lastActionSelector: stopDebug.lastActionSelector,
    stopClassification: stopDebug.stopClassification,
  };
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
  logAutoApplyDebug({
    applicationId: args.application.id,
    applySessionId: args.applySessionId,
    phase: args.phase,
    result: finalResult,
  });
  logAutoApplyStopPoint({
    applicationId: args.application.id,
    applySessionId: args.applySessionId,
    phase: args.phase,
    result: finalResult,
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
      debug: {
        ...(readAutomationAudit(args.application.auditJson).state.debug ?? {}),
        ...finalResult.debug,
      },
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
  urlResolution: DirectResolutionContext;
}) {
  try {
    const result = applyRouteLevelSubmissionGuard({
      rawResult: await applyWithPlaywright({
        jobUrl: args.application.jobUrl ?? "",
        form: args.targetUrl ? { embedUrl: args.targetUrl } : undefined,
        metadata: {
          originalUrl: args.urlResolution.originalUrl,
          resolvedUrl: args.urlResolution.resolvedDirectUrl,
          source: args.application.source,
          title: args.application.title ?? args.application.jobTitle,
          company: args.application.company,
          location: args.application.location,
          directJobResolution: {
            attempted:
              args.urlResolution.debug.directJobResolutionAttempted === true,
            confidence:
              args.urlResolution.debug.directJobResolutionConfidence,
            provider:
              args.urlResolution.debug.directJobResolutionProvider,
            matchReason:
              args.urlResolution.debug.directJobResolutionMatchReason,
            error: args.urlResolution.debug.directJobResolutionError,
            candidates:
              args.urlResolution.debug.directJobResolutionCandidates,
          },
        },
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

    const finalResult = ensureTerminalApplySessionResult({
      result: persistedOutcome.result,
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
    });
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

    const foundApplication = await findApplicationForUser(id, userId);

    if (!foundApplication) {
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 },
      );
    }

    let application: LoadedApplication = foundApplication;

    if (!application.jobUrl) {
      return NextResponse.json(
        { ok: false, error: "Application missing jobUrl" },
        { status: 400 },
      );
    }

    const directResolution = await resolveApplicationDirectJobUrl({
      application,
    });
    const urlResolution = directResolution.context;
    application = urlResolution.application;

    if (directResolution.blocked) {
      return NextResponse.json(
        {
          ok: false,
          status: "APPLY_NOT_STARTED",
          error: directResolution.message,
          ...buildUrlDecisionFields(urlResolution.debug),
        },
        { status: 409 },
      );
    }

    const prepared = await prepareAutomationInput({
      application,
      requestAnswers: body.answers,
    });
    const adzunaSourceDetected = isAdzunaApplySource({
      source: application.source,
      jobUrl: urlResolution.originalUrl || application.jobUrl,
    });

    console.log("[AUTO_APPLY_ROUTE] prepared apply payload", {
      applicationId: application.id,
      jobUrl: application.jobUrl,
      originalUrl: urlResolution.originalUrl || null,
      resolvedDirectUrl: urlResolution.resolvedDirectUrl ?? null,
      googleFirstResolutionTriggered:
        urlResolution.debug.googleFirstResolutionTriggered === true,
      directJobResolutionNormalizedLocation:
        urlResolution.debug.directJobResolutionNormalizedLocation ?? null,
      directJobResolutionSearchProvider:
        urlResolution.debug.directJobResolutionSearchProvider ?? null,
      directJobResolutionQueries:
        urlResolution.debug.directJobResolutionQueries ?? [],
      adzunaStrategyReplaySkipped:
        urlResolution.debug.adzunaStrategyReplaySkipped === true,
      usedResolvedDirectUrl: urlResolution.usedResolvedDirectUrl,
      targetUrl: prepared.targetUrl ?? application.jobUrl,
      usesExternalPostingUrl:
        (prepared.targetUrl ?? application.jobUrl) === application.jobUrl,
      applyProvider: prepared.applyProvider ?? null,
      missingRequired: prepared.missingRequired,
      answerCount: Object.keys(prepared.finalValuesToSubmit).length,
    });

    const chosenTargetUrl = normalizeJobUrl(
      prepared.targetUrl ?? application.jobUrl ?? "",
    );
    if (
      (adzunaSourceDetected && isAdzunaUrl(chosenTargetUrl)) ||
      isAdzunaUnresolvedHandoffUrl(chosenTargetUrl)
    ) {
      const message = adzunaSourceDetected
        ? ADZUNA_GOOGLE_FIRST_FAILURE_MESSAGE
        : ADZUNA_UNRESOLVED_TARGET_MESSAGE;

      console.warn("[AUTO_APPLY_ROUTE] blocking unresolved Adzuna target", {
        applicationId: application.id,
        originalUrl: urlResolution.originalUrl || null,
        resolvedDirectUrl: urlResolution.resolvedDirectUrl ?? null,
        chosenTargetUrl,
        applySource: urlResolution.debug.applySource ?? null,
        googleFirstResolutionTriggered:
          urlResolution.debug.googleFirstResolutionTriggered === true,
        directJobResolutionQueries:
          urlResolution.debug.directJobResolutionQueries ?? [],
      });

      const nextAudit = buildAutomationAudit({
        existingAudit: application.auditJson,
        provider: prepared.applyProvider ?? application.source ?? "playwright",
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        automation: {
          provider: "playwright",
          status: "FAILED",
          message,
          finalReason: message,
          debug: {
            ...(readAutomationAudit(application.auditJson).state.debug ?? {}),
            ...urlResolution.debug,
            targetUrl: chosenTargetUrl,
          },
        },
      });

      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          auditJson: nextAudit as Prisma.InputJsonValue,
          failureReason: message,
          verificationRequired: false,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "APPLY_NOT_STARTED",
          error: message,
          ...buildUrlDecisionFields({
            ...urlResolution.debug,
            targetUrl: chosenTargetUrl,
          }),
        },
        { status: 409 },
      );
    }

    console.log("[AUTO_APPLY_ROUTE] final target selected", {
      applicationId: application.id,
      originalUrl: urlResolution.originalUrl || null,
      resolvedDirectUrl: urlResolution.resolvedDirectUrl ?? null,
      targetUrl: chosenTargetUrl,
      usedResolvedDirectUrl: urlResolution.usedResolvedDirectUrl,
      applyProvider: prepared.applyProvider ?? null,
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
        urlResolution,
      });

      return NextResponse.json({
        ok: true,
        applySessionId: applySession.id,
        status: "STARTING",
        submissionStatus: "PENDING",
        emailStatus: "PENDING",
        message: "Starting Playwright automation.",
        ...buildUrlDecisionFields({
          ...urlResolution.debug,
          targetUrl: prepared.targetUrl,
        }),
      });
    }

    try {
      const result = applyRouteLevelSubmissionGuard({
        rawResult: await applyWithPlaywright({
          jobUrl: application.jobUrl ?? "",
          form: prepared.targetUrl ? { embedUrl: prepared.targetUrl } : undefined,
          metadata: {
            originalUrl: urlResolution.originalUrl,
            resolvedUrl: urlResolution.resolvedDirectUrl,
            source: application.source,
            title: application.title ?? application.jobTitle,
            company: application.company,
            location: application.location,
            directJobResolution: {
              attempted:
                urlResolution.debug.directJobResolutionAttempted === true,
              confidence:
                urlResolution.debug.directJobResolutionConfidence,
              provider:
                urlResolution.debug.directJobResolutionProvider,
              matchReason:
                urlResolution.debug.directJobResolutionMatchReason,
              error: urlResolution.debug.directJobResolutionError,
              candidates:
                urlResolution.debug.directJobResolutionCandidates,
            },
          },
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
          ...buildUrlDecisionFields(finalResult.debug),
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
            ...buildStopResponseFields(finalResult),
            ...buildUrlDecisionFields(finalResult.debug),
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
            ...buildStopResponseFields(finalResult),
            ...buildUrlDecisionFields(finalResult.debug),
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
            ...buildUrlDecisionFields(finalResult.debug),
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
            ...buildStopResponseFields(finalResult),
            ...buildUrlDecisionFields(finalResult.debug),
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
          ...buildStopResponseFields(finalResult),
          ...buildUrlDecisionFields(finalResult.debug),
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
