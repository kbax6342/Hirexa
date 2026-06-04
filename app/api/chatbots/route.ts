import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listCompanyChatbots } from "@/lib/chatbot/getCompanyChatbot";
import { HOMEPAGE_COMPANY_CHATBOT_SLUG } from "@/lib/chatbot/homepageChatbotSettings";
import {
  ChatbotValidationError,
  createCompanyChatbot,
  normalizeCompanySlug,
} from "@/lib/chatbot/saveCompanyChatbot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "Authentication is required to manage chatbots." },
    { status: 401 }
  );
}

function errorResponse(error: unknown) {
  if (error instanceof ChatbotValidationError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please fix the chatbot setup before saving.",
        fieldErrors: error.fieldErrors,
      },
      { status: 400 }
    );
  }

  console.error("[api/chatbots] failed", {
    error: error instanceof Error ? error.message : String(error),
  });

  return NextResponse.json(
    { ok: false, error: "Unable to process chatbot settings right now." },
    { status: 500 }
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const chatbots = await listCompanyChatbots();
  return NextResponse.json({ ok: true, chatbots });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const session = await auth();
  const publicHomepageCreate =
    normalizeCompanySlug(
      body && typeof body === "object"
        ? (body as { companySlug?: unknown }).companySlug
        : null
    ) === HOMEPAGE_COMPANY_CHATBOT_SLUG;

  if (!session?.user && !publicHomepageCreate) return unauthorizedResponse();

  try {
    const chatbot = await createCompanyChatbot(body);
    return NextResponse.json({ ok: true, chatbot }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
