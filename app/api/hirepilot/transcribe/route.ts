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

const isDevelopment = process.env.NODE_ENV !== "production";
const FALLBACK_TRANSCRIBE_MODEL = "whisper-1";
const MIN_TRANSCRIBE_UPLOAD_BYTES = 4096;
const SUPPORTED_TRANSCRIBE_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "video/webm",
  "video/webm;codecs=opus",
]);
const TRANSCRIPTION_PROMPT =
  "Transcribe audible interview conversation from shared meeting audio. Preserve interviewer questions clearly, keep the text concise, and return plain text only.";

type RouteDebugContext = {
  debugCode?: string;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  modelUsed?: string | null;
  fallbackUsed?: boolean;
};

class HirePilotTranscriptionError extends Error {
  status: number;
  debugCode: string;
  modelUsed: string | null;
  cause?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      debugCode?: string;
      modelUsed?: string | null;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "HirePilotTranscriptionError";
    this.status = options?.status ?? 500;
    this.debugCode = options?.debugCode ?? "HIREPILOT_TRANSCRIBE_ERROR";
    this.modelUsed = options?.modelUsed ?? null;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function trimText(value: unknown) {
  return String(value ?? "").trim();
}

function debugHirePilotAudioServer(message: string, details?: Record<string, unknown>) {
  if (!isDevelopment) {
    return;
  }

  if (details) {
    console.info("[HIREPILOT_AUDIO]", message, details);
    return;
  }

  console.info("[HIREPILOT_AUDIO]", message);
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return String(error ?? "Unknown HirePilot transcription error").trim();
}

function isInvalidWebmTranscriptionError(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("audio file might be corrupted or unsupported") ||
    normalized.includes("invalid file format") ||
    (normalized.includes("corrupted") && normalized.includes("unsupported"))
  );
}

function buildErrorResponse(
  message: string,
  options?: {
    status?: number;
    debugCode?: string;
    fileName?: string | null;
    fileType?: string | null;
    fileSize?: number | null;
    modelUsed?: string | null;
  }
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(isDevelopment
        ? {
            debugCode: options?.debugCode ?? "HIREPILOT_TRANSCRIBE_ERROR",
            fileName: options?.fileName ?? null,
            fileType: options?.fileType ?? null,
            fileSize: options?.fileSize ?? null,
            modelUsed: options?.modelUsed ?? null,
          }
        : {}),
    },
    { status: options?.status ?? 500 }
  );
}

function buildSuccessResponse(
  transcript: string,
  options?: {
    fileType?: string | null;
    fileSize?: number | null;
    modelUsed?: string | null;
    fallbackUsed?: boolean;
    reason?: string | null;
  }
) {
  return NextResponse.json({
    ok: true,
    transcript,
    debug: isDevelopment
      ? {
          fileType: options?.fileType ?? null,
          fileSize: options?.fileSize ?? null,
          modelUsed: options?.modelUsed ?? null,
          fallbackUsed: Boolean(options?.fallbackUsed),
          reason: options?.reason ?? null,
        }
      : undefined,
  });
}

async function normalizeUploadedAudio(file: File) {
  const buffer = await file.arrayBuffer();
  const fileName = trimText(file.name) || `hirepilot-shared-audio-${Date.now()}.webm`;
  const fileType = trimText(file.type) || "audio/webm";
  const normalizedFile = new File([buffer], fileName, { type: fileType });

  return {
    normalizedFile,
    fileName,
    fileType,
    fileSize: normalizedFile.size,
  };
}

