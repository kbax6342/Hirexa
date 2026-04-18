import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { normalizeRecruiterStage } from "@/app/lib/recruiter/constants";
import { generateRecruiterMessage } from "@/app/lib/recruiter/generateRecruiterMessage";
import { requireRecruiterAgencyForApi } from "@/app/lib/recruiter/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const session = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { name: true },
  });

  const body = (await req.json().catch(() => null)) as
    | {
        jobOrderId?: string;
        candidateId?: string;
        stage?: string;
        messageType?: string;
      }
    | null;

  const jobOrderId = String(body?.jobOrderId ?? "").trim();
  const candidateId = String(body?.candidateId ?? "").trim();
  if (!jobOrderId || !candidateId) {
    return NextResponse.json(
      { ok: false, error: "jobOrderId and candidateId are required." },
      { status: 400 }
    );
  }

  const [jobOrder, candidate] = await Promise.all([
    prisma.recruiterJobOrder.findFirst({
      where: { id: jobOrderId, agencyId: context.agency.id },
      select: {
        id: true,
        title: true,
        companyName: true,
        location: true,
        employmentType: true,
        requiredSkills: true,
      },
    }),
    prisma.recruiterCandidate.findFirst({
      where: { id: candidateId, agencyId: context.agency.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        headline: true,
        location: true,
        skills: true,
      },
    }),
  ]);

  if (!jobOrder || !candidate) {
    return NextResponse.json(
      { ok: false, error: "Job order or candidate not found." },
      { status: 404 }
    );
  }

  const stage = normalizeRecruiterStage(body?.stage);
  const message = await generateRecruiterMessage({
    candidate,
    jobOrder,
    stage,
    messageType: body?.messageType ?? null,
    recruiterName: session?.name ?? null,
    agencyName: context.agency.name,
  });

  await prisma.recruiterSubmission.upsert({
    where: {
      jobOrderId_candidateId: {
        jobOrderId,
        candidateId,
      },
    },
    create: {
      jobOrderId,
      candidateId,
      stage,
      lastOutreachMessage: message,
    },
    update: {
      stage,
      lastOutreachMessage: message,
    },
  });

  return NextResponse.json({ ok: true, message });
}
