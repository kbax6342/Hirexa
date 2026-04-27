import { NextResponse } from "next/server";
import {
  getApplySessionStorageBackend,
  getSession,
  updateSession,
} from "@/app/lib/apply/applySessionStore";
import { APPLY_VERIFICATION_REQUIRED_USER_MESSAGE } from "@/app/lib/apply/sessionStatus";
import { detectVerificationGate } from "@/app/lib/apply/verification";
import {
  isAdzunaUrl,
  isAggregatorHandoffUrl,
  isSearchResultsUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";
import {
  inferApplyAutomationErrorCode,
  prefixErrorCodeInMessage,
} from "@/app/lib/apply/errorCodes";
import { shouldAllowVerificationRequired } from "@/app/lib/apply/stopClassification";

export const runtime = "nodejs";
const VERIFICATION_REQUIRED_MESSAGE = APPLY_VERIFICATION_REQUIRED_USER_MESSAGE;
const RTX_VERIFICATION_REQUIRED_MESSAGE =
  APPLY_VERIFICATION_REQUIRED_USER_MESSAGE;

const ACTIVE_APPLY_SESSION_STATUSES = new Set([
  "STARTING",
  "OPENING_FORM",
  "FILLING_FORM",
  "SUBMITTING",
  "SUBMITTING_APPLICATION",
  "WAITING_CONFIRMATION",
  "WAITING_FOR_CONFIRMATION",
]);
const NO_HEARTBEAT_STALE_MS = 90_000;
const FILLING_FORM_NO_RUNNER_HEARTBEAT_MS = 60_000;
const FILLING_FORM_NO_PROGRESS_MS = 120_000;
const SUBMITTING_NO_CONFIRMATION_MS = 120_000;
const STALE_SESSION_MESSAGE =
  "The browser session stopped before Hirexa could finish this application.";
const STALE_SESSION_SUGGESTED_ACTION =
  "Retry Auto Apply or open the application manually.";
function parseHostname(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isRtxHostname(hostname: string) {
  return (
    hostname === "rtx.com" ||
    hostname.endsWith(".rtx.com") ||
    hostname.endsWith(".myworkdayjobs.com") ||
    hostname.endsWith(".workdayjobs.com")
  );
}

function isActiveSessionStatus(status: string | null | undefined) {
  return ACTIVE_APPLY_SESSION_STATUSES.has(String(status ?? ""));
}

function recoverStaleSessionIfNeeded(
  session: NonNullable<ReturnType<typeof getSession>>,
) {
  if (!isActiveSessionStatus(session.status) || session.recoveredFromStaleSession) {
    return session;
  }

  const now = Date.now();
  const fillingFormStartedAt =
    session.fillingFormStartedAt ??
    (session.status === "FILLING_FORM" ? session.lastStatusChangeAt ?? session.updatedAt ?? session.startedAt : 0);
  const fillingFormAge = fillingFormStartedAt ? now - fillingFormStartedAt : 0;
  const lastRunnerHeartbeatAt = session.lastRunnerHeartbeatAt ?? 0;
  const lastMeaningfulFormProgressAt =
    session.lastMeaningfulFormProgressAt ?? session.lastRunnerProgressAt ?? 0;
  const lastSubmitAttemptAt =
    session.debug?.submitAttempted === true
      ? session.lastFormRecheckAt ?? session.lastRunnerProgressAt ?? session.updatedAt
      : 0;
  const heartbeatAge = lastRunnerHeartbeatAt
    ? now - lastRunnerHeartbeatAt
    : Number.POSITIVE_INFINITY;
  const progressAge = lastMeaningfulFormProgressAt
    ? now - lastMeaningfulFormProgressAt
    : Number.POSITIVE_INFINITY;
  const submitAttemptAge = lastSubmitAttemptAt
    ? now - lastSubmitAttemptAt
    : Number.POSITIVE_INFINITY;
  let staleReason: string | null = null;
  let recoveredStatus:
    | typeof session.status
    | "READY_TO_RETRY"
    | "STALE_SESSION"
    | "WAITING_FOR_CONFIRMATION"
    | "SUBMITTING_APPLICATION"
    | "READY_FOR_USER_REVIEW"
    | "NEEDS_USER_ANSWERS"
    | "SUBMITTED"
    | null = null;

  if (
    session.status === "FILLING_FORM" &&
    session.debug?.finalRecheckPassed === true &&
    (session.debug?.missingRequiredFields?.length ?? 0) === 0 &&
    (session.debug?.aiFormBlockedCount ?? 0) === 0 &&
    session.debug?.readyToSubmit === true
  ) {
    staleReason = "Final form recheck passed but the session did not advance.";
    recoveredStatus =
      session.debug?.submitAttempted === true
        ? session.debug?.submissionConfirmed === true
          ? "SUBMITTED"
          : submitAttemptAge > SUBMITTING_NO_CONFIRMATION_MS
            ? "WAITING_FOR_CONFIRMATION"
            : (session.debug?.visibleValidationErrors?.length ?? 0) > 0
            ? "NEEDS_USER_ANSWERS"
            : "SUBMITTING_APPLICATION"
        : session.debug?.reviewBeforeSubmit === true
          ? "READY_FOR_USER_REVIEW"
          : "READY_TO_RETRY";
  } else if (
    session.status === "FILLING_FORM" &&
    !lastRunnerHeartbeatAt &&
    fillingFormAge > FILLING_FORM_NO_RUNNER_HEARTBEAT_MS
  ) {
    staleReason = "No active background runner heartbeat was found.";
    recoveredStatus = "STALE_SESSION";
  } else if (
    (session.status === "FILLING_FORM" && heartbeatAge > NO_HEARTBEAT_STALE_MS) ||
    ((session.status === "STARTING" || session.status === "OPENING_FORM") &&
      heartbeatAge > NO_HEARTBEAT_STALE_MS)
  ) {
    staleReason =
      session.status === "FILLING_FORM"
        ? "The background apply runner stopped sending heartbeats."
        : "No active background runner heartbeat was found.";
    recoveredStatus =
      session.status === "FILLING_FORM" &&
      (session.debug?.formDetected === true || session.debug?.formFound === true)
        ? "READY_TO_RETRY"
        : "STALE_SESSION";
  } else if (
    session.status === "FILLING_FORM" &&
    progressAge > FILLING_FORM_NO_PROGRESS_MS
  ) {
    staleReason = "No meaningful form progress was recorded before the timeout.";
    recoveredStatus = "READY_TO_RETRY";
  } else if (
    (session.status === "SUBMITTING" ||
      session.status === "SUBMITTING_APPLICATION" ||
      session.status === "WAITING_CONFIRMATION" ||
      session.status === "WAITING_FOR_CONFIRMATION") &&
    progressAge > SUBMITTING_NO_CONFIRMATION_MS
  ) {
    staleReason = "Submit or confirmation did not finish before the timeout.";
    recoveredStatus =
      session.status === "SUBMITTING" || session.status === "SUBMITTING_APPLICATION"
        ? "WAITING_FOR_CONFIRMATION"
        : "READY_TO_RETRY";
  }

  if (!staleReason || !recoveredStatus) {
    return session;
  }

  console.warn("[APPLY_SESSION_STALE_DETECTED]", {
    sessionId: session.id,
    applicationId: session.applicationId,
    previousStatus: session.status,
    recoveredStatus,
    heartbeatAge,
    progressAge,
    fillingFormAge,
    staleReason,
    latestUrl:
      session.debug?.latestUrl ?? session.debug?.currentUrl ?? session.lastUrl ?? null,
  });
  console.warn("[APPLY_SESSION_FILLING_FORM_RECOVERY]", {
    sessionId: session.id,
    applicationId: session.applicationId,
    previousStatus: session.status,
    recoveredStatus,
    staleReason,
    fillingFormAge,
    heartbeatAge,
    progressAge,
    finalRecheckPassed: session.debug?.finalRecheckPassed === true,
    readyToSubmit: session.debug?.readyToSubmit === true,
    submitAttempted: session.debug?.submitAttempted === true,
  });
  console.warn("[APPLY_SESSION_FILLING_FORM_STALE_RECOVERY]", {
    sessionId: session.id,
    applicationId: session.applicationId,
    previousStatus: session.status,
    recoveredStatus,
    staleReason,
    fillingFormAge,
    heartbeatAge,
    progressAge,
  });

  const recoveredMessage =
    recoveredStatus === "READY_FOR_USER_REVIEW"
      ? "Hirexa filled the application. Review the form before submitting."
      : recoveredStatus === "WAITING_FOR_CONFIRMATION"
        ? "Hirexa clicked Submit Application but could not confirm the final Greenhouse confirmation page."
        : recoveredStatus === "NEEDS_USER_ANSWERS"
          ? "The application returned validation errors after submit."
          : STALE_SESSION_MESSAGE;
  const recoveredSuggestedAction =
    recoveredStatus === "READY_FOR_USER_REVIEW"
      ? "Open review."
      : recoveredStatus === "WAITING_FOR_CONFIRMATION"
        ? "Check the opened confirmation tab or your email."
        : recoveredStatus === "NEEDS_USER_ANSWERS"
          ? "Answer questions to continue."
          : STALE_SESSION_SUGGESTED_ACTION;
  const recovered = updateSession(
    session.id,
    {
      status: recoveredStatus,
      runnerActive: false,
      recoveredFromStaleSession: recoveredStatus !== "SUBMITTING_APPLICATION",
      staleReason,
      message: recoveredMessage,
      error: recoveredStatus === "STALE_SESSION" ? STALE_SESSION_MESSAGE : undefined,
      lastUrl:
        session.debug?.latestUrl ??
        session.debug?.currentUrl ??
        session.debug?.stoppedAtUrl ??
        session.lastUrl,
      debug: {
        ...(session.debug ?? {}),
        recoveredFromStaleSession: recoveredStatus !== "SUBMITTING_APPLICATION",
        staleReason,
        suggestedAction: recoveredSuggestedAction,
        latestUrl:
          session.debug?.latestUrl ??
          session.debug?.currentUrl ??
          session.debug?.stoppedAtUrl ??
          session.lastUrl,
        stoppedAtUrl:
          session.debug?.stoppedAtUrl ??
          session.debug?.latestUrl ??
          session.debug?.currentUrl ??
          session.lastUrl,
        finalReason: "The apply browser session appears to have stopped before finishing.",
      },
    },
    {
      caller: "GET /api/apply-sessions/[sessionId].staleRecovery",
      sourcePath: "app/api/apply-sessions/[sessionId]/route.ts",
      phase: "poll",
    },
  );

  console.warn("[APPLY_SESSION_STALE_RECOVERED]", {
    sessionId: session.id,
    applicationId: session.applicationId,
    previousStatus: session.status,
    recoveredStatus: recovered?.status ?? recoveredStatus,
    staleReason,
  });

  return recovered ?? session;
}

function detectVerificationSignal(value: string | null | undefined) {
  const detection = detectVerificationGate({
    pageText: value,
  });
  return detection.detected ? detection.signal ?? "verification_required" : null;
}

function pickLatestSessionStopUrl(
  session: NonNullable<ReturnType<typeof getSession>>,
) {
  const prioritized = [
    session.debug?.confirmationUrl ?? null,
    session.debug?.confirmationFinalUrl ?? null,
    session.debug?.stoppedAtUrl ?? null,
    session.debug?.latestUrl ?? null,
    session.debug?.currentUrl ?? null,
    session.debug?.finalUrl ?? null,
    session.lastUrl ?? null,
    session.debug?.handoffFinalUrl ?? null,
    session.debug?.handoffAfterUrl ?? null,
    session.debug?.resolvedDirectUrl ?? null,
    session.debug?.targetUrl ?? null,
    session.debug?.originalJobUrl ?? null,
  ]
    .map((value) => normalizeJobUrl(String(value ?? "")))
    .filter(Boolean);

  if (prioritized.length === 0) {
    return null;
  }

  const first = prioritized[0] ?? null;
  const downstream = prioritized.find(
    (candidate) =>
      !isAdzunaUrl(candidate) &&
      !isAggregatorHandoffUrl(candidate) &&
      !isSearchResultsUrl(candidate),
  );

  if (
    first &&
    (isAdzunaUrl(first) ||
      isAggregatorHandoffUrl(first) ||
      isSearchResultsUrl(first)) &&
    downstream
  ) {
    return downstream;
  }

  return first;
}

function isVerificationClassification(
  classification:
    | {
        reason?: string | null;
        suggestedAction?: string | null;
      }
    | null
    | undefined,
) {
  return (
    classification?.reason === "verification_required" ||
    classification?.suggestedAction === "complete_verification"
  );
}

function buildRtxStopPayload(
  session: NonNullable<ReturnType<typeof getSession>>,
) {
  const finalHost = parseHostname(session.debug?.finalUrl ?? null);
  const currentHost = parseHostname(session.debug?.currentUrl ?? null);
  const finalReason = String(session.debug?.finalReason ?? "").trim();
  const hasRtxSignal =
    session.debug?.rtxFlowAttempted === true ||
    isRtxHostname(finalHost) ||
    isRtxHostname(currentHost) ||
    finalReason.toUpperCase().includes("RTX_");

  if (!hasRtxSignal) {
    return null;
  }

  return {
    flowAttempted: session.debug?.rtxFlowAttempted === true,
    flowCompleted: session.debug?.rtxFlowCompleted === true,
    failureReason:
      session.debug?.rtxFailureReason ??
      (finalReason.length > 0 ? finalReason : null),
    jobId: session.debug?.rtxJobId ?? null,
    progressMarkers: [
      ...new Set([
        ...(session.debug?.rtxProgressMarkers ?? []),
        "RTX_STOP_REASON_CLASSIFIED",
      ]),
    ],
  };
}

function buildVerificationStopPayload(
  session: NonNullable<ReturnType<typeof getSession>>,
) {
  if (
    session.status === "WAITING_FOR_CONFIRMATION" ||
    session.status === "WAITING_CONFIRMATION" ||
    session.debug?.stopClassification?.reason === "submission_status_unclear"
  ) {
    return null;
  }

  const stopClassification = session.debug?.stopClassification ?? null;
  const debugVerificationSignals = session.debug?.verificationSignals ?? [];
  const verificationSignalFromDebug = debugVerificationSignals[0] ?? null;
  const verificationSignalFromText =
    detectVerificationSignal(
      [
        session.message,
        session.error,
        session.lastUrl,
        session.debug?.finalUrl,
        session.debug?.currentUrl,
        session.debug?.stoppedAtTitle,
        session.debug?.finalReason,
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join("\n"),
    ) ?? null;
  const allowVerificationRequired = shouldAllowVerificationRequired(
    {
      status: session.status,
      lastAction: session.debug?.lastAction,
      verificationSignals: debugVerificationSignals,
      needsHuman: session.debug?.needsHuman,
    },
    {
      attemptedSelectors: session.debug?.attemptedSelectors,
      applyCtaFound: session.debug?.applyCtaFound,
      applyCtaClicked: session.debug?.applyCtaClicked,
      hopCount: session.debug?.hopCount,
      formScanAttempted: session.debug?.formScanAttempted,
      formFound: session.debug?.formFound ?? session.debug?.formDetected,
      formFillAttempted: session.debug?.formFillAttempted,
      verificationEvidence: session.debug?.verificationEvidence,
    },
  );
  const isVerificationStop =
    ((session.status === "VERIFICATION_REQUIRED" ||
      stopClassification?.reason === "verification_required" ||
      stopClassification?.suggestedAction === "complete_verification") &&
      allowVerificationRequired) ||
    (session.debug?.verificationDetected === true && allowVerificationRequired) ||
    (debugVerificationSignals.length > 0 && allowVerificationRequired) ||
    (Boolean(verificationSignalFromText) && allowVerificationRequired);

  if (!isVerificationStop) {
    return null;
  }

  const normalizedStopClassification =
    stopClassification && isVerificationClassification(stopClassification)
      ? {
          ...stopClassification,
          reason: "verification_required" as const,
          pageType: "human_verification_gate" as const,
          suggestedAction: "complete_verification" as const,
        }
      : {
          reason: "verification_required" as const,
          pageType: "human_verification_gate" as const,
          suggestedAction: "complete_verification" as const,
        };
  const rtxStop = buildRtxStopPayload(session);
  const stoppedAtUrl =
    pickLatestSessionStopUrl(session) ??
    session.debug?.stoppedAtUrl ??
    session.debug?.finalUrl ??
    session.lastUrl ??
    null;
  const stoppedAtTitle = session.debug?.stoppedAtTitle ?? null;
  const currentUrl = session.debug?.currentUrl ?? session.lastUrl ?? stoppedAtUrl;
  const scrapflySessionId = session.remoteSessionId ?? null;
  const hostSignal = parseHostname(stoppedAtUrl);
  const isRtxVerification =
    Boolean(rtxStop) ||
    isRtxHostname(hostSignal) ||
    Boolean(
      detectVerificationSignal(
        [stoppedAtTitle, stoppedAtUrl]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .join("\n"),
      ),
    );
  const message = isRtxVerification
    ? RTX_VERIFICATION_REQUIRED_MESSAGE
    : VERIFICATION_REQUIRED_MESSAGE;
  const verificationSignal =
    verificationSignalFromDebug ?? verificationSignalFromText ?? null;
  const evidenceSnippet = [
    stoppedAtTitle,
    verificationSignal,
    session.debug?.lastActionText ?? null,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" | ")
    .slice(0, 280);

  if (isRtxVerification) {
    console.info("[AUTO_APPLY_RTX_PROGRESS]", {
      marker: "RTX_VERIFICATION_REQUIRED_UI_MESSAGE_MAPPED",
      sessionId: session.id,
      stoppedAtUrl,
      stoppedAtTitle,
      verificationSignal:
        verificationSignal,
    });
    console.info("[AUTO_APPLY_RTX_PROGRESS]", {
      marker: "RTX_VERIFICATION_REQUIRED_RESUME_AVAILABLE",
      sessionId: session.id,
      canResumeAfterHumanStep: true,
      suggestedAction: "complete_verification",
    });
  }

  return {
    reason: "Security verification required",
    humanMessage: message,
    message,
    currentUrl,
    stoppedAtUrl,
    openUrl: stoppedAtUrl ?? currentUrl,
    stoppedAtTitle,
    suggestedAction: normalizedStopClassification.suggestedAction,
    stopClassification: normalizedStopClassification,
    canResumeAfterHumanStep: true,
    retryMode: "last_url",
    retryContext: {
      canResumeAfterHumanStep: true,
      retryMode: "last_url",
      launchStrategy: session.debug?.playwrightLaunchStrategy ?? null,
      persistentContext: session.debug?.playwrightPersistentContext ?? null,
      scrapflySessionId,
      resumeEndpoint: `/api/apply-sessions/${session.id}/resume`,
    },
    scrapflySessionId,
    resumeEndpoint: `/api/apply-sessions/${session.id}/resume`,
    evidence: evidenceSnippet || verificationSignal || null,
    evidenceDetail: {
      title: stoppedAtTitle,
      challengeText: verificationSignal,
    },
    rtx: rtxStop,
  };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const loadedSession = getSession(sessionId, {
    caller: "GET /api/apply-sessions/[sessionId]",
    sourcePath: "app/api/apply-sessions/[sessionId]/route.ts",
    phase: "poll",
  });
  const storageBackendUsed = getApplySessionStorageBackend();

  if (!loadedSession) {
    return NextResponse.json(
      {
        ok: false,
        found: false,
        error: "Apply session not found.",
        storageBackendUsed,
      },
      { status: 404 },
    );
  }
  const session = recoverStaleSessionIfNeeded(loadedSession);

  const verificationStop = buildVerificationStopPayload(session);
  const rtxStop = buildRtxStopPayload(session);
  const latestSessionStopUrl =
    pickLatestSessionStopUrl(session) ??
    session.debug?.stoppedAtUrl ??
    session.debug?.currentUrl ??
    session.debug?.finalUrl ??
    session.lastUrl ??
    null;
  const inferredErrorCode = inferApplyAutomationErrorCode({
    errorCode: session.errorCode ?? null,
    stopClassification:
      verificationStop?.stopClassification ?? session.debug?.stopClassification ?? null,
    status: verificationStop ? "VERIFICATION_REQUIRED" : session.status,
    message:
      verificationStop?.message ??
      session.message ??
      session.error ??
      null,
    finalReason: session.debug?.finalReason ?? null,
  });
  const normalizedMessage =
    prefixErrorCodeInMessage({
      errorCode: inferredErrorCode,
      message:
        verificationStop?.message ??
        session.message ??
        session.error ??
        null,
    }) ??
    verificationStop?.message ??
    session.message ??
    session.error ??
    null;
  const sessionPayload = verificationStop
    ? {
        ...session,
        status: "VERIFICATION_REQUIRED",
        message: verificationStop.message,
        debug: {
          ...(session.debug ?? {}),
          stopClassification:
            verificationStop.stopClassification ??
            session.debug?.stopClassification,
          lastAction:
            session.debug?.lastAction === "verification_required"
              ? session.debug.lastAction
              : "verification_required",
          latestUrl: latestSessionStopUrl ?? undefined,
          stoppedAtUrl:
            latestSessionStopUrl ??
            session.debug?.stoppedAtUrl ??
            undefined,
          currentUrl:
            session.debug?.currentUrl ??
            latestSessionStopUrl ??
            undefined,
          finalUrl:
            session.debug?.finalUrl ??
            latestSessionStopUrl ??
            undefined,
        },
      }
    : {
        ...session,
        debug: {
          ...(session.debug ?? {}),
          ...(session.status === "WAITING_FOR_CONFIRMATION" ||
          session.status === "WAITING_CONFIRMATION"
            ? {
                stopReason: undefined,
                stopClassification: {
                  reason: "submission_status_unclear" as const,
                  pageType: "post_submit_unknown" as const,
                  suggestedAction: "check_confirmation_tab_or_email" as const,
                },
                verificationDetected: false,
                verificationSignals: [],
              }
            : {}),
          latestUrl: latestSessionStopUrl ?? undefined,
          stoppedAtUrl:
            latestSessionStopUrl ??
            session.debug?.stoppedAtUrl ??
            undefined,
          currentUrl:
            session.debug?.currentUrl ??
            latestSessionStopUrl ??
            undefined,
          finalUrl:
            session.debug?.finalUrl ??
            latestSessionStopUrl ??
            undefined,
        },
      };

  console.info(
    "[APPLY_SESSION] Step 3 completed: stop-point URL now prefers latest downstream browser URL",
    {
      sessionId,
      status: sessionPayload.status,
      stoppedAtUrl: sessionPayload.debug?.stoppedAtUrl ?? null,
      latestUrl: sessionPayload.debug?.latestUrl ?? null,
    },
  );

  return NextResponse.json({
    ok: true,
    found: true,
    storageBackendUsed,
    session: {
      ...sessionPayload,
      message: normalizedMessage ?? sessionPayload.message,
      recoveredFromStaleSession: sessionPayload.recoveredFromStaleSession,
      staleReason: sessionPayload.staleReason,
      suggestedAction: sessionPayload.debug?.suggestedAction ?? null,
      errorCode: inferredErrorCode ?? sessionPayload.errorCode,
      error:
        sessionPayload.error && inferredErrorCode
          ? prefixErrorCodeInMessage({
              errorCode: inferredErrorCode,
              message: sessionPayload.error,
            }) ?? sessionPayload.error
          : sessionPayload.error,
    },
    stopPoint: verificationStop,
    rtxStop,
  });
}
