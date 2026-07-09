import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { isLeadCaptureStatus } from "@/app/lib/chatbot/leadCaptureStatus";
import { HOMEPAGE_COMPANY_CHATBOT_SLUG } from "@/lib/chatbot/homepageChatbotSettings";
import { normalizeCompanySlug } from "@/lib/chatbot/saveCompanyChatbot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    companySlug: string;
    leadId: string;
  }>;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "Authentication is required to update lead status." },
    { status: 401 }
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const { companySlug, leadId } = await context.params;
  const body = await request.json().catch(() => null);
  const captureStatus =
    body && typeof body === "object"
      ? (body as { captureStatus?: unknown }).captureStatus
      : null;

  if (!isLeadCaptureStatus(captureStatus)) {
    return NextResponse.json(
      { ok: false, error: "Choose a valid lead capture status." },
      { status: 400 }
    );
  }

  const normalizedSlug = normalizeCompanySlug(companySlug);
  const chatbot = await prisma.companyChatbot.findUnique({
    where: { companySlug: normalizedSlug },
    select: { id: true, isDemoMode: true },
  });

  if (!chatbot) {
    return NextResponse.json(
      { ok: false, error: "Company chatbot not found." },
      { status: 404 }
    );
  }

  const session = await auth();
  const canPubliclyUpdate =
    normalizedSlug === HOMEPAGE_COMPANY_CHATBOT_SLUG || chatbot.isDemoMode;

  if (!session?.user && !canPubliclyUpdate) {
    return unauthorizedResponse();
  }

  const existingLead = await prisma.chatbotCandidateLead.findFirst({
    where: {
      id: leadId,
      companyChatbotId: chatbot.id,
    },
    select: { id: true },
  });

  if (!existingLead) {
    return NextResponse.json(
      { ok: false, error: "Candidate lead not found." },
      { status: 404 }
    );
  }

  const updatedLead = await prisma.chatbotCandidateLead.update({
    where: { id: existingLead.id },
    data: { captureStatus },
    select: {
      id: true,
      captureStatus: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    leadId: updatedLead.id,
    captureStatus: updatedLead.captureStatus,
    updatedAt: updatedLead.updatedAt,
  });
}
