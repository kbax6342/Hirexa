import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import {
  requireRecruiterAgencyForApi,
  toNullableString,
} from "@/app/lib/recruiter/server";

export async function GET() {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const [jobOrders, candidates, submissions] = await Promise.all([
    prisma.recruiterJobOrder.count({ where: { agencyId: context.agency.id } }),
    prisma.recruiterCandidate.count({ where: { agencyId: context.agency.id } }),
    prisma.recruiterSubmission.count({
      where: { jobOrder: { is: { agencyId: context.agency.id } } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    agency: {
      ...context.agency,
      stats: {
        jobOrders,
        candidates,
        submissions,
      },
    },
  });
}

export async function POST(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = toNullableString(body?.name);
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Agency name is required." },
      { status: 400 }
    );
  }

  const agency = await prisma.recruiterAgency.update({
    where: { id: context.agency.id },
    data: { name },
  });

  return NextResponse.json({ ok: true, agency });
}
