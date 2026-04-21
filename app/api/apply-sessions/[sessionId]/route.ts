import { NextResponse } from "next/server";
import {
  getApplySessionStorageBackend,
  getSession,
} from "@/app/lib/apply/applySessionStore";

export const runtime = "nodejs";
const VERIFICATION_REQUIRED_MESSAGE =
  "Application paused because the employer site asked for verification.";

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
  const isVerificationStop =
    session.status === "VERIFICATION_REQUIRED" ||
    stopClassification?.reason === "verification_required";

  if (!isVerificationStop) {
    return null;
  }

  return {
    message: VERIFICATION_REQUIRED_MESSAGE,
    stoppedAtUrl:
      session.debug?.stoppedAtUrl ?? session.debug?.finalUrl ?? session.lastUrl ?? null,
    stoppedAtTitle: session.debug?.stoppedAtTitle ?? null,
    suggestedAction: stopClassification?.suggestedAction ?? "complete_verification",
    canResumeAfterHumanStep: true,
    rtx: buildRtxStopPayload(session),
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
          message: verificationStop.message,
        }
      : session,
    stopPoint: verificationStop,
    rtxStop,
  });
}