async function transcribeSharedAudio(args: {
  openai: OpenAI;
  file: File;
  primaryModel: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}) {
  const attemptTranscription = async (model: string) => {
    const transcript = await args.openai.audio.transcriptions.create({
      file: args.file,
      model,
      response_format: "json",
      prompt: TRANSCRIPTION_PROMPT,
    });

    return {
      transcript: trimText(transcript.text),
      modelUsed: model,
    };
  };

  try {
    return {
      ...(await attemptTranscription(args.primaryModel)),
      fallbackUsed: false,
    };
  } catch (primaryError) {
    if (isDevelopment) {
      console.error(
        "[HIREPILOT_AUDIO] shared audio primary transcription failed",
        {
          fileName: args.fileName,
          fileType: args.fileType,
          fileSize: args.fileSize,
          modelUsed: args.primaryModel,
        },
        primaryError
      );
    }

    if (args.primaryModel === FALLBACK_TRANSCRIBE_MODEL) {
      const primaryMessage = extractErrorMessage(primaryError);
      const invalidWebm = isInvalidWebmTranscriptionError(primaryMessage);
      throw new HirePilotTranscriptionError(primaryMessage, {
        status: invalidWebm ? 400 : 500,
        debugCode: invalidWebm
          ? "HIREPILOT_TRANSCRIBE_INVALID_WEBM"
          : "HIREPILOT_TRANSCRIBE_PRIMARY_FAILED",
        modelUsed: args.primaryModel,
        cause: primaryError,
      });
    }

    try {
      return {
        ...(await attemptTranscription(FALLBACK_TRANSCRIBE_MODEL)),
        fallbackUsed: true,
      };
    } catch (fallbackError) {
      if (isDevelopment) {
        console.error(
          "[HIREPILOT_AUDIO] shared audio fallback transcription failed",
          {
            fileName: args.fileName,
            fileType: args.fileType,
            fileSize: args.fileSize,
            primaryModel: args.primaryModel,
            fallbackModel: FALLBACK_TRANSCRIBE_MODEL,
          },
          fallbackError
        );
      }

      const primaryMessage = extractErrorMessage(primaryError);
      const fallbackMessage = extractErrorMessage(fallbackError);
      const invalidWebm =
        isInvalidWebmTranscriptionError(primaryMessage) ||
        isInvalidWebmTranscriptionError(fallbackMessage);
      throw new HirePilotTranscriptionError(
        `Primary model "${args.primaryModel}" failed: ${primaryMessage}. Fallback model "${FALLBACK_TRANSCRIBE_MODEL}" failed: ${fallbackMessage}`,
        {
          status: invalidWebm ? 400 : 500,
          debugCode: invalidWebm
            ? "HIREPILOT_TRANSCRIBE_INVALID_WEBM"
            : "HIREPILOT_TRANSCRIBE_FALLBACK_FAILED",
          modelUsed: FALLBACK_TRANSCRIBE_MODEL,
          cause: fallbackError,
        }
      );
    }
  }
}

