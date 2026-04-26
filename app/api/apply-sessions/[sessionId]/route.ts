import { NextResponse } from "next/server";
import {
  getApplySessionStorageBackend,
  getSession,
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
  const session = getSession(sessionId, {
    caller: "GET /api/apply-sessions/[sessionId]",
    sourcePath: "app/api/apply-sessions/[sessionId]/route.ts",
    phase: "poll",
  });
  const storageBackendUsed = getApplySessionStorageBackend();

  if (!session) {
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
