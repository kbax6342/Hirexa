import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

async function getUserId() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  return userId ?? null;
}

export async function GET() {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json({ completed: false, data: null }, { status: 200 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: {
        keyQuestions: true,
        questionsCompleted: true,
        registrationStatus: true,
      },
    });

    const keyQuestions = (profile?.keyQuestions as Record<string, unknown> | null) ?? null;
    const completed = Boolean(
      profile?.questionsCompleted ||
        keyQuestions ||
        profile?.registrationStatus === "KEY_QUESTIONS_COMPLETE"
    );

    return NextResponse.json({ completed, data: keyQuestions }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server error in GET key-questions.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const payload = {
      authorizedUS: String(body.authorizedUS ?? "").trim(),
      sponsorship: String(body.sponsorship ?? "").trim(),
      felony: String(body.felony ?? "").trim(),
      startDate: String(body.startDate ?? "").trim(),
      screening: String(body.screening ?? "").trim(),
      relocate: String(body.relocate ?? "").trim(),
      gender: String(body.gender ?? "").trim(),
      pronouns: String(body.pronouns ?? "").trim(),
      ethnicity: String(body.ethnicity ?? "").trim(),
      disability: String(body.disability ?? "").trim(),
      veteran: String(body.veteran ?? "").trim(),
    };

    if (!payload.authorizedUS || !payload.sponsorship || !payload.felony) {
      return NextResponse.json(
        { error: "Please answer the required questions." },
        { status: 400 }
      );
    }

    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        questionsCompleted: true,
        registrationStatus: "KEY_QUESTIONS_COMPLETE",
        keyQuestions: payload,
        ...payload,
      },
      update: {
        questionsCompleted: true,
        registrationStatus: "KEY_QUESTIONS_COMPLETE",
        keyQuestions: payload,
        ...payload,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server error in POST key-questions.",
      },
      { status: 500 }
    );
  }
}
