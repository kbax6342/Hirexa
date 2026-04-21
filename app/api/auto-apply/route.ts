import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { readAutomationAudit } from "@/app/lib/apply/automationAudit";
import {
  detectApplyProviderFromJob,
  normalizeApplyProvider,
} from "@/app/lib/apply/providerDetection";
import { normalizeAdzunaProviderId } from "@/app/lib/jobs/adzunaProviderId";
import {
  deriveSourceFromUrl,
  isAggregatorHandoffUrl,
  isLikelyAtsUrl,
  isLikelyCompanyCareersUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

type AutoApplyBody = {
  sourceJobId?: string;
  jobTitle?: string;
  company?: string;
  location?: string;
  jobUrl?: string;
  preferredDirectUrl?: string;
  source?: string;
  applyProvider?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isTrustedDirectEmployerJobUrl(value: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(normalizeText(value));
  if (!normalizedUrl || isAggregatorHandoffUrl(normalizedUrl)) {
    return false;
  }

  return (
    isLikelyAtsUrl(normalizedUrl) || isLikelyCompanyCareersUrl(normalizedUrl)
  );
}

function chooseInitialApplicationJobUrl(values: Array<string | null | undefined>) {
  const normalizedCandidates = Array.from(
    new Set(
      values
        .map((value) => normalizeJobUrl(normalizeText(value)))
        .filter(Boolean),
    ),
  );

  return (
    normalizedCandidates.find((value) => isTrustedDirectEmployerJobUrl(value)) ??
    normalizedCandidates.find((value) => !isAggregatorHandoffUrl(value)) ??
    normalizedCandidates[0] ??
    null
  );
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as AutoApplyBody;
    const rawSourceJobId = normalizeText(body.sourceJobId) || null;
    const jobTitle = normalizeText(body.jobTitle);
    const company = normalizeText(body.company);
    const location = normalizeText(body.location) || null;
    const incomingJobUrl = normalizeJobUrl(normalizeText(body.jobUrl)) || null;
    const preferredDirectUrl =
      normalizeJobUrl(normalizeText(body.preferredDirectUrl)) || null;
    const requestedSource = normalizeText(body.source).toLowerCase();
    const requestedApplyProvider = normalizeApplyProvider(body.applyProvider);

    if (!jobTitle || !company) {
      return NextResponse.json(
        { error: "Job title and company are required." },
        { status: 400 }
      );
    }

    const sourceHint =
      requestedSource ||
      deriveSourceFromUrl(preferredDirectUrl ?? incomingJobUrl ?? "");
    const sourceJobLooksAdzuna = rawSourceJobId?.toLowerCase().startsWith("adzuna:");
    const sourceJobId =
      sourceHint === "adzuna" || sourceJobLooksAdzuna
        ? normalizeAdzunaProviderId(rawSourceJobId)
        : rawSourceJobId;
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        email: session?.user?.email ?? null,
      },
      update: {},
      select: { id: true },
    });
    const existingApplication = sourceJobId
      ? await prisma.jobApplication.findUnique({
          where: {
            userProfileId_sourceJobId: {
              userProfileId: profile.id,
              sourceJobId,
            },
          },
          select: {
            id: true,
            jobUrl: true,
            auditJson: true,
          },
        })
      : null;
    const existingAuditDebug = (existingApplication
      ? readAutomationAudit(existingApplication.auditJson).state.debug ?? {}
      : {}) as Record<string, unknown>;
    const jobUrl = chooseInitialApplicationJobUrl([
      preferredDirectUrl,
      normalizeJobUrl(
        normalizeText(existingAuditDebug.resolvedDirectUrl),
      ) || null,
      normalizeJobUrl(normalizeText(existingAuditDebug.targetUrl)) || null,
      normalizeJobUrl(normalizeText(existingApplication?.jobUrl)) || null,
      incomingJobUrl,
    ]);
    const detectedApplyProvider =
      detectApplyProviderFromJob({
        source: requestedSource || null,
        jobUrl,
      }) ?? requestedApplyProvider;
    const source =
      requestedSource ||
      detectedApplyProvider ||
      sourceHint ||
      deriveSourceFromUrl(jobUrl ?? "");

    console.log("[AUTO_APPLY_ROUTE] POST /api/auto-apply", {
      userId,
      sourceJobId,
      rawSourceJobId,
      source,
      applyProvider: detectedApplyProvider,
      preferredDirectUrl,
      incomingJobUrl,
      jobUrl,
      preservedExistingDirectUrl:
        jobUrl !== incomingJobUrl &&
        Boolean(existingApplication?.jobUrl || existingAuditDebug.resolvedDirectUrl),
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
            title: jobTitle,
            company,
            location,
            jobUrl,
            source,
            status: "IN_PROGRESS",
          },
          update: {
            jobTitle,
            title: jobTitle,
            company,
            location,
            jobUrl,
            source,
            status: "IN_PROGRESS",
          },
          select: { id: true },
        })
      : await prisma.jobApplication.create({
          data: {
            userProfileId: profile.id,
            jobTitle,
            title: jobTitle,
            company,
            location,
            jobUrl,
            source,
            status: "IN_PROGRESS",
          },
          select: { id: true },
        });

    console.log("[AUTO_APPLY_ROUTE] created application for auto-apply", {
      userId,
      applicationId: application.id,
      sourceJobId,
      source,
      applyProvider: detectedApplyProvider,
      sessionCreated: false,
      caller: "POST /api/auto-apply",
      sourcePath: "app/api/auto-apply/route.ts",
    });

    return NextResponse.json({ ok: true, applicationId: application.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
