import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/app/lib/auth";
import {
  getSession,
  updateSession,
} from "@/app/lib/apply/applySessionStore";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

function text(value: unknown, max = 2000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeAnswers(value: unknown) {
  const answers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(asRecord(value)).slice(0, 80)) {
    const normalizedKey = text(key, 180);
    const normalizedValue = text(raw, 3000);
    if (normalizedKey && normalizedValue) answers[normalizedKey] = normalizedValue;
  }
  return answers;
}

function mergeSavedApplicationAnswerPreferences(args: {
  existingKeyQuestions: unknown;
  answers: Record<string, string>;
  saveToProfile: Record<string, boolean>;
}) {
  const keyQuestions = asRecord(args.existingKeyQuestions);
  const preferences = asRecord(keyQuestions.applicationAnswerPreferences);
  const customAnswers = {
    ...asRecord(preferences.customAnswers),
  } as Record<string, string>;

  const savedToProfile: string[] = [];
  for (const [label, answer] of Object.entries(args.answers)) {
    if (args.saveToProfile[label] !== true) continue;
    customAnswers[label] = answer;
    savedToProfile.push(label);
  }

  return {
    keyQuestions: {
      ...keyQuestions,
      applicationAnswerPreferences: {
        ...preferences,
        customAnswers,
      },
    },
    savedToProfile,
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await context.params;
    const applySession = getSession(sessionId, {
      caller: "POST /api/apply-sessions/[sessionId]/answers",
      sourcePath: "app/api/apply-sessions/[sessionId]/answers/route.ts",
      phase: "poll",
    });
    if (!applySession) {
      return NextResponse.json(
        { ok: false, error: "Apply session not found." },
        { status: 404 },
      );
    }

    const application = await prisma.jobApplication.findFirst({
      where: {
        id: applySession.applicationId,
        userProfile: { userId },
      },
      select: {
        id: true,
        answersJson: true,
        userProfile: {
          select: {
            id: true,
            keyQuestions: true,
          },
        },
      },
    });
    if (!application) {
      return NextResponse.json(
        { ok: false, error: "Application not found." },
        { status: 404 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      answers?: unknown;
      saveToProfile?: unknown;
    };
    const answers = normalizeAnswers(body.answers);
    const saveToProfile = Object.fromEntries(
      Object.entries(asRecord(body.saveToProfile)).map(([key, value]) => [
        text(key, 180),
        value === true,
      ]),
    );

    const existingAnswers = asRecord(application.answersJson);
    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        answersJson: {
          ...existingAnswers,
          ...answers,
        } as Prisma.InputJsonValue,
      },
    });

    const { keyQuestions, savedToProfile } = mergeSavedApplicationAnswerPreferences({
      existingKeyQuestions: application.userProfile.keyQuestions,
      answers,
      saveToProfile,
    });

    if (savedToProfile.length > 0) {
      await prisma.userProfile.update({
        where: { id: application.userProfile.id },
        data: {
          keyQuestions: keyQuestions as Prisma.InputJsonValue,
        },
      });
    }

    updateSession(
      applySession.id,
      {
        status: "WAITING_HUMAN",
        message:
          "Application answers were saved. Continue Auto Apply to retry with these answers.",
        debug: {
          ...(applySession.debug ?? {}),
          userProvidedAnswers: {
            ...(applySession.debug?.userProvidedAnswers ?? {}),
            ...answers,
          },
          userProvidedAnswersReadyToResume: true,
        },
      },
      {
        caller: "POST /api/apply-sessions/[sessionId]/answers",
        sourcePath: "app/api/apply-sessions/[sessionId]/answers/route.ts",
        phase: "poll",
      },
    );

    console.log("[AUTO_APPLY_USER_ANSWERS_SAVED]", {
      applySessionId: applySession.id,
      applicationId: applySession.applicationId,
      answerCount: Object.keys(answers).length,
      savedToProfile,
    });
    console.log("[AUTO_APPLY_RESUME_WITH_USER_ANSWERS]", {
      applySessionId: applySession.id,
      applicationId: applySession.applicationId,
      readyToResume: true,
    });

    return NextResponse.json({
      ok: true,
      applySessionId: applySession.id,
      savedToProfile,
      readyToResume: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to save answers.",
      },
      { status: 500 },
    );
  }
}
