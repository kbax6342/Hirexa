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
    questionId: string;
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

async function findScopedQuestion(companySlug: string, questionId: string) {
  return prisma.chatbotScreeningQuestion.findFirst({
    where: {
      id: questionId,
      companyChatbot: {
        companySlug: normalizeCompanySlug(companySlug),
      },
    },
    select: { id: true },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { companySlug, questionId } = await context.params;
  const existing = await findScopedQuestion(companySlug, questionId);

  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Chatbot question not found." },
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

  const question = await prisma.chatbotScreeningQuestion.update({
    where: { id: existing.id },
    data: {
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

  return NextResponse.json({ ok: true, question });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { companySlug, questionId } = await context.params;
  const existing = await findScopedQuestion(companySlug, questionId);

  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Chatbot question not found." },
      { status: 404 }
    );
  }

  await prisma.chatbotScreeningQuestion.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
