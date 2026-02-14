import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

const ALLOWED_STATUSES = [
  "IN_PREPARATION",
  "READY_TO_SEND",
  "IN_PROGRESS",
  "SENT",
] as const;

type ApplicationStatus = (typeof ALLOWED_STATUSES)[number];

type CreateApplicationBody = {
  jobTitle?: string;
  company?: string;
  status?: ApplicationStatus;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json({ ok: true, applications: [] });
    }

    const applications = await prisma.jobApplication.findMany({
      where: { userProfileId: profile.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        jobTitle: true,
        company: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, applications });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as CreateApplicationBody;
    const jobTitle = normalizeText(body.jobTitle);
    const company = normalizeText(body.company);
    const status = ALLOWED_STATUSES.includes(body.status as ApplicationStatus)
      ? (body.status as ApplicationStatus)
      : "IN_PREPARATION";

    if (!jobTitle || !company) {
      return NextResponse.json(
        { error: "Job title and company are required." },
        { status: 400 }
      );
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, email: session?.user?.email ?? null },
      update: {},
      select: { id: true },
    });

    const application = await prisma.jobApplication.create({
      data: {
        userProfileId: profile.id,
        jobTitle,
        company,
        status,
      },
      select: {
        id: true,
        jobTitle: true,
        company: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, application });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