export async function POST(req: Request) {
  const primaryModel =
    process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
  const debugContext: RouteDebugContext = {
    debugCode: "HIREPILOT_TRANSCRIBE_ROUTE_ERROR",
    fileName: null,
    fileType: null,
    fileSize: null,
    modelUsed: primaryModel,
    fallbackUsed: false,
  };

  try {
    debugHirePilotAudioServer("shared audio transcription route started");

    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    debugHirePilotAudioServer("shared audio transcription auth checked", {
      userIdExists: Boolean(userId),
    });

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Sign in again to use HirePilot transcription." },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(HIREPILOT_SESSION_COOKIE)?.value ?? null;
    debugHirePilotAudioServer("shared audio transcription session cookie checked", {
      hasSessionCookie: Boolean(sessionCookie),
    });

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
    debugHirePilotAudioServer("shared audio transcription active usage checked", {
      activeUsageFound: Boolean(activeUsage),
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
    const rawFile = formData.get("audio");

    if (!(rawFile instanceof File)) {
      debugContext.debugCode = "HIREPILOT_TRANSCRIBE_INVALID_FILE";
      return buildErrorResponse("Audio chunk was empty or invalid.", {
        status: 400,
        debugCode: debugContext.debugCode,
        modelUsed: primaryModel,
      });
    }

    if (rawFile.size <= 0) {
      debugContext.fileName = trimText(rawFile.name) || null;
      debugContext.fileType = trimText(rawFile.type) || "audio/webm";
      debugContext.fileSize = rawFile.size;
      debugContext.debugCode = "HIREPILOT_TRANSCRIBE_EMPTY_FILE";
      return buildErrorResponse("Audio chunk was empty or invalid.", {
        status: 400,
        debugCode: debugContext.debugCode,
        fileName: debugContext.fileName,
        fileType: debugContext.fileType,
        fileSize: debugContext.fileSize,
        modelUsed: primaryModel,
      });
    }

    const { normalizedFile, fileName, fileType, fileSize } = await normalizeUploadedAudio(rawFile);
    debugContext.fileName = fileName;
    debugContext.fileType = fileType;
    debugContext.fileSize = fileSize;

    if (!SUPPORTED_TRANSCRIBE_MIME_TYPES.has(fileType)) {
      debugContext.debugCode = "HIREPILOT_TRANSCRIBE_UNSUPPORTED_FILE_TYPE";
      return buildErrorResponse("Unsupported shared audio file type.", {
        status: 400,
        debugCode: debugContext.debugCode,
        fileName,
        fileType,
        fileSize,
        modelUsed: primaryModel,
      });
    }

    if (fileType === "video/webm") {
      debugHirePilotAudioServer("shared audio transcription accepting video/webm upload", {
        fileName,
        fileSize,
      });
    }

    if (fileType === "video/webm;codecs=opus") {
      debugHirePilotAudioServer(
        "shared audio transcription accepting video/webm;codecs=opus upload",
        {
          fileName,
          fileSize,
        }
      );
    }

    debugHirePilotAudioServer("shared audio transcription file prepared", {
      fileName,
      fileType,
      fileSize,
    });
    debugHirePilotAudioServer("shared audio transcription model selected", {
      modelUsed: primaryModel,
    });

    if (fileSize < MIN_TRANSCRIBE_UPLOAD_BYTES) {
      debugContext.debugCode = "chunk_too_small";
      debugHirePilotAudioServer("shared audio transcription skipped tiny chunk", {
        fileName,
        fileType,
        fileSize,
        modelUsed: primaryModel,
      });
      return buildSuccessResponse("", {
        fileType,
        fileSize,
        modelUsed: primaryModel,
        fallbackUsed: false,
        reason: "chunk_too_small",
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { transcript, modelUsed, fallbackUsed } = await transcribeSharedAudio({
      openai,
      file: normalizedFile,
      primaryModel,
      fileName,
      fileType,
      fileSize,
    });
    debugContext.modelUsed = modelUsed;
    debugContext.fallbackUsed = fallbackUsed;
    debugHirePilotAudioServer("shared audio transcription completed", {
      fileName,
      fileType,
      fileSize,
      modelUsed,
      fallbackUsed,
    });

    return buildSuccessResponse(transcript, {
      fileType,
      fileSize,
      modelUsed,
      fallbackUsed,
    });
  } catch (error) {
    const status =
      error instanceof HirePilotTranscriptionError ? error.status : 500;
    const debugCode =
      error instanceof HirePilotTranscriptionError
        ? error.debugCode
        : debugContext.debugCode ?? "HIREPILOT_TRANSCRIBE_ROUTE_ERROR";
    const errorMessage = extractErrorMessage(error);
    const modelUsed =
      error instanceof HirePilotTranscriptionError
        ? error.modelUsed
        : debugContext.modelUsed;

    debugHirePilotAudioServer("shared audio transcription route error", {
      debugCode,
      fileName: debugContext.fileName,
      fileType: debugContext.fileType,
      fileSize: debugContext.fileSize,
      modelUsed,
      error: errorMessage,
    });

    if (isDevelopment) {
      console.error(
        "[HIREPILOT_AUDIO] shared audio transcription route error",
        {
          debugCode,
          fileName: debugContext.fileName,
          fileType: debugContext.fileType,
          fileSize: debugContext.fileSize,
          modelUsed,
          fallbackUsed: debugContext.fallbackUsed,
        },
        error
      );
    }

    return buildErrorResponse(
      isDevelopment ? errorMessage : "Shared audio transcription failed.",
      {
        status,
        debugCode,
        fileName: debugContext.fileName,
        fileType: debugContext.fileType,
        fileSize: debugContext.fileSize,
        modelUsed,
      }
    );
  }
}
