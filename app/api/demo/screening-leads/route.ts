import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";
import { scoreStaffingLead } from "@/app/lib/staffing/scoreStaffingLead";
import {
  type StaffingLeadApiError,
  staffingLeadSubmissionSchema,
} from "@/app/types/staffing-screening";
import { normalizeCompanySlug } from "@/lib/chatbot/saveCompanyChatbot";

export const runtime = "nodejs";

function splitCandidateName(candidateName?: string) {
  const parts = String(candidateName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

function toPrismaJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = staffingLeadSubmissionSchema.safeParse(body);

    if (!parsed.success) {
      const payload: StaffingLeadApiError = {
        ok: false,
        error: "Complete the candidate screening details before submitting.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };

      return NextResponse.json(payload, { status: 400 });
    }

    const { score, tier, recommendedAction } = scoreStaffingLead(parsed.data);
    const chatbot = await prisma.companyChatbot.findUnique({
      where: { companySlug: normalizeCompanySlug(parsed.data.companySlug) },
      select: {
        id: true,
        saveLeadToDashboard: true,
      },
    });
    let leadId = `demo_lead_${crypto.randomUUID()}`;

    if (chatbot?.saveLeadToDashboard) {
      const { firstName, lastName } = splitCandidateName(
        parsed.data.candidateName
      );
      const lead = await prisma.$transaction(async (tx) => {
        const createdLead = await tx.chatbotCandidateLead.create({
          data: {
            companyChatbotId: chatbot.id,
            firstName,
            lastName,
            email: parsed.data.email,
            phone: parsed.data.phone,
            desiredJobType: parsed.data.desiredJobType,
            employmentType: parsed.data.desiredJobType,
            preferredShift: parsed.data.shiftAvailability?.[0],
            availability: {
              shiftAvailability: parsed.data.shiftAvailability ?? [],
              startAvailability: parsed.data.startAvailability ?? null,
            } as Prisma.InputJsonValue,
            workExperienceSummary: [
              parsed.data.desiredWorkTypes?.join(", "),
              parsed.data.experience?.join(", "),
            ]
              .filter(Boolean)
              .join(" | "),
            transportationStatus: parsed.data.transportationStatus,
            desiredPay: parsed.data.desiredPayRange,
            qualificationStatus: tier,
            candidateScore: score,
            aiSummary: recommendedAction,
            missingFields: [],
            structuredAnswersJson: toPrismaJson(parsed.data),
            sourcePageUrl: parsed.data.sourcePage,
            consentAcceptedAt: parsed.data.consentToContact ? new Date() : null,
            aiDisclosureShownAt: new Date(),
          },
        });

        if (parsed.data.chatMessages?.length) {
          await tx.chatbotMessage.createMany({
            data: parsed.data.chatMessages.map((message) => ({
              companyChatbotId: chatbot.id,
              leadId: createdLead.id,
              role: message.role,
              content: message.content,
            })),
          });
        }

        return createdLead;
      });

      leadId = lead.id;
    }

    return NextResponse.json({
      ok: true,
      leadId,
      score,
      tier,
      recommendedAction,
      companySlug: parsed.data.companySlug,
      companyName: parsed.data.companyName,
      sourcePage: parsed.data.sourcePage,
    });
  } catch (error) {
    console.error("[demo/screening-leads] failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to process the screening demo right now.",
      } satisfies StaffingLeadApiError,
      { status: 500 }
    );
  }
}
