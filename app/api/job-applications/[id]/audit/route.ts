import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { buildProfileFieldMap, computeMissingFromFields } from "@/app/lib/jobApplicationAudit";
import { deriveSourceFromUrl, isGreenhouseUrl } from "@/app/lib/jobSources";
import { runAuditMode } from "@/app/lib/playwright/auditRunner";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  const application = await prisma.jobApplication.findFirst({
    where: { id, userProfile: { userId } },
    include: { userProfile: true },
  });

  if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });

  const resume = await prisma.resumeFile.findFirst({
    where: { profileId: application.userProfileId },
    orderBy: { createdAt: "desc" },
  });

  const fields = buildProfileFieldMap(application.userProfile, resume);
  const overrides = ((application.auditJson as Record<string, unknown> | null)?.overrides as Record<string, unknown> | undefined) ?? {};
  const computed = computeMissingFromFields(fields, overrides);

  const source = application.source ?? deriveSourceFromUrl(application.jobUrl ?? "");

  let auditItems: Awaited<ReturnType<typeof runAuditMode>>["auditItems"] = [];
  let action: string | undefined;
  let method: string | undefined;

  if (application.jobUrl && !isGreenhouseUrl(application.jobUrl)) {
    try {
      const scraped = await runAuditMode(application.jobUrl);
      auditItems = scraped.auditItems;
      action = scraped.action;
      method = scraped.method;
    } catch {
      auditItems = [];
    }
  }

  const nextStatus = computed.missing.length > 0 ? "NEEDS_INFO" : "READY_TO_APPLY";

  await prisma.jobApplication.update({
    where: { id: application.id },
    data: {
      source,
      missingFields: computed.missing,
      status: ["SUBMITTED", "NEEDS_VERIFICATION"].includes(application.status) ? application.status : nextStatus,
      auditJson: {
        fields,
        overrides,
        fieldStates: computed.fieldStates,
        action,
        method,
        auditItems,
      } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    status: ["SUBMITTED", "NEEDS_VERIFICATION"].includes(application.status) ? application.status : nextStatus,
    job: {
      id: application.id,
      source,
      jobUrl: application.jobUrl,
      title: application.title ?? application.jobTitle,
      company: application.company,
      location: application.location,
    },
    payload: {
      fields,
      missing: computed.missing,
      fieldStates: computed.fieldStates,
      action,
      method,
      fileFields: resume
        ? [
            {
              name: "resume",
              fileName: resume.fileName,
              mimeType: resume.mimeType,
              sizeBytes: resume.sizeBytes,
            },
          ]
        : [],
      auditItems,
    },
  });
}
