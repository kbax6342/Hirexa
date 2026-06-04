import { NextResponse } from "next/server";
import { auth } from "@/auth";

import { getCurrentCompanyChatSettings, saveCompanyChatSettings } from "@/app/lib/ai-chat/companyChatSettingsStore";
import {
  normalizeCompanyChatSettings,
  validateCompanyChatSettings,
} from "@/app/lib/ai-chat/validateCompanyChatSettings";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Authentication is required to manage AI chat settings.",
    },
    { status: 401 }
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return unauthorizedResponse();
  }

  return NextResponse.json({
    ok: true,
    settings: getCurrentCompanyChatSettings(),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json().catch(() => null);
    const normalizedSettings = normalizeCompanyChatSettings(
      body as AiChatCompanySettings
    );
    const validation = validateCompanyChatSettings(normalizedSettings);

    if (!validation.isValid) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please fix the AI chat settings form before saving.",
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const settings = saveCompanyChatSettings(normalizedSettings);

    return NextResponse.json({
      ok: true,
      settings,
    });
  } catch (error) {
    console.error("[ai-chat/settings] failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to save AI chat settings right now.",
      },
      { status: 500 }
    );
  }
}
