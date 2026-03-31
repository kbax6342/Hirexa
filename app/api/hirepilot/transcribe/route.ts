import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";

import { auth } from "@/auth";
import {
  HIREPILOT_SESSION_COOKIE,
  getHirePilotBillingStatus,
} from "@/app/lib/hirepilot/checkHirePilotAccess";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

function trimText(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(HIREPILOT_SESSION_COOKIE)?.value ?? null;

    if (!sessionCookie) {
      const status = await getHirePilotBillingStatus(userId);
      return NextResponse.json(
        {
          ok: false,
          error: "HirePilot access required",
          hasHirePilotAccess: status.hasHirePilotAccess,
          hirePilotUnlimited: status.hirePilotUnlimited,
          hirePilotCredits: status.hirePilotCredits,
          starterCredits: status.starterCredits,
          starterCreditsGranted: status.starterCreditsGranted,
        },
        { status: 403 }
      );
    }

    const activeUsage = await prisma.hirePilotUsage.findFirst({
      where: {
        id: sessionCookie,
        userId,
      },
      select: { id: true },
    });

    if (!activeUsage) {
      const status = await getHirePilotBillingStatus(userId);
      return NextResponse.json(
        {
          ok: false,
          error: "HirePilot access required",
          hasHirePilotAccess: status.hasHirePilotAccess,
          hirePilotUnlimited: status.hirePilotUnlimited,
          hirePilotCredits: status.hirePilotCredits,
          starterCredits: status.starterCredits,
          starterCreditsGranted: status.starterCreditsGranted,
        },
        { status: 403 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Audio transcription is unavailable right now." },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("audio");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { ok: false, error: "Audio file is required." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcript = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
      prompt:
        "Transcribe the interviewer's spoken question only when speech is audible. Return concise plain text.",
    });

    return NextResponse.json({
      ok: true,
      transcript: trimText(transcript.text),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to transcribe shared audio.",
      },
      { status: 500 }
    );
  }
}
