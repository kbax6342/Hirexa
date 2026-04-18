import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { recruiterCandidateSelect } from "@/app/lib/recruiter/queries";
import { parseRecruiterCandidateInput } from "@/app/lib/recruiter/parseCandidateResume";
import { requireRecruiterAgencyForApi, toNullableString } from "@/app/lib/recruiter/server";

export async function GET() {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const candidates = await prisma.recruiterCandidate.findMany({
    where: { agencyId: context.agency.id },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: recruiterCandidateSelect,
  });

  return NextResponse.json({ ok: true, candidates });
}

export async function POST(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = await parseRecruiterCandidateInput({
    resumeText: typeof body?.resumeText === "string" ? body.resumeText : null,
  });

  const candidate = await prisma.recruiterCandidate.create({
    data: {
      agencyId: context.agency.id,
      firstName: toNullableString(body?.firstName) ?? parsed.firstName,
      lastName: toNullableString(body?.lastName) ?? parsed.lastName,
      email: toNullableString(body?.email) ?? parsed.email,
      phone: toNullableString(body?.phone) ?? parsed.phone,
      location: toNullableString(body?.location) ?? parsed.location,
      headline: toNullableString(body?.headline) ?? parsed.headline,
      resumeText: parsed.resumeText,
      skills: parsed.skills,
      yearsExperience: parsed.yearsExperience,
      source: parsed.source,
    },
    select: recruiterCandidateSelect,
  });

  return NextResponse.json({
    ok: true,
    candidate,
    warning: parsed.warning,
  });
}
