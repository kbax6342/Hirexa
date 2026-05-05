import { NextResponse } from "next/server";

import { requireRecruiterAgencyForApi } from "@/app/lib/recruiter/server";
import {
  evaluatePendingResumesForJob,
  getRecruiterResumeSnapshot,
} from "@/app/lib/resumes/recruiterResumeEvaluator";

type RouteProps = {
  params: Promise<{ jobId: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, props: RouteProps) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { jobId } = await props.params;
  const snapshot = await getRecruiterResumeSnapshot({
    agencyId: context.agency.id,
    jobOrderId: jobId,
  });

  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    snapshot,
  });
}

export async function POST(_: Request, props: RouteProps) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { jobId } = await props.params;

  try {
    const result = await evaluatePendingResumesForJob({
      agencyId: context.agency.id,
      jobOrderId: jobId,
      actorId: context.userId,
    });

    if (!result.snapshot) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      processed: result.processed,
      failed: result.failed,
      snapshot: result.snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to evaluate resumes.",
      },
      { status: 500 }
    );
  }
}
