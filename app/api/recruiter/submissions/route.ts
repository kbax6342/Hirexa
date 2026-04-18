import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { normalizeRecruiterStage } from "@/app/lib/recruiter/constants";
import { recruiterSubmissionSelect } from "@/app/lib/recruiter/queries";
import {
  requireRecruiterAgencyForApi,
  toNullableString,
} from "@/app/lib/recruiter/server";

export async function GET(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { searchParams } = new URL(req.url);
  const jobOrderId = searchParams.get("jobOrderId");

  const submissions = await prisma.recruiterSubmission.findMany({
    where: {
      ...(jobOrderId ? { jobOrderId } : {}),
      jobOrder: { is: { agencyId: context.agency.id } },
    },
    orderBy: { updatedAt: "desc" },
    select: recruiterSubmissionSelect,
  });

  return NextResponse.json({ ok: true, submissions });
}

export async function POST(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        jobOrderId?: string;
        candidateId?: string;
        stage?: string;
        notes?: string;
        lastOutreachMessage?: string;
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

  const [jobOrder, candidate, existing] = await Promise.all([
    prisma.recruiterJobOrder.findFirst({
      where: { id: jobOrderId, agencyId: context.agency.id },
      select: { id: true },
    }),
    prisma.recruiterCandidate.findFirst({
      where: { id: candidateId, agencyId: context.agency.id },
      select: { id: true },
    }),
    prisma.recruiterSubmission.findUnique({
      where: {
        jobOrderId_candidateId: {
          jobOrderId,
          candidateId,
        },
      },
      select: { id: true, stage: true },
    }),
  ]);

  if (!jobOrder || !candidate) {
    return NextResponse.json(
      { ok: false, error: "Job order or candidate not found." },
      { status: 404 }
    );
  }

  const stage = normalizeRecruiterStage(body?.stage);
  const notes = toNullableString(body?.notes);
  const lastOutreachMessage = toNullableString(body?.lastOutreachMessage);

  const submission = await prisma.recruiterSubmission.upsert({
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
      notes,
      lastOutreachMessage,
    },
    update: {
      stage,
      notes,
      lastOutreachMessage,
    },
    select: recruiterSubmissionSelect,
  });

  if (!existing || existing.stage !== stage || notes) {
    await prisma.recruiterStageEvent.create({
      data: {
        submissionId: submission.id,
        fromStage: existing?.stage ?? null,
        toStage: stage,
        note: notes,
      },
    });
  }

  const hydratedSubmission = await prisma.recruiterSubmission.findUnique({
    where: { id: submission.id },
    select: recruiterSubmissionSelect,
  });

  return NextResponse.json({ ok: true, submission: hydratedSubmission });
}
