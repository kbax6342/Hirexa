import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { deriveSourceFromUrl, normalizeJobUrl } from "@/app/lib/jobSources";
import {
  detectApplyProviderFromJob,
  normalizeApplyProvider,
} from "@/app/lib/apply/providerDetection";

export const runtime = "nodejs";

type CreateBody = {
  jobTitle?: string;
  title?: string;
  company?: string;
  location?: string;
  jobUrl?: string;
  sourceJobId?: string;
  source?: string;
  applyProvider?: string;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as CreateBody;
    const title = normalizeText(body.title || body.jobTitle);
    const company = normalizeText(body.company);
    const location = normalizeText(body.location) || null;
    const jobUrl = normalizeJobUrl(normalizeText(body.jobUrl)) || null;
    const sourceJobId = normalizeText(body.sourceJobId) || null;
    const requestedSource = normalizeText(body.source).toLowerCase();
    const requestedApplyProvider = normalizeApplyProvider(body.applyProvider);
    const detectedApplyProvider =
      detectApplyProviderFromJob({
        source: requestedSource || null,
        jobUrl,
      }) ?? requestedApplyProvider;
    const source =
      requestedSource ||
      detectedApplyProvider ||
      deriveSourceFromUrl(jobUrl ?? "");

    if (!title || !company) {
      return NextResponse.json({ error: "jobTitle/title and company are required." }, { status: 400 });
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, email: session?.user?.email ?? null },
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
            jobTitle: title,
            title,
            source,
            company,
            location,
            jobUrl,
            sourceJobId,
            status: "READY_TO_APPLY",
          },
          update: {
            jobTitle: title,
            title,
            source,
            company,
            location,
            jobUrl,
            status: "READY_TO_APPLY",
          },
          select: { id: true },
        })
      : await prisma.jobApplication.create({
          data: {
            userProfileId: profile.id,
            jobTitle: title,
            title,
            source,
            company,
            location,
            jobUrl,
            status: "READY_TO_APPLY",
          },
          select: { id: true },
        });

    return NextResponse.json({ ok: true, applicationId: application.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
