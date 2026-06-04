import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { getCompanyChatbotSettingsBySlug } from "@/lib/chatbot/getCompanyChatbot";
import { HOMEPAGE_COMPANY_CHATBOT_SLUG } from "@/lib/chatbot/homepageChatbotSettings";
import {
  ChatbotValidationError,
  deleteCompanyChatbot,
  normalizeCompanySlug,
  updateCompanyChatbot,
} from "@/lib/chatbot/saveCompanyChatbot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    companySlug: string;
  }>;
};

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

  console.error("[api/chatbots/companySlug] failed", {
    error: error instanceof Error ? error.message : String(error),
  });

  return NextResponse.json(
    { ok: false, error: "Unable to process chatbot settings right now." },
    { status: 500 }
  );
}

async function canPubliclyUpdateChatbot(companySlug: string) {
  const normalizedSlug = normalizeCompanySlug(companySlug);
  if (normalizedSlug === HOMEPAGE_COMPANY_CHATBOT_SLUG) return true;

  const chatbot = await prisma.companyChatbot.findUnique({
    where: { companySlug: normalizedSlug },
    select: { isDemoMode: true },
  });

  return chatbot?.isDemoMode === true;
}

export async function GET(_request: Request, context: RouteContext) {
  const { companySlug } = await context.params;
  const chatbot = await getCompanyChatbotSettingsBySlug(companySlug);

  if (!chatbot) {
    return NextResponse.json(
      { ok: false, error: "Company chatbot not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, chatbot });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { companySlug } = await context.params;
  const session = await auth();
  if (!session?.user && !(await canPubliclyUpdateChatbot(companySlug))) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json().catch(() => null);
    const chatbot = await updateCompanyChatbot(companySlug, body);

    if (!chatbot) {
      return NextResponse.json(
        { ok: false, error: "Company chatbot not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, chatbot });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { companySlug } = await context.params;
  const deleted = await deleteCompanyChatbot(companySlug);

  if (!deleted) {
    return NextResponse.json(
      { ok: false, error: "Company chatbot not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
