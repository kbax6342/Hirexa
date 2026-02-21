import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

type AutoApplyBody = {
  sourceJobId?: string;
  jobTitle?: string;
  company?: string;
  location?: string;
  jobUrl?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as AutoApplyBody;
    const sourceJobId = normalizeText(body.sourceJobId) || null;
    const jobTitle = normalizeText(body.jobTitle);
    const company = normalizeText(body.company);
    const location = normalizeText(body.location) || null;
    const jobUrl = normalizeText(body.jobUrl) || null;

    if (!jobTitle || !company) {
      return NextResponse.json(
        { error: "Job title and company are required." },
        { status: 400 }
      );
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        email: session?.user?.email ?? null,
      },
      update: {},
      select: { id: true },
    });

    const application = sourceJobId
      ? await prisma.jobApplication.upsert({
          where: {
            userProfileId_sourceJobId: {
              userProfileId: profile.id,
              sourceJobId,
            },
          },
          create: {
            userProfileId: profile.id,
            sourceJobId,
            jobTitle,
            company,
            location,
            jobUrl,
            status: "IN_PROGRESS",
          },
          update: {
            jobTitle,
            company,
            location,
            jobUrl,
            status: "IN_PROGRESS",
          },
          select: { id: true },
        })
      : await prisma.jobApplication.create({
          data: {
            userProfileId: profile.id,
            jobTitle,
            company,
            location,
            jobUrl,
            status: "IN_PROGRESS",
          },
          select: { id: true },
        });

    return NextResponse.json({ ok: true, applicationId: application.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
