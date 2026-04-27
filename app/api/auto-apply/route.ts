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
import { extractAtsJobIdentityFromUrl } from "@/app/lib/apply/atsUrlIdentity";
import {
  buildJobIdentitySnapshot,
  compareJobIdentitySnapshots,
  type JobIdentityMismatch,
  type JobIdentitySnapshot,
} from "@/app/lib/jobs/jobIdentity";

type AutoApplyBody = {
  sourceJobId?: string;
  jobTitle?: string;
  company?: string;
  location?: string;
  jobUrl?: string;
  preferredDirectUrl?: string;
  source?: string;
  applyProvider?: string;
  selectedJobIdentity?: JobIdentitySnapshot;
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

function buildIdentityMismatchResponse(
  expectedJob: JobIdentitySnapshot,
  actualJob: JobIdentitySnapshot,
  mismatches: JobIdentityMismatch[],
) {
  return NextResponse.json(
    {
      ok: false,
      code: "JOB_IDENTITY_MISMATCH",
      message: "Auto Apply blocked because the selected job changed before apply started.",
      error: "Auto Apply blocked because the selected job changed before apply started.",
      expectedJob,
      actualJob,
      mismatches,
    },
    { status: 409 },
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
    const selectedJobIdentity = body.selectedJobIdentity
      ? buildJobIdentitySnapshot(body.selectedJobIdentity)
      : null;

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

    const requestIdentity = buildJobIdentitySnapshot({
      source: requestedSource || sourceHint,
      sourceJobId,
      rawSourceJobId,
      title: jobTitle,
      company,
      location,
      jobUrl: incomingJobUrl,
      resolvedApplyUrl: preferredDirectUrl,
      applyProvider: requestedApplyProvider,
    });

    if (selectedJobIdentity) {
      console.log("[AUTO_APPLY_IDENTITY] received selected job identity", {
        expectedSourceJobId: selectedJobIdentity.sourceJobId,
        requestSourceJobId: requestIdentity.sourceJobId,
        expectedTitle: selectedJobIdentity.title,
        requestTitle: requestIdentity.title,
      });
      const comparison = compareJobIdentitySnapshots(
        selectedJobIdentity,
        requestIdentity,
      );
      if (!comparison.matches) {
        console.warn("[AUTO_APPLY_IDENTITY] mismatch blocked", {
          expectedJob: selectedJobIdentity,
          actualJob: requestIdentity,
          mismatches: comparison.mismatches,
        });
        return buildIdentityMismatchResponse(
          selectedJobIdentity,
          requestIdentity,
          comparison.mismatches,
        );
      }
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
            source: true,
            sourceJobId: true,
            jobTitle: true,
            title: true,
            company: true,
            location: true,
            auditJson: true,
          },
        })
      : null;
    const existingApplicationIdentity = existingApplication
      ? buildJobIdentitySnapshot({
          source: existingApplication.source,
          sourceJobId: existingApplication.sourceJobId,
          title: existingApplication.title ?? existingApplication.jobTitle,
          company: existingApplication.company,
          location: existingApplication.location,
          jobUrl: existingApplication.jobUrl,
        })
      : null;
    const existingIdentityComparison =
      selectedJobIdentity && existingApplicationIdentity
        ? compareJobIdentitySnapshots(
            selectedJobIdentity,
            existingApplicationIdentity,
          )
        : { matches: true, mismatches: [] as JobIdentityMismatch[] };
    if (selectedJobIdentity && existingApplicationIdentity) {
      if (!existingIdentityComparison.matches) {
        console.warn("[AUTO_APPLY_IDENTITY] existing application rejected due to sourceJobId mismatch", {
          existingApplicationId: existingApplication?.id,
          expectedJob: selectedJobIdentity,
          actualJob: existingApplicationIdentity,
          mismatches: existingIdentityComparison.mismatches,
        });
        return buildIdentityMismatchResponse(
          selectedJobIdentity,
          existingApplicationIdentity,
          existingIdentityComparison.mismatches,
        );
      }
      console.log("[AUTO_APPLY_IDENTITY] existing application matched selected job", {
        existingApplicationId: existingApplication?.id,
        sourceJobId,
      });
    }
    const existingAuditDebug = (existingApplication
      ? readAutomationAudit(existingApplication.auditJson).state.debug ?? {}
      : {}) as Record<string, unknown>;
    const canReuseExistingDirectUrl =
      Boolean(existingApplication) && existingIdentityComparison.matches;
    const jobUrl = chooseInitialApplicationJobUrl([
      preferredDirectUrl,
      canReuseExistingDirectUrl
        ? normalizeJobUrl(normalizeText(existingAuditDebug.resolvedDirectUrl)) || null
        : null,
      canReuseExistingDirectUrl
        ? normalizeJobUrl(normalizeText(existingAuditDebug.targetUrl)) || null
        : null,
      canReuseExistingDirectUrl
        ? normalizeJobUrl(normalizeText(existingApplication?.jobUrl)) || null
        : null,
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
    const actualIdentity = buildJobIdentitySnapshot({
      source,
      sourceJobId,
      rawSourceJobId,
      title: jobTitle,
      company,
      location,
      jobUrl: incomingJobUrl,
      resolvedApplyUrl: jobUrl,
      applyProvider: detectedApplyProvider,
    });
    if (selectedJobIdentity) {
      const comparison = compareJobIdentitySnapshots(
        selectedJobIdentity,
        actualIdentity,
      );
      if (!comparison.matches) {
        console.warn("[AUTO_APPLY_IDENTITY] mismatch blocked", {
          expectedJob: selectedJobIdentity,
          actualJob: actualIdentity,
          resolvedUrlIdentity: extractAtsJobIdentityFromUrl(jobUrl),
          mismatches: comparison.mismatches,
        });
        return buildIdentityMismatchResponse(
          selectedJobIdentity,
          actualIdentity,
          comparison.mismatches,
        );
      }
      console.log("[AUTO_APPLY_IDENTITY] validated", {
        sourceJobId,
        source,
        resolvedUrlIdentity: extractAtsJobIdentityFromUrl(jobUrl),
      });
    }

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
        canReuseExistingDirectUrl &&
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
