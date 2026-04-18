import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { normalizeRecruiterStage } from "@/app/lib/recruiter/constants";
import { recruiterSubmissionSelect } from "@/app/lib/recruiter/queries";
import { requireRecruiterAgencyForApi, toNullableString } from "@/app/lib/recruiter/server";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, props: RouteProps) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { id } = await props.params;
  const submission = await prisma.recruiterSubmission.findFirst({
    where: {
      id,
      jobOrder: { is: { agencyId: context.agency.id } },
    },
    select: {
      id: true,
      stage: true,
    },
  });

  if (!submission) {
    return NextResponse.json({ ok: false, error: "Submission not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        stage?: string;
        note?: string;
      }
    | null;

  const nextStage = normalizeRecruiterStage(body?.stage);
  const note = toNullableString(body?.note);

  const updated = await prisma.recruiterSubmission.update({
    where: { id: submission.id },
    data: { stage: nextStage },
    select: recruiterSubmissionSelect,
  });

  if (submission.stage !== nextStage || note) {
    await prisma.recruiterStageEvent.create({
      data: {
        submissionId: submission.id,
        fromStage: submission.stage,
        toStage: nextStage,
        note,
      },
    });
  }

  const hydrated = await prisma.recruiterSubmission.findUnique({
    where: { id: submission.id },
    select: recruiterSubmissionSelect,
  });

  return NextResponse.json({ ok: true, submission: hydrated ?? updated });
}
