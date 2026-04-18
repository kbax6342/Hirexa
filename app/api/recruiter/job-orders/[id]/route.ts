import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { recruiterMatchSelect, recruiterSubmissionSelect } from "@/app/lib/recruiter/queries";
import {
  parseStringListInput,
  requireRecruiterAgencyForApi,
  toNullableInteger,
  toNullableString,
} from "@/app/lib/recruiter/server";

type RouteProps = {
  params: Promise<{ id: string }>;
};

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

export async function GET(_: Request, props: RouteProps) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { id } = await props.params;
  const jobOrder = await prisma.recruiterJobOrder.findFirst({
    where: { id, agencyId: context.agency.id },
    include: {
      matches: {
        orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
        select: recruiterMatchSelect,
      },
      submissions: {
        orderBy: { updatedAt: "desc" },
        select: recruiterSubmissionSelect,
      },
    },
  });

  if (!jobOrder) {
    return NextResponse.json({ ok: false, error: "Job order not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    jobOrder: {
      ...jobOrder,
      matches: jobOrder.matches.map((match) => ({
        ...match,
        bestFitReasons: readStringArray(match.bestFitReasons),
        redFlags: readStringArray(match.redFlags),
        missingQualifications: readStringArray(match.missingQualifications),
      })),
    },
  });
}

export async function PATCH(req: Request, props: RouteProps) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { id } = await props.params;
  const existing = await prisma.recruiterJobOrder.findFirst({
    where: { id, agencyId: context.agency.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Job order not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = toNullableString(body?.title);
  const companyName = toNullableString(body?.companyName);
  const description = toNullableString(body?.description);

  if (!title || !companyName || !description) {
    return NextResponse.json(
      { ok: false, error: "Title, company name, and description are required." },
      { status: 400 }
    );
  }

  const jobOrder = await prisma.recruiterJobOrder.update({
    where: { id: existing.id },
    data: {
      title,
      companyName,
      location: toNullableString(body?.location),
      employmentType: toNullableString(body?.employmentType),
      salaryMin: toNullableInteger(body?.salaryMin),
      salaryMax: toNullableInteger(body?.salaryMax),
      description,
      requiredSkills: parseStringListInput(body?.requiredSkills),
      preferredSkills: parseStringListInput(body?.preferredSkills),
      requiredYearsExperience: toNullableInteger(body?.requiredYearsExperience),
      status: toNullableString(body?.status) ?? "OPEN",
    },
  });

  return NextResponse.json({ ok: true, jobOrder });
}

export async function DELETE(_: Request, props: RouteProps) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { id } = await props.params;
  const existing = await prisma.recruiterJobOrder.findFirst({
    where: { id, agencyId: context.agency.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Job order not found." }, { status: 404 });
  }

  await prisma.recruiterJobOrder.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
