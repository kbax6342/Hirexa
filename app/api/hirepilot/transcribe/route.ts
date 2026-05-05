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

function debugHirePilotAudioServer(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.info("[HIREPILOT_AUDIO]", message, details);
    return;
  }

  console.info("[HIREPILOT_AUDIO]", message);
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Sign in again to use HirePilot transcription." },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(HIREPILOT_SESSION_COOKIE)?.value ?? null;

    if (!sessionCookie) {
      debugHirePilotAudioServer("shared audio transcription blocked", {
        hasSessionCookie: false,
        userId,
      });
      const status = await getHirePilotBillingStatus(userId);
      return NextResponse.json(
        {
          ok: false,
          error: "Start or unlock a HirePilot live session before shared audio transcription.",
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
      debugHirePilotAudioServer("shared audio transcription blocked", {
        hasSessionCookie: true,
        activeUsageFound: false,
        userId,
      });
      const status = await getHirePilotBillingStatus(userId);
      return NextResponse.json(
        {
          ok: false,
          error: "Start or unlock a HirePilot live session before shared audio transcription.",
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
        { ok: false, error: "OpenAI audio transcription is unavailable or not configured." },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("audio");

    if (!(file instanceof File) || file.size === 0) {
      debugHirePilotAudioServer("shared audio transcription received invalid audio chunk", {
        fileType: file instanceof File ? file.type : null,
        fileSize: file instanceof File ? file.size : null,
      });
      return NextResponse.json(
        { ok: false, error: "Audio chunk was empty or invalid." },
        { status: 400 }
      );
    }

    debugHirePilotAudioServer("shared audio transcription received chunk", {
      fileSize: file.size,
      fileType: file.type || "audio/webm",
      hasSessionCookie: true,
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    try {
      const transcript = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
        response_format: "json",
        prompt:
          "Transcribe audible interview conversation from shared meeting audio. Preserve interviewer questions clearly, keep the text concise, and return plain text only.",
      });

      return NextResponse.json({
        ok: true,
        transcript: trimText(transcript.text),
      });
    } catch (error) {
      debugHirePilotAudioServer("shared audio transcription provider error", {
        fileSize: file.size,
        fileType: file.type || "audio/webm",
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { ok: false, error: "Shared audio transcription failed." },
        { status: 500 }
      );
    }
  } catch (error) {
    debugHirePilotAudioServer("shared audio transcription route error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "production"
            ? "Shared audio transcription failed."
            : error instanceof Error
              ? error.message
              : "Shared audio transcription failed.",
      },
      { status: 500 }
    );
  }
}
