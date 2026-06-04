import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  normalizeCompanySlug,
  normalizeQuestionInput,
} from "@/lib/chatbot/saveCompanyChatbot";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    companySlug: string;
  }>;
};

function unauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Authentication is required to manage chatbot questions.",
    },
    { status: 401 }
  );
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { companySlug } = await context.params;
  const chatbot = await prisma.companyChatbot.findUnique({
    where: { companySlug: normalizeCompanySlug(companySlug) },
    select: { id: true },
  });

  if (!chatbot) {
    return NextResponse.json(
      { ok: false, error: "Company chatbot not found." },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const input = normalizeQuestionInput(body);

  if (!input.questionText) {
    return NextResponse.json(
      { ok: false, error: "Question text is required." },
      { status: 400 }
    );
  }

  const question = await prisma.chatbotScreeningQuestion.create({
    data: {
      companyChatbotId: chatbot.id,
      questionText: input.questionText,
      questionType: input.questionType,
      isRequired: input.isRequired,
      isOptional: input.isOptional ?? !input.isRequired,
      isKnockout: input.isKnockout,
      options: input.options as Prisma.InputJsonValue,
      expectedAnswer: input.expectedAnswer || null,
      order: input.order,
      conditionalLogic: input.conditionalLogic
        ? ({ expression: input.conditionalLogic } as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
  });

  return NextResponse.json({ ok: true, question }, { status: 201 });
}
