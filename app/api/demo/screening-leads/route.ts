import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";
import { scoreStaffingLead } from "@/app/lib/staffing/scoreStaffingLead";
import {
  type StaffingLeadApiError,
  type StaffingLeadSubmissionInput,
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

function normalizeLeadEmail(email: string) {
  return email.trim().toLowerCase();
}

function toPrismaJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function firstText(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).find(Boolean);
}

function buildWorkExperienceSummary(lead: StaffingLeadSubmissionInput) {
  const summary = [
    lead.workExperienceSummary,
    lead.resumeUploadOrWorkHistorySummary,
    lead.desiredWorkTypes?.join(", "),
    lead.experience?.join(", "),
  ]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" | ");

  return summary || undefined;
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
      const email = parsed.data.email
        ? normalizeLeadEmail(parsed.data.email)
        : null;
      const nameParts = splitCandidateName(
        parsed.data.fullName ?? parsed.data.candidateName
      );
      const firstName = firstText(parsed.data.firstName, nameParts.firstName);
      const lastName = firstText(parsed.data.lastName, nameParts.lastName);
      const lead = await prisma.$transaction(async (tx) => {
        const leadData = {
          firstName,
          lastName,
          email,
          phone: parsed.data.phone,
          city: parsed.data.city,
          state: parsed.data.state,
          zipCode: parsed.data.zipCode,
          desiredJobType: parsed.data.desiredJobType,
          employmentType: parsed.data.desiredJobType,
          preferredShift:
            parsed.data.preferredShift ?? parsed.data.shiftAvailability?.[0],
          availability: {
            shiftAvailability: parsed.data.shiftAvailability ?? [],
            startAvailability: parsed.data.startAvailability ?? null,
          } as Prisma.InputJsonValue,
          workExperienceSummary: buildWorkExperienceSummary(parsed.data),
          transportationStatus: parsed.data.transportationStatus,
          workAuthorization: firstText(
            parsed.data.workAuthorizationStatus,
            parsed.data.workAuthorization
          ),
          resumeUrl: parsed.data.resumeUrl,
          linkedinUrl: parsed.data.linkedinUrl,
          certifications: parsed.data.certifications,
          desiredPay: firstText(parsed.data.desiredPay, parsed.data.desiredPayRange),
          startDate: parsed.data.startDate,
          previousEmployer: parsed.data.previousEmployer,
          educationLevel: parsed.data.educationLevel,
          languagesSpoken: parsed.data.languagesSpoken,
          veteranStatus: parsed.data.veteranStatus,
          referralSource: parsed.data.referralSource,
          qualificationStatus: tier,
          candidateScore: score,
          aiSummary: recommendedAction,
          missingFields: [],
          structuredAnswersJson: toPrismaJson(parsed.data),
          sourcePageUrl: parsed.data.sourcePage,
          consentAcceptedAt: parsed.data.consentToContact ? new Date() : null,
          aiDisclosureShownAt: new Date(),
        };

        const existingLead = email
          ? await tx.chatbotCandidateLead.findFirst({
              where: {
                companyChatbotId: chatbot.id,
                email: {
                  equals: email,
                  mode: "insensitive",
                },
              },
              orderBy: { updatedAt: "desc" },
              select: { id: true },
            })
          : null;

        const savedLead = existingLead
          ? await tx.chatbotCandidateLead.update({
              where: { id: existingLead.id },
              data: leadData,
            })
          : await tx.chatbotCandidateLead.create({
              data: {
                companyChatbotId: chatbot.id,
                ...leadData,
              },
            });

        if (parsed.data.chatMessages?.length) {
          await tx.chatbotMessage.createMany({
            data: parsed.data.chatMessages.map((message) => ({
              companyChatbotId: chatbot.id,
              leadId: savedLead.id,
              role: message.role,
              content: message.content,
            })),
          });
        }

        return savedLead;
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
