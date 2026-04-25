import { NextResponse } from "next/server";
import {
  getApplySessionStorageBackend,
  getSession,
} from "@/app/lib/apply/applySessionStore";
import { APPLY_VERIFICATION_REQUIRED_USER_MESSAGE } from "@/app/lib/apply/sessionStatus";

export const runtime = "nodejs";
const VERIFICATION_REQUIRED_MESSAGE = APPLY_VERIFICATION_REQUIRED_USER_MESSAGE;
const RTX_VERIFICATION_REQUIRED_MESSAGE =
  APPLY_VERIFICATION_REQUIRED_USER_MESSAGE;
const VERIFICATION_STOP_SIGNALS = [
  "just a moment",
  "performing security verification",
  "verify you are human",
  "verify you're human",
  "verify that you are human",
  "prove you are human",
  "checking if you are human",
  "checking your browser",
  "checking if the site connection is secure",
  "please enable javascript and cookies",
  "press & hold",
  "press and hold",
  "security check",
  "security verification",
  "cloudflare",
  "captcha",
  "hcaptcha",
  "recaptcha",
  "turnstile",
  "cf-chl",
] as const;

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
  const text = String(value ?? "").toLowerCase();
  if (!text) return null;
  return (
    VERIFICATION_STOP_SIGNALS.find((signal) => text.includes(signal)) ?? null
  );
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
  const isVerificationStop =
    session.status === "VERIFICATION_REQUIRED" ||
    stopClassification?.reason === "verification_required" ||
    stopClassification?.suggestedAction === "complete_verification" ||
    session.debug?.verificationDetected === true ||
    debugVerificationSignals.length > 0 ||
    Boolean(verificationSignalFromText);

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
    session.debug?.stoppedAtUrl ?? session.debug?.finalUrl ?? session.lastUrl ?? null;
  const stoppedAtTitle = session.debug?.stoppedAtTitle ?? null;
  const currentUrl = session.debug?.currentUrl ?? session.lastUrl ?? stoppedAtUrl;
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
    },
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

  return NextResponse.json({
    ok: true,
    found: true,
    storageBackendUsed,
    session: verificationStop
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
          },
        }
      : session,
    stopPoint: verificationStop,
    rtxStop,
  });
}
