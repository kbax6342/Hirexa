import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { HIREPILOT_SESSION_COOKIE } from "@/app/lib/hirepilot/checkHirePilotAccess";
import {
  buildInterviewReport,
  canGenerateInterviewReport,
  isMeaningfulInterviewSession,
  sanitizeDetectedQuestions,
  sanitizeSuggestedAnswers,
  type HirePilotSessionInputSource,
  type HirePilotSessionStatus,
} from "@/app/lib/hirepilot/interviewReport";

export const runtime = "nodejs";

type SessionRouteBody = {
  action?: "mark-source" | "complete";
  inputSource?: HirePilotSessionInputSource | null;
  reportEligible?: boolean | null;
  status?: HirePilotSessionStatus | null;
  transcript?: string | null;
  detectedQuestions?: unknown;
  suggestedAnswers?: unknown;
};

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isValidInputSource(value: unknown): value is HirePilotSessionInputSource {
  return value === "microphone" || value === "tab_audio" || value === "practice";
}

function isValidSessionStatus(value: unknown): value is HirePilotSessionStatus {
  return (
    value === "listening" ||
    value === "completed" ||
    value === "canceled" ||
    value === "failed"
  );
}

export async function PATCH(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const usageId = cookieStore.get(HIREPILOT_SESSION_COOKIE)?.value ?? null;

  if (!usageId) {
    return NextResponse.json({ ok: false, error: "No active HirePilot session." }, { status: 404 });
  }

  const usage = await prisma.hirePilotUsage.findFirst({
    where: {
      id: usageId,
      userId,
    },
    select: {
      id: true,
      createdAt: true,
      status: true,
      inputSource: true,
      reportEligible: true,
    },
  });

  if (!usage) {
    return NextResponse.json({ ok: false, error: "No active HirePilot session." }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as SessionRouteBody | null;
  const action = body?.action;

  if (action !== "mark-source" && action !== "complete") {
    return NextResponse.json({ ok: false, error: "Invalid session action." }, { status: 400 });
  }

  if (action === "mark-source") {
    const inputSource = isValidInputSource(body?.inputSource) ? body.inputSource : null;
    const nextReportEligible = Boolean(body?.reportEligible);

    if (!inputSource) {
      return NextResponse.json({ ok: false, error: "Invalid input source." }, { status: 400 });
    }

    const shouldPreserveTabAudio =
      usage.inputSource === "tab_audio" && usage.reportEligible && inputSource !== "tab_audio";

    const updated = await prisma.hirePilotUsage.update({
      where: { id: usage.id },
      data: {
        status: "listening",
        inputSource: shouldPreserveTabAudio ? usage.inputSource : inputSource,
        reportEligible: shouldPreserveTabAudio ? true : nextReportEligible,
      },
      select: {
        id: true,
        status: true,
        inputSource: true,
        reportEligible: true,
      },
    });

    return NextResponse.json({
      ok: true,
      session: updated,
    });
  }

  const inputSource = isValidInputSource(body?.inputSource)
    ? body.inputSource
    : usage.inputSource && isValidInputSource(usage.inputSource)
      ? usage.inputSource
      : null;
  const transcript = normalizeText(body?.transcript);
  const detectedQuestions = sanitizeDetectedQuestions(body?.detectedQuestions);
  const suggestedAnswers = sanitizeSuggestedAnswers(body?.suggestedAnswers);
  const hasMeaningfulContent = isMeaningfulInterviewSession({
    transcript,
    detectedQuestions,
    suggestedAnswers,
  });
  const status = isValidSessionStatus(body?.status)
    ? body.status
    : hasMeaningfulContent
      ? "completed"
      : "canceled";
  const reportEligible = Boolean(body?.reportEligible ?? usage.reportEligible);
  const endedAt = new Date();
  const shouldGenerateReport =
    hasMeaningfulContent &&
    canGenerateInterviewReport({
      inputSource,
      reportEligible,
      status,
    });
  const report = shouldGenerateReport
    ? buildInterviewReport({
        startedAt: usage.createdAt,
        endedAt,
        transcript,
        detectedQuestions,
        suggestedAnswers,
      })
    : null;

  const data: Prisma.HirePilotUsageUpdateInput = {
    status,
    inputSource,
    reportEligible,
    endedAt,
    transcript: transcript ? ({ text: transcript } as Prisma.InputJsonValue) : Prisma.JsonNull,
    detectedQuestions:
      detectedQuestions.length > 0
        ? (detectedQuestions as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    suggestedAnswers:
      suggestedAnswers.length > 0
        ? (suggestedAnswers as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    report: report ? (report as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
  };

  const updated = await prisma.hirePilotUsage.update({
    where: { id: usage.id },
    data,
    select: {
      id: true,
      status: true,
      inputSource: true,
      reportEligible: true,
      report: true,
      endedAt: true,
      createdAt: true,
    },
  });

  const response = NextResponse.json({
    ok: true,
    session: {
      id: updated.id,
      status: updated.status,
      inputSource: updated.inputSource,
      reportEligible: updated.reportEligible,
      report: updated.report,
      createdAt: updated.createdAt,
      endedAt: updated.endedAt,
    },
    reportAvailable: Boolean(report),
  });

  response.cookies.delete(HIREPILOT_SESSION_COOKIE);
  return response;
}
