import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { requireRecruiterAgencyForApi } from "@/app/lib/recruiter/server";
import {
  evaluateResumeSubmission,
  getRecruiterResumeSnapshot,
} from "@/app/lib/resumes/recruiterResumeEvaluator";

type RouteProps = {
  params: Promise<{ resumeSubmissionId: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, props: RouteProps) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { resumeSubmissionId } = await props.params;

  try {
    const evaluation = await evaluateResumeSubmission({
      agencyId: context.agency.id,
      resumeSubmissionId,
      actorId: context.userId,
      force: true,
    });

    const requisition = await prisma.resumeSubmission.findFirst({
      where: {
        id: resumeSubmissionId,
        jobRequisition: {
          is: { agencyId: context.agency.id },
        },
      },
      select: {
        jobRequisition: {
          select: {
            recruiterJobOrderId: true,
          },
        },
      },
    });

    const recruiterJobOrderId = requisition?.jobRequisition.recruiterJobOrderId ?? null;
    const snapshot = recruiterJobOrderId
      ? await getRecruiterResumeSnapshot({
          agencyId: context.agency.id,
          jobOrderId: recruiterJobOrderId,
        })
      : null;

    return NextResponse.json({
      ok: true,
      evaluation,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to evaluate this resume.",
      },
      { status: 500 }
    );
  }
}
