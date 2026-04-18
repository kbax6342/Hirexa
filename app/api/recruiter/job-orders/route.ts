import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import {
  parseStringListInput,
  requireRecruiterAgencyForApi,
  toNullableInteger,
  toNullableString,
} from "@/app/lib/recruiter/server";

type JobOrderPayload = {
  title?: unknown;
  companyName?: unknown;
  location?: unknown;
  employmentType?: unknown;
  salaryMin?: unknown;
  salaryMax?: unknown;
  description?: unknown;
  requiredSkills?: unknown;
  preferredSkills?: unknown;
  requiredYearsExperience?: unknown;
  status?: unknown;
};

function normalizeJobOrderPayload(payload: JobOrderPayload) {
  return {
    title: toNullableString(payload.title),
    companyName: toNullableString(payload.companyName),
    location: toNullableString(payload.location),
    employmentType: toNullableString(payload.employmentType),
    salaryMin: toNullableInteger(payload.salaryMin),
    salaryMax: toNullableInteger(payload.salaryMax),
    description: toNullableString(payload.description),
    requiredSkills: parseStringListInput(payload.requiredSkills),
    preferredSkills: parseStringListInput(payload.preferredSkills),
    requiredYearsExperience: toNullableInteger(payload.requiredYearsExperience),
    status: toNullableString(payload.status) ?? "OPEN",
  };
}

export async function GET() {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const jobOrders = await prisma.recruiterJobOrder.findMany({
    where: { agencyId: context.agency.id },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ ok: true, jobOrders });
}

export async function POST(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => null)) as JobOrderPayload | null;
  const payload = normalizeJobOrderPayload(body ?? {});

  if (!payload.title || !payload.companyName || !payload.description) {
    return NextResponse.json(
      { ok: false, error: "Title, company name, and description are required." },
      { status: 400 }
    );
  }

  const jobOrder = await prisma.recruiterJobOrder.create({
    data: {
      agencyId: context.agency.id,
      title: payload.title,
      companyName: payload.companyName,
      location: payload.location,
      employmentType: payload.employmentType,
      salaryMin: payload.salaryMin,
      salaryMax: payload.salaryMax,
      description: payload.description,
      requiredSkills: payload.requiredSkills,
      preferredSkills: payload.preferredSkills,
      requiredYearsExperience: payload.requiredYearsExperience,
      status: payload.status,
    },
  });

  return NextResponse.json({ ok: true, jobOrder });
}
