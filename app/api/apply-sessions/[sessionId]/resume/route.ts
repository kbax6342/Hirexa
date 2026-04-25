import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import {
  getSession,
  updateSession,
} from "@/app/lib/apply/applySessionStore";
import {
  connectScrapflyBrowserSession,
  disconnectScrapflyBrowserSession,
} from "@/app/lib/apply/scrapfly-browser";
import { getScrapflySessionStatus } from "@/app/lib/apply/scrapfly-session-status";
import {
  inferApplyAutomationErrorCode,
  prefixErrorCodeInMessage,
} from "@/app/lib/apply/errorCodes";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

async function ensureApplicationOwnership(args: {
  applicationId: string;
  userId: string;
}) {
  const application = await prisma.jobApplication.findFirst({
    where: {
      id: args.applicationId,
      userProfile: { userId: args.userId },
    },
    select: {
      id: true,
    },
  });

  return Boolean(application);
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { sessionId } = await context.params;
    const applySession = getSession(sessionId, {
      caller: "POST /api/apply-sessions/[sessionId]/resume",
      sourcePath: "app/api/apply-sessions/[sessionId]/resume/route.ts",
      phase: "poll",
    });

    if (!applySession) {
      return NextResponse.json(
        { ok: false, error: "Apply session not found." },
        { status: 404 },
      );
    }

    const ownsApplication = await ensureApplicationOwnership({
      applicationId: applySession.applicationId,
      userId,
    });

    if (!ownsApplication) {
      return NextResponse.json(
        { ok: false, error: "Application not found." },
        { status: 404 },
      );
    }

    const scrapflySessionId = String(
      applySession.remoteSessionId ??
        "",
    ).trim();

    const provider = process.env.REMOTE_BROWSER_PROVIDER?.trim().toLowerCase();
    if (provider !== "scrapfly") {
      const errorCode = "REMOTE_PROVIDER_UNAVAILABLE" as const;
      const message =
        prefixErrorCodeInMessage({
          errorCode,
          message:
            "Resume is only available when Scrapfly remote browser sessions are enabled.",
        }) ??
        "Resume is only available when Scrapfly remote browser sessions are enabled.";
      return NextResponse.json(
        {
          ok: false,
          status: "SESSION_EXPIRED",
          errorCode,
          message,
          suggestedAction: "Restart Auto Apply to begin a fresh session.",
        },
        { status: 409 },
      );
    }

    if (!scrapflySessionId) {
      const errorCode = "REMOTE_SESSION_EXPIRED" as const;
      const message =
        prefixErrorCodeInMessage({
          errorCode,
          message:
            "No resumable Scrapfly session was found for this apply attempt. Restart auto apply to continue.",
        }) ??
        "No resumable Scrapfly session was found for this apply attempt. Restart auto apply to continue.";
      console.warn("[AUTO_APPLY_SCRAPFLY_SESSION_EXPIRED]", {
        applySessionId: applySession.id,
        applicationId: applySession.applicationId,
        scrapflySessionId: null,
        reason: "missing_scrapfly_session_id",
      });
      return NextResponse.json(
        {
          ok: false,
          status: "SESSION_EXPIRED",
          errorCode,
          message,
          suggestedAction: "Restart Auto Apply",
        },
        { status: 409 },
      );
    }

    const scrapflyStatus = await getScrapflySessionStatus(scrapflySessionId);

    if (!scrapflyStatus) {
      const errorCode = "REMOTE_SESSION_EXPIRED" as const;
      const message =
        prefixErrorCodeInMessage({
          errorCode,
          message:
            "Your live verification session expired. Restart auto apply to continue.",
        }) ?? "Your live verification session expired. Restart auto apply to continue.";
      console.warn("[AUTO_APPLY_SCRAPFLY_SESSION_EXPIRED]", {
        applySessionId: applySession.id,
        applicationId: applySession.applicationId,
        scrapflySessionId,
      });
      return NextResponse.json(
        {
          ok: false,
          status: "SESSION_EXPIRED",
          errorCode,
          message,
          suggestedAction: "Restart Auto Apply",
        },
        { status: 409 },
      );
    }

    if (scrapflyStatus.attachment === "human_agent") {
      updateSession(
        applySession.id,
        {
          status: "WAITING_HUMAN",
          message:
            "Manual verification is still in progress. Complete it in the live browser, then click Resume again.",
        },
        {
          caller: "POST /api/apply-sessions/[sessionId]/resume",
          sourcePath: "app/api/apply-sessions/[sessionId]/resume/route.ts",
          phase: "poll",
        },
      );
      return NextResponse.json(
        {
          ok: false,
          status: "WAITING_FOR_USER",
          message:
            "Manual verification is still in progress. Complete it in the live browser, then click Resume again.",
          suggestedAction: "Complete verification and retry resume.",
          scrapflySessionId: scrapflyStatus.sessionId,
          attachedBy: scrapflyStatus.attachedBy,
        },
        { status: 409 },
      );
    }

    if (scrapflyStatus.attachment === "scrapfly_agent") {
      return NextResponse.json(
        {
          ok: false,
          status: "WAITING_FOR_USER",
          message:
            "Automation is already connected to this live browser session. Wait for it to finish or start a fresh attempt.",
          suggestedAction: "Wait or restart Auto Apply",
          scrapflySessionId: scrapflyStatus.sessionId,
          attachedBy: scrapflyStatus.attachedBy,
        },
        { status: 409 },
      );
    }

    let currentUrl: string | null = null;
    try {
      const connection = await connectScrapflyBrowserSession({
        sessionId: scrapflyStatus.sessionId,
      });
      currentUrl = connection.page.url() || null;
      await disconnectScrapflyBrowserSession(connection.browser).catch(
        () => undefined,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Remote browser session disconnected before resume was ready.";
      const errorCode =
        inferApplyAutomationErrorCode({
          status: "FAILED",
          message,
          finalReason: message,
        }) ?? "REMOTE_SESSION_DISCONNECTED";
      const normalizedMessage =
        prefixErrorCodeInMessage({
          errorCode,
          message,
        }) ?? message;
      return NextResponse.json(
        {
          ok: false,
          status: "SESSION_EXPIRED",
          errorCode,
          message: normalizedMessage,
          suggestedAction: "Restart Auto Apply",
        },
        { status: 409 },
      );
    }

    console.info("[AUTO_APPLY_SCRAPFLY_SESSION_RESUME_READY]", {
      applySessionId: applySession.id,
      applicationId: applySession.applicationId,
      scrapflySessionId: scrapflyStatus.sessionId,
      currentUrl,
      attachedBy: scrapflyStatus.attachedBy,
    });

    updateSession(
      applySession.id,
      {
        status: "VERIFICATION_REQUIRED",
        lastUrl: currentUrl ?? applySession.lastUrl,
        message:
          "Verification appears complete. Resume auto apply from this page.",
      },
      {
        caller: "POST /api/apply-sessions/[sessionId]/resume",
        sourcePath: "app/api/apply-sessions/[sessionId]/resume/route.ts",
        phase: "poll",
      },
    );

    return NextResponse.json({
      ok: true,
      status: "RESUME_READY",
      message:
        "Verification appears complete. Resume auto apply from this page.",
      currentUrl,
      scrapflySessionId: scrapflyStatus.sessionId,
      attachedBy: scrapflyStatus.attachedBy,
      suggestedAction:
        "Resume auto apply now. If it does not proceed, restart with a fresh session.",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unable to resume apply session.";
    const errorCode = inferApplyAutomationErrorCode({
      status: "FAILED",
      message,
      finalReason: message,
    });
    const normalizedMessage =
      prefixErrorCodeInMessage({
        errorCode,
        message,
      }) ?? message;
    const statusCode = errorCode ? 409 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: normalizedMessage,
        message: normalizedMessage,
        errorCode: errorCode ?? undefined,
      },
      { status: statusCode },
    );
  }
}
