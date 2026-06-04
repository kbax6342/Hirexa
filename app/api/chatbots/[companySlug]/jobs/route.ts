import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  normalizeCompanySlug,
  normalizeJobInput,
} from "@/lib/chatbot/saveCompanyChatbot";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    companySlug: string;
  }>;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "Authentication is required to manage chatbot jobs." },
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
  const input = normalizeJobInput(body);

  if (!input.title) {
    return NextResponse.json(
      { ok: false, error: "Job title is required." },
      { status: 400 }
    );
  }

  const job = await prisma.chatbotJobOpening.create({
    data: {
      companyChatbotId: chatbot.id,
      title: input.title,
      location: input.location || null,
      payRange: input.payRange || null,
      shift: input.shift || null,
      employmentType: input.employmentType || null,
      requirements: input.requirements || null,
      applicationUrl: input.applicationUrl || null,
      description: input.description || null,
      status: input.status || "OPEN",
    },
  });

  return NextResponse.json({ ok: true, job }, { status: 201 });
}
