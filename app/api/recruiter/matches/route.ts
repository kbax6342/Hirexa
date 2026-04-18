import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import {
  recruiterMatchSelect,
  recruiterSubmissionSelect,
} from "@/app/lib/recruiter/queries";
import { rankCandidatesForJob } from "@/app/lib/recruiter/matchCandidates";
import { requireRecruiterAgencyForApi } from "@/app/lib/recruiter/server";

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function serializeMatch(match: {
  bestFitReasons: unknown;
  redFlags: unknown;
  missingQualifications: unknown;
} & Record<string, unknown>) {
  return {
    ...match,
    bestFitReasons: readStringArray(match.bestFitReasons),
    redFlags: readStringArray(match.redFlags),
    missingQualifications: readStringArray(match.missingQualifications),
  };
}

export async function GET(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { searchParams } = new URL(req.url);
  const jobOrderId = searchParams.get("jobOrderId");
  if (!jobOrderId) {
    return NextResponse.json({ ok: false, error: "jobOrderId is required." }, { status: 400 });
  }

  const jobOrder = await prisma.recruiterJobOrder.findFirst({
    where: { id: jobOrderId, agencyId: context.agency.id },
    select: { id: true },
  });
  if (!jobOrder) {
    return NextResponse.json({ ok: false, error: "Job order not found." }, { status: 404 });
  }

  const [matches, submissions] = await Promise.all([
    prisma.recruiterMatch.findMany({
      where: { jobOrderId },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      select: recruiterMatchSelect,
    }),
    prisma.recruiterSubmission.findMany({
      where: { jobOrderId },
      orderBy: { updatedAt: "desc" },
      select: recruiterSubmissionSelect,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    matches: matches.map(serializeMatch),
    submissions,
  });
}

export async function POST(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => null)) as { jobOrderId?: string } | null;
  const jobOrderId = String(body?.jobOrderId ?? "").trim();
  if (!jobOrderId) {
    return NextResponse.json({ ok: false, error: "jobOrderId is required." }, { status: 400 });
  }

  const jobOrder = await prisma.recruiterJobOrder.findFirst({
    where: { id: jobOrderId, agencyId: context.agency.id },
  });

  if (!jobOrder) {
    return NextResponse.json({ ok: false, error: "Job order not found." }, { status: 404 });
  }

  const candidates = await prisma.recruiterCandidate.findMany({
    where: { agencyId: context.agency.id },
  });

  const rankedMatches = rankCandidatesForJob(jobOrder, candidates);

  await prisma.$transaction(
    rankedMatches.map(({ candidate, match }) =>
      prisma.recruiterMatch.upsert({
        where: {
          jobOrderId_candidateId: {
            jobOrderId: jobOrder.id,
            candidateId: candidate.id,
          },
        },
        create: {
          jobOrderId: jobOrder.id,
          candidateId: candidate.id,
          score: match.score,
          bestFitReasons: match.bestFitReasons,
          redFlags: match.redFlags,
          missingQualifications: match.missingQualifications,
          summary: match.summary,
        },
        update: {
          score: match.score,
          bestFitReasons: match.bestFitReasons,
          redFlags: match.redFlags,
          missingQualifications: match.missingQualifications,
          summary: match.summary,
        },
      })
    )
  );

  await prisma.$transaction(
    rankedMatches.map(({ candidate }) =>
      prisma.recruiterSubmission.upsert({
        where: {
          jobOrderId_candidateId: {
            jobOrderId: jobOrder.id,
            candidateId: candidate.id,
          },
        },
        create: {
          jobOrderId: jobOrder.id,
          candidateId: candidate.id,
          stage: "SCREENED",
        },
        update: {},
      })
    )
  );

  const [matches, submissions] = await Promise.all([
    prisma.recruiterMatch.findMany({
      where: { jobOrderId: jobOrder.id },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      select: recruiterMatchSelect,
    }),
    prisma.recruiterSubmission.findMany({
      where: { jobOrderId: jobOrder.id },
      orderBy: { updatedAt: "desc" },
      select: recruiterSubmissionSelect,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    matches: matches.map(serializeMatch),
    submissions,
  });
}
