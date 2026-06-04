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
    jobId: string;
  }>;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "Authentication is required to manage chatbot jobs." },
    { status: 401 }
  );
}

async function findScopedJob(companySlug: string, jobId: string) {
  return prisma.chatbotJobOpening.findFirst({
    where: {
      id: jobId,
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

  const { companySlug, jobId } = await context.params;
  const existing = await findScopedJob(companySlug, jobId);

  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Chatbot job not found." },
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

  const job = await prisma.chatbotJobOpening.update({
    where: { id: existing.id },
    data: {
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

  return NextResponse.json({ ok: true, job });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { companySlug, jobId } = await context.params;
  const existing = await findScopedJob(companySlug, jobId);

  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Chatbot job not found." },
      { status: 404 }
    );
  }

  await prisma.chatbotJobOpening.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
